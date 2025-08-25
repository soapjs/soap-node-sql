import { Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import { Pool as PgPool, PoolClient, PoolConfig } from 'pg';

/**
 * Supported SQL database types
 */
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

/**
 * Base configuration interface for SQL databases
 */
export interface BaseSqlConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
  charset?: string;
}

/**
 * MySQL specific configuration
 */
export interface MySqlConfig extends BaseSqlConfig {
  type: 'mysql';
  ssl?: boolean | string | { rejectUnauthorized: boolean };
  timezone?: string;
  dateStrings?: boolean;
  supportBigNumbers?: boolean;
  bigNumberStrings?: boolean;
}

/**
 * PostgreSQL specific configuration
 */
export interface PostgreSqlConfig extends BaseSqlConfig {
  type: 'postgresql';
  ssl?: boolean | { rejectUnauthorized: boolean };
  timezone?: string;
  applicationName?: string;
}

/**
 * SQLite specific configuration
 */
export interface SqliteConfig extends BaseSqlConfig {
  type: 'sqlite';
  filename: string;
  mode?: number;
  verbose?: boolean;
  memory?: boolean;
}

/**
 * Union type for all SQL configurations
 */
export type SqlConfig = MySqlConfig | PostgreSqlConfig | SqliteConfig;

/**
 * SQL connection pool interface
 */
export interface SqlConnectionPool {
  getConnection(): Promise<SqlConnection>;
  end(): Promise<void>;
  query(sql: string, values?: any[]): Promise<SqlQueryResult>;
}

/**
 * SQL connection interface
 */
export interface SqlConnection {
  query(sql: string, values?: any[]): Promise<SqlQueryResult>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

/**
 * SQL query result interface
 */
export interface SqlQueryResult {
  rows: any[];
  rowCount?: number;
  affectedRows?: number;
  insertId?: number;
  fieldCount?: number;
  info?: string;
}

/**
 * SQL field mapping interface
 */
export interface SqlFieldMapping {
  name: string;
  type: string;
  transformer?: (value: any) => any;
  reverseTransformer?: (value: any) => any;
  nullable?: boolean;
  defaultValue?: any;
}

/**
 * SQL index definition interface
 */
export interface SqlIndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
  type?: string;
}

/**
 * SQL table definition interface
 */
export interface SqlTableDefinition {
  name: string;
  columns: SqlColumnDefinition[];
  indexes?: SqlIndexDefinition[];
  primaryKey?: string[];
  foreignKeys?: SqlForeignKeyDefinition[];
}

/**
 * SQL column definition interface
 */
export interface SqlColumnDefinition {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
  defaultValue?: any;
  autoIncrement?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
}

/**
 * SQL foreign key definition interface
 */
export interface SqlForeignKeyDefinition {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

/**
 * Query options interface for Source operations
 */
export interface QueryOptions {
  table?: string;
  fields?: string[];
  where?: Record<string, any>;
  orderBy?: Record<string, 'ASC' | 'DESC'> | string[];
  limit?: number;
  offset?: number;
  groupBy?: string[];
  having?: Record<string, any>;
  sort?: Record<string, 1 | -1> | Array<[string, 1 | -1]>;
  projection?: Record<string, 0 | 1>;
  skip?: number;
  hint?: any;
  collation?: any;
}

/**
 * Query result interface for Source operations
 */
export interface QueryResult {
  data: any[];
  count: number;
  insertId?: number;
  info?: string;
  affectedRows?: number;
}

/**
 * Field mapping interface for Source operations
 */
export interface FieldMapping {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: any;
  transformer?: (value: any) => any;
  reverseTransformer?: (value: any) => any;
}

/**
 * Table definition interface for Source operations
 */
export interface TableDefinition {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    length?: number;
    nullable?: boolean;
    defaultValue?: any;
    autoIncrement?: boolean;
    primaryKey?: boolean;
    unique?: boolean;
  }>;
  indexes?: IndexDefinition[];
  primaryKey?: string[];
  foreignKeys?: Array<{
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  }>;
}

/**
 * Index definition interface for Source operations
 */
export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
  type?: string;
}


/**
 * Insert options interface
 */
export interface InsertOptions {
  table: string;
  data: Record<string, any>;
  ignore?: boolean;
  onDuplicateKeyUpdate?: Record<string, any>;
}

/**
 * Update options interface
 */
export interface UpdateOptions {
  table: string;
  data: Record<string, any>;
  where?: Record<string, any>;
  limit?: number;
}

/**
 * Delete options interface
 */
export interface DeleteOptions {
  table: string;
  where?: Record<string, any>;
  limit?: number;
}
