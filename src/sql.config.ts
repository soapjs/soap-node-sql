import { SqlConfig, MySqlConfig, PostgreSqlConfig, SqliteConfig, DatabaseType } from './sql.types';
import { PoolOptions } from 'mysql2/promise';
import { PoolConfig } from 'pg';

/**
 * Configuration class for SQL databases
 */
export class SqlDatabaseConfig {
  public readonly type: DatabaseType;
  public readonly host: string;
  public readonly port: number;
  public readonly database: string;
  public readonly username: string;
  public readonly password: string;
  public readonly connectionLimit: number;
  public readonly acquireTimeout: number;
  public readonly timeout: number;
  public readonly charset: string;
  public readonly filename?: string;
  public readonly mode?: number;
  public readonly verbose?: boolean;
  public readonly memory?: boolean;

  constructor(config: MySqlConfig | PostgreSqlConfig | SqliteConfig) {
    this.type = config.type;
    
    if (config.type === 'sqlite') {
      const sqliteConfig = config as SqliteConfig;
      this.filename = sqliteConfig.filename;
      this.mode = sqliteConfig.mode;
      this.verbose = sqliteConfig.verbose;
      this.memory = sqliteConfig.memory;
      // SQLite doesn't need these fields, but we'll set defaults for compatibility
      this.host = 'localhost';
      this.port = 0;
      this.database = sqliteConfig.filename;
      this.username = '';
      this.password = '';
      this.connectionLimit = 1;
      this.acquireTimeout = 60000;
      this.timeout = 60000;
      this.charset = 'utf8';
    } else {
      this.host = config.host;
      this.port = config.port;
      this.database = config.database;
      this.username = config.username;
      this.password = config.password;
      this.connectionLimit = config.connectionLimit || 10;
      this.acquireTimeout = config.acquireTimeout || 60000;
      this.timeout = config.timeout || 60000;
      this.charset = config.charset || 'utf8mb4';
    }
  }

  /**
   * Gets MySQL-specific configuration options
   */
  getMySqlOptions(): PoolOptions {
    if (this.type !== 'mysql') {
      throw new Error('Configuration is not for MySQL');
    }

    const config = this as MySqlConfig;
    
    return {
      host: this.host,
      port: this.port,
      user: this.username,
      password: this.password,
      database: this.database,
      connectionLimit: this.connectionLimit,
      // acquireTimeout is not supported in mysql2 PoolOptions
      // timeout is not supported in mysql2 PoolOptions
      charset: this.charset,
      ssl: config.ssl === false ? undefined : (config.ssl === true ? {} : config.ssl),
      timezone: config.timezone,
      dateStrings: config.dateStrings,
      supportBigNumbers: config.supportBigNumbers,
      bigNumberStrings: config.bigNumberStrings,
    };
  }

  /**
   * Gets PostgreSQL-specific configuration options
   */
  getPostgreSqlOptions(): PoolConfig {
    if (this.type !== 'postgresql') {
      throw new Error('Configuration is not for PostgreSQL');
    }

    const config = this as PostgreSqlConfig;
    
    return {
      host: this.host,
      port: this.port,
      user: this.username,
      password: this.password,
      database: this.database,
      max: this.connectionLimit,
      connectionTimeoutMillis: this.acquireTimeout,
      idleTimeoutMillis: this.timeout,
      ssl: config.ssl,
      application_name: config.applicationName,
    };
  }

  /**
   * Gets SQLite-specific configuration options
   */
  getSqliteOptions(): any {
    if (this.type !== 'sqlite') {
      throw new Error('Configuration is not for SQLite');
    }

    return {
      filename: this.filename,
      mode: this.mode,
      verbose: this.verbose,
      memory: this.memory,
    };
  }

  /**
   * Gets the connection string for the database
   */
  getConnectionString(): string {
    if (this.type === 'mysql') {
      return `mysql://${this.username}:${this.password}@${this.host}:${this.port}/${this.database}`;
    } else if (this.type === 'postgresql') {
      return `postgresql://${this.username}:${this.password}@${this.host}:${this.port}/${this.database}`;
    } else if (this.type === 'sqlite') {
      return `sqlite://${this.filename}`;
    }
    
    throw new Error(`Unsupported database type: ${this.type}`);
  }

  /**
   * Validates the configuration
   */
  validate(): void {
    if (this.type === 'sqlite') {
      // SQLite validation
      if (!this.filename) {
        throw new Error('Filename is required for SQLite');
      }
      if (this.connectionLimit < 1) {
        throw new Error('Connection limit must be at least 1');
      }
      if (this.acquireTimeout < 1000) {
        throw new Error('Acquire timeout must be at least 1000ms');
      }
      if (this.timeout < 1000) {
        throw new Error('Timeout must be at least 1000ms');
      }
    } else {
      // MySQL and PostgreSQL validation
      if (!this.host) {
        throw new Error('Host is required');
      }
      if (!this.port || this.port < 1 || this.port > 65535) {
        throw new Error('Port must be between 1 and 65535');
      }
      if (!this.database) {
        throw new Error('Database name is required');
      }
      if (!this.username) {
        throw new Error('Username is required');
      }
      if (this.connectionLimit < 1) {
        throw new Error('Connection limit must be at least 1');
      }
      if (this.acquireTimeout < 1000) {
        throw new Error('Acquire timeout must be at least 1000ms');
      }
      if (this.timeout < 1000) {
        throw new Error('Timeout must be at least 1000ms');
      }
    }
  }

  /**
   * Creates a copy of the configuration with overrides
   */
  clone(overrides: Partial<SqlConfig>): SqlDatabaseConfig {
    const newConfig = { ...this, ...overrides } as SqlConfig;
    
    if (newConfig.type === 'mysql') {
      return new SqlDatabaseConfig(newConfig as MySqlConfig);
    } else if (newConfig.type === 'postgresql') {
      return new SqlDatabaseConfig(newConfig as PostgreSqlConfig);
    } else if (newConfig.type === 'sqlite') {
      return new SqlDatabaseConfig(newConfig as SqliteConfig);
    }
    
    throw new Error(`Unsupported database type: ${(newConfig as any).type}`);
  }
}
