import { PoolConnection } from 'mysql2/promise';
import { PoolClient } from 'pg';
import { AnyObject } from '@soapjs/soap';
import { DatabaseSession } from '@soapjs/soap';
import { SqlConnectionError, SqlTransactionError } from './sql.errors';
import { SqlUtils } from './sql.utils';

export type SqlDatabaseType = 'mysql' | 'postgresql' | 'sqlite';
export type SqlConnectionProvider = () => Promise<PoolConnection | PoolClient | any>;

/**
 * SQL database session implementation
 */
export class SqlSession implements DatabaseSession {
  public readonly id: string;
  private _connection: PoolConnection | PoolClient | any;
  private _connectionProvider?: SqlConnectionProvider;
  private _databaseType: SqlDatabaseType;
  private _isTransaction: boolean = false;
  private _createdAt: Date;
  private _lastUsed: Date;

  constructor(
    id: string,
    connection: PoolConnection | PoolClient | any,
    databaseType: SqlDatabaseType,
    connectionProvider?: SqlConnectionProvider
  ) {
    this.id = id;
    this._connection = connection;
    this._databaseType = databaseType;
    this._connectionProvider = connectionProvider;
    this._createdAt = new Date();
    this._lastUsed = new Date();
  }

  /**
   * Gets the underlying database connection
   */
  get connection(): PoolConnection | PoolClient | any {
    this._lastUsed = new Date();
    return this._connection;
  }

  /**
   * Gets the database type
   */
  get databaseType(): SqlDatabaseType {
    return this._databaseType;
  }

  /**
   * Lazily gets the underlying connection. Transaction sessions created by
   * Soap's synchronous Transaction.init() cannot await a pool checkout until
   * the first async session operation.
   */
  private async getOrCreateConnection(): Promise<PoolConnection | PoolClient | any> {
    if (!this._connection) {
      if (!this._connectionProvider) {
        throw new SqlConnectionError('Connection is required');
      }

      this._connection = await this._connectionProvider();
    }

    this._lastUsed = new Date();
    return this._connection;
  }

  /**
   * Gets whether this session has an active transaction
   */
  get isTransaction(): boolean {
    return this._isTransaction;
  }

  /**
   * Gets when the session was created
   */
  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Gets when the session was last used
   */
  get lastUsed(): Date {
    return this._lastUsed;
  }

  /**
   * Ends the session and releases the connection
   */
  async end(options?: AnyObject): Promise<void> {
    try {
      if (this._isTransaction) {
        await this.rollbackTransaction();
      }

      if (!this._connection) {
        return;
      }

      if (this._databaseType === 'mysql') {
        const mysqlConnection = this._connection as PoolConnection;
        await mysqlConnection.release();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = this._connection as PoolClient;
        await pgClient.release();
      } else if (this._databaseType === 'sqlite') {
        // SQLite doesn't need explicit release
        // The connection will be closed when the database is closed
      }

      this._connection = undefined;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to end session: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Starts a transaction on this session
   */
  async startTransaction(options?: AnyObject): Promise<any> {
    if (this._isTransaction) {
      throw new SqlTransactionError(`Transaction already started on session: ${this.id}`);
    }

    try {
      const connection = await this.getOrCreateConnection();

      if (this._databaseType === 'mysql') {
        const mysqlConnection = connection as PoolConnection;
        await mysqlConnection.beginTransaction();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = connection as PoolClient;
        await pgClient.query('BEGIN');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = connection;
        return new Promise((resolve, reject) => {
          sqliteDb.run('BEGIN TRANSACTION', (err: any) => {
            if (err) reject(err);
            else {
              this._isTransaction = true;
              this._lastUsed = new Date();
              resolve(connection);
            }
          });
        });
      }
      
      this._isTransaction = true;
      this._lastUsed = new Date();
      
      return connection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to start transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  private async ensureTransactionStarted(): Promise<void> {
    if (!this._isTransaction) {
      await this.startTransaction();
    }
  }

  async executeQuery(sql: string, params?: any[]): Promise<any> {
    await this.ensureTransactionStarted();
    const connection = await this.getOrCreateConnection();

    try {
      if (this._databaseType === 'mysql') {
        const [rows] = await connection.query(sql, params);
        return rows;
      }

      if (this._databaseType === 'postgresql') {
        const convertedSql = SqlUtils.convertPlaceholders(sql, 'postgresql');
        const result = await connection.query(convertedSql, params);

        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          return result.rows;
        }

        return {
          rows: result.rows,
          rowCount: result.rowCount,
          affectedRows: result.rowCount,
          insertId: result.rows?.[0]?.id || undefined
        };
      }

      return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          connection.all(sql, params || [], (err: any, rows: any) => {
            if (err) reject(err);
            else resolve(rows);
          });
        } else {
          connection.run(sql, params || [], function(err: any) {
            if (err) {
              reject(err);
            } else {
              resolve({ affectedRows: this.changes, insertId: this.lastID });
            }
          });
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to execute query in transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Commits the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this._connection && !this._isTransaction) {
      return;
    }

    if (!this._isTransaction) {
      throw new SqlTransactionError(`No active transaction on session: ${this.id}`);
    }

    try {
      const connection = await this.getOrCreateConnection();

      if (this._databaseType === 'mysql') {
        const mysqlConnection = connection as PoolConnection;
        await mysqlConnection.commit();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = connection as PoolClient;
        await pgClient.query('COMMIT');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = connection;
        return new Promise<void>((resolve, reject) => {
          sqliteDb.run('COMMIT', (err: any) => {
            if (err) reject(err);
            else {
              this._isTransaction = false;
              this._lastUsed = new Date();
              resolve();
            }
          });
        });
      }
      
      this._isTransaction = false;
      this._lastUsed = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to commit transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Rollbacks the current transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this._isTransaction) {
      return;
    }

    try {
      const connection = await this.getOrCreateConnection();

      if (this._databaseType === 'mysql') {
        const mysqlConnection = connection as PoolConnection;
        await mysqlConnection.rollback();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = connection as PoolClient;
        await pgClient.query('ROLLBACK');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = connection;
        return new Promise<void>((resolve, reject) => {
          sqliteDb.run('ROLLBACK', (err: any) => {
            if (err) reject(err);
            else {
              this._isTransaction = false;
              this._lastUsed = new Date();
              resolve();
            }
          });
        });
      }
      
      this._isTransaction = false;
      this._lastUsed = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to rollback transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Updates the last used timestamp
   */
  updateLastUsed(): void {
    this._lastUsed = new Date();
  }

  /**
   * Checks if the session has expired
   */
  isExpired(timeoutMs: number = 300000): boolean {
    const now = new Date();
    return now.getTime() - this._lastUsed.getTime() > timeoutMs;
  }
}
