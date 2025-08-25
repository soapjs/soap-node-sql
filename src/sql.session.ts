import { PoolConnection } from 'mysql2/promise';
import { PoolClient } from 'pg';
import { AnyObject } from '@soapjs/soap';
import { DatabaseSession } from '@soapjs/soap';
import { SqlConnectionError, SqlTransactionError } from './sql.errors';

/**
 * SQL database session implementation
 */
export class SqlSession implements DatabaseSession {
  public readonly id: string;
  private _connection: PoolConnection | PoolClient | any;
  private _databaseType: 'mysql' | 'postgresql' | 'sqlite';
  private _isTransaction: boolean = false;
  private _createdAt: Date;
  private _lastUsed: Date;

  constructor(
    id: string,
    connection: PoolConnection | PoolClient | any,
    databaseType: 'mysql' | 'postgresql' | 'sqlite'
  ) {
    this.id = id;
    this._connection = connection;
    this._databaseType = databaseType;
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
  get databaseType(): 'mysql' | 'postgresql' | 'sqlite' {
    return this._databaseType;
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
      if (this._databaseType === 'mysql') {
        const mysqlConnection = this._connection as PoolConnection;
        await mysqlConnection.beginTransaction();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = this._connection as PoolClient;
        await pgClient.query('BEGIN');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = this._connection;
        return new Promise((resolve, reject) => {
          sqliteDb.run('BEGIN TRANSACTION', (err: any) => {
            if (err) reject(err);
            else resolve(this._connection);
          });
        });
      }
      
      this._isTransaction = true;
      this._lastUsed = new Date();
      
      return this._connection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to start transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Commits the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this._isTransaction) {
      throw new SqlTransactionError(`No active transaction on session: ${this.id}`);
    }

    try {
      if (this._databaseType === 'mysql') {
        const mysqlConnection = this._connection as PoolConnection;
        await mysqlConnection.commit();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = this._connection as PoolClient;
        await pgClient.query('COMMIT');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = this._connection;
        return new Promise<void>((resolve, reject) => {
          sqliteDb.run('COMMIT', (err: any) => {
            if (err) reject(err);
            else resolve();
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
      throw new SqlTransactionError(`No active transaction on session: ${this.id}`);
    }

    try {
      if (this._databaseType === 'mysql') {
        const mysqlConnection = this._connection as PoolConnection;
        await mysqlConnection.rollback();
      } else if (this._databaseType === 'postgresql') {
        const pgClient = this._connection as PoolClient;
        await pgClient.query('ROLLBACK');
      } else if (this._databaseType === 'sqlite') {
        const sqliteDb = this._connection;
        return new Promise<void>((resolve, reject) => {
          sqliteDb.run('ROLLBACK', (err: any) => {
            if (err) reject(err);
            else resolve();
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
