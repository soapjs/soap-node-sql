import { SqlDataSource } from "./sql.source";
import { SqlQueryFactory } from "./sql.query-factory";
import { DbQueryFactory } from "@soapjs/soap";

/**
 * Factory for creating SQL data sources
 */
export class SqlSourceFactory {
    /**
     * Creates a new SQL data source
     */
    static async create<T = any>(config: any, collectionName?: string): Promise<SqlDataSource<T>> {
      return SqlDataSource.create<T>(config, collectionName);
    }
  
    /**
     * Creates a MySQL data source
     */
    static async createMySQL<T = any>(config: any, collectionName?: string): Promise<SqlDataSource<T>> {
      const mysqlConfig = { ...config, type: 'mysql' as const };
      return SqlDataSource.create<T>(mysqlConfig, collectionName);
    }
  
    /**
     * Creates a PostgreSQL data source
     */
    static async createPostgreSQL<T = any>(config: any, collectionName?: string): Promise<SqlDataSource<T>> {
      const postgresConfig = { ...config, type: 'postgresql' as const };
      return SqlDataSource.create<T>(postgresConfig, collectionName);
    }

    /**
     * Creates a SQL data source with custom DbQueryFactory
     */
    static async createWithQueryFactory<T = any>(
      config: any, 
      queryFactory: DbQueryFactory, 
      collectionName?: string
    ): Promise<SqlDataSource<T>> {
      return SqlDataSource.createWithQueryFactory<T>(config, queryFactory, collectionName);
    }

    /**
     * Creates a MySQL data source with custom DbQueryFactory
     */
    static async createMySQLWithQueryFactory<T = any>(
      config: any, 
      queryFactory: DbQueryFactory, 
      collectionName?: string
    ): Promise<SqlDataSource<T>> {
      const mysqlConfig = { ...config, type: 'mysql' as const };
      return SqlDataSource.createWithQueryFactory<T>(mysqlConfig, queryFactory, collectionName);
    }

    /**
     * Creates a PostgreSQL data source with custom DbQueryFactory
     */
    static async createPostgreSQLWithQueryFactory<T = any>(
      config: any, 
      queryFactory: DbQueryFactory, 
      collectionName?: string
    ): Promise<SqlDataSource<T>> {
      const postgresConfig = { ...config, type: 'postgresql' as const };
      return SqlDataSource.createWithQueryFactory<T>(postgresConfig, queryFactory, collectionName);
    }
  }
  
  /**
   * Main export for easy access
   */
  export const SqlSource = SqlDataSource;
  export const SqlFactory = SqlSourceFactory;
  