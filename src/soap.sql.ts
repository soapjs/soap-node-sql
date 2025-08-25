import { Pool } from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import { SqlDatabaseConfig } from './sql.config';
import { SqlUtils } from './sql.utils';
import { SqlSessionManager } from './sql.session-manager';
import { SqlConnectionError, SqlConfigError } from './sql.errors';

/**
 * Represents a SQL data source for SoapJS
 */
export class SoapSQL {
  private _mysqlPool?: Pool;
  private _postgresqlPool?: PgPool;
  private _sqliteDb?: any;
  private _sessions: SqlSessionManager;
  private _config?: SqlDatabaseConfig;

  /**
   * Creates a new SoapSQL instance and establishes a connection to the SQL server.
   * @param {SqlDatabaseConfig} config - The configuration object for the SQL connection.
   * @returns {Promise<SoapSQL>} A promise that resolves to a new SoapSQL instance.
   */
  public static async create(config: SqlDatabaseConfig): Promise<SoapSQL> {
    try {
      config.validate();
      
      const instance = new SoapSQL();
      await instance.initialize(config);
      
      return instance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConfigError(`Failed to create SoapSQL instance: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Private constructor - use create() method instead
   */
  private constructor() {
    this._sessions = new SqlSessionManager();
  }

  /**
   * Initializes the SQL connection pools
   */
  private async initialize(config: SqlDatabaseConfig): Promise<void> {
    this._config = config;
    try {
      if (config.type === 'mysql') {
        const { createPool } = await import('mysql2/promise');
        const options = config.getMySqlOptions();
        this._mysqlPool = createPool(options);
        
        // Test the connection
        const connection = await this._mysqlPool.getConnection();
        connection.release();
      } else if (config.type === 'postgresql') {
        const { Pool } = await import('pg');
        const options = config.getPostgreSqlOptions();
        this._postgresqlPool = new Pool(options);
        
        // Test the connection
        const client = await this._postgresqlPool.connect();
        client.release();
      } else if (config.type === 'sqlite') {
        const sqlite3 = await import('sqlite3');
        const options = config.getSqliteOptions();

        // Create SQLite database instance
        const db = new sqlite3.Database(
          options.filename || ':memory:',
          options.mode
        );
        
        this._sqliteDb = db;
        
        // Test the connection with a simple query
        await new Promise<void>((resolve, reject) => {
          db.get('SELECT 1', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } else {
        throw new Error(`Unsupported database type: ${config.type}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to initialize SQL connection: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Gets the session manager for transactions
   */
  get sessions(): SqlSessionManager {
    return this._sessions;
  }

  /**
   * Gets the MySQL connection pool
   */
  get mysqlPool(): Pool | undefined {
    return this._mysqlPool;
  }

  /**
   * Gets the PostgreSQL connection pool
   */
  get postgresqlPool(): PgPool | undefined {
    return this._postgresqlPool;
  }

  /**
   * Gets the SQLite database instance
   */
  get sqliteDb(): any | undefined {
    return this._sqliteDb;
  }

  /**
   * Gets the database type
   */
  get databaseType(): 'mysql' | 'postgresql' | 'sqlite' | undefined {
    if (this._mysqlPool) return 'mysql';
    if (this._postgresqlPool) return 'postgresql';
    if (this._sqliteDb) return 'sqlite';
    return undefined;
  }

  /**
   * Gets connection pool statistics
   */
  async getConnectionPoolStats(): Promise<any> {
    try {
      if (this._mysqlPool) {
        const connection = await this._mysqlPool.getConnection();
        const [rows] = await connection.query('SHOW STATUS LIKE "Threads_connected"');
        connection.release();
        return { connections: (rows as any)[0]?.Value || 0 };
      }
      
      if (this._postgresqlPool) {
        const client = await this._postgresqlPool.connect();
        const result = await client.query('SELECT count(*) as connections FROM pg_stat_activity');
        client.release();
        return { connections: parseInt((result.rows as any)[0]?.connections || '0') };
      }

      if (this._sqliteDb) {
        return new Promise((resolve) => {
          this._sqliteDb.get('SELECT COUNT(*) as connections FROM sqlite_master', (err: any, row: any) => {
            if (err) {
              resolve({ connections: 0, error: err.message });
            } else {
              resolve({ connections: 1, tables: row?.connections || 0 });
            }
          });
        });
      }
      
      return { error: 'No connection pool available' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to get connection pool stats: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Gets server status information
   */
  async getServerStatus(): Promise<any> {
    try {
      if (this._mysqlPool) {
        const connection = await this._mysqlPool.getConnection();
        const [rows] = await connection.query('SHOW STATUS');
        connection.release();
        return { status: rows };
      }
      
      if (this._postgresqlPool) {
        const client = await this._postgresqlPool.connect();
        const result = await client.query('SELECT version() as version');
        client.release();
        return { version: result.rows[0]?.version };
      }

      if (this._sqliteDb) {
        return new Promise((resolve) => {
          this._sqliteDb.get('SELECT sqlite_version() as version', (err: any, row: any) => {
            if (err) {
              resolve({ error: err.message });
            } else {
              resolve({ version: row?.version });
            }
          });
        });
      }
      
      return { error: 'No connection pool available' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to get server status: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Executes a raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    try {
      if (this._mysqlPool) {
        const connection = await this._mysqlPool.getConnection();
        try {
          const [rows] = await connection.query(sql, params);
          return rows;
        } finally {
          connection.release();
        }
      }
      
      if (this._postgresqlPool) {
        const client = await this._postgresqlPool.connect();
        try {
          // Convert placeholders for PostgreSQL
          const convertedSql = SqlUtils.convertPlaceholders(sql, 'postgresql');
          const result = await client.query(convertedSql, params);
          
          // Return appropriate data based on query type
          if (sql.trim().toUpperCase().startsWith('SELECT')) {
            return result.rows;
          } else {
            // For INSERT, UPDATE, DELETE return additional info
            return {
              rows: result.rows,
              rowCount: result.rowCount,
              affectedRows: result.rowCount,
              insertId: result.rows?.[0]?.id || undefined
            };
          }
        } finally {
          client.release();
        }
      }

      if (this._sqliteDb) {
        return new Promise((resolve, reject) => {
          if (sql.trim().toUpperCase().startsWith('SELECT')) {
            this._sqliteDb.all(sql, params || [], (err: any, rows: any) => {
              if (err) {
                reject(err);
              } else {
                resolve(rows);
              }
            });
          } else {
            this._sqliteDb.run(sql, params || [], function(err: any) {
              if (err) {
                reject(err);
              } else {
                resolve({ affectedRows: this.changes, insertId: this.lastID });
              }
            });
          }
        });
      }
      
      throw new Error('No connection pool available');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to execute query: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Closes all database connections
   */
  async close(): Promise<void> {
    try {
      // Close all active sessions first
      if (this._sessions) {
        await this._sessions.closeAllSessions();
      }

      if (this._mysqlPool) {
        await this._mysqlPool.end();
        this._mysqlPool = undefined;
      }
      
      if (this._postgresqlPool) {
        await this._postgresqlPool.end();
        this._postgresqlPool = undefined;
      }

      if (this._sqliteDb) {
        return new Promise((resolve, reject) => {
          this._sqliteDb.close((err: any) => {
            if (err) {
              reject(err);
            } else {
              this._sqliteDb = undefined;
              resolve();
            }
          });
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to close connections: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Checks if the database connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (this._mysqlPool) {
        const connection = await this._mysqlPool.getConnection();
        await connection.ping();
        connection.release();
        return true;
      }
      
      if (this._postgresqlPool) {
        const client = await this._postgresqlPool.connect();
        await client.query('SELECT 1');
        client.release();
        return true;
      }

      if (this._sqliteDb) {
        return new Promise((resolve) => {
          this._sqliteDb.get('SELECT 1', (err: any) => {
            resolve(!err);
          });
        });
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Gets database information
   */
  async getDatabaseInfo(): Promise<any> {
    try {
      if (this._mysqlPool) {
        const connection = await this._mysqlPool.getConnection();
        try {
          const [rows] = await connection.query('SELECT DATABASE() as database_name, VERSION() as version');
          return (rows as any)[0];
        } finally {
          connection.release();
        }
      }
      
      if (this._postgresqlPool) {
        const client = await this._postgresqlPool.connect();
        try {
          const result = await client.query('SELECT current_database() as database_name, version() as version');
          return result.rows[0];
        } finally {
          client.release();
        }
      }

      if (this._sqliteDb) {
        return new Promise((resolve) => {
          this._sqliteDb.get('SELECT ? as database_name, sqlite_version() as version', [this._config?.database || 'sqlite'], (err: any, row: any) => {
            if (err) {
              resolve({ error: err.message });
            } else {
              resolve(row);
            }
          });
        });
      }
      
      return { error: 'No connection pool available' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to get database info: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Gets a database connection from the pool
   */
  async getConnection(): Promise<any> {
    if (this._mysqlPool) {
      return await this._mysqlPool.getConnection();
    }
    
    if (this._postgresqlPool) {
      return await this._postgresqlPool.connect();
    }

    if (this._sqliteDb) {
      // SQLite doesn't have connection pooling, return the database instance
      return this._sqliteDb;
    }
    
    throw new Error('No connection pool available');
  }
}
