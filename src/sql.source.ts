import { Source, DatabaseSession, DbQuery } from '@soapjs/soap';
import { SoapSQL } from './soap.sql';
import { SqlQueryFactory } from './sql.query-factory';
import { SqlFieldResolver } from './sql.field-resolver';
import { SqlTransformers } from './sql.transformers';
import { SqlSessionManager } from './sql.session-manager';
import { SqlTransaction } from './sql.transaction';

import { SqlUtils } from './sql.utils';
import { 
  SqlConfig, 
  SqlFieldMapping, 
  SqlIndexDefinition, 
  SqlTableDefinition,
  QueryOptions,
  QueryResult,
  FieldMapping,
  TableDefinition,
  IndexDefinition
} from './sql.types';
import { SqlConnectionError, SqlQueryError } from './sql.errors';

/**
 * SQL Data Source implementation for SoapJS
 * Supports both MySQL and PostgreSQL with engine-agnostic API
 */
export class SqlDataSource<T> implements Source<T> {
  private _soapSql: SoapSQL;
  private _queryFactory: SqlQueryFactory<T>;
  private _dbQueryFactory?: any; // DbQueryFactory implementation
  private _fieldResolver: SqlFieldResolver<any>;
  private _transformers: SqlTransformers;
  private _sessionManager: SqlSessionManager;
  private _databaseType: 'mysql' | 'postgresql' | 'sqlite';
  private _collectionName: string;

  constructor(soapSql: SoapSQL, collectionName: string = 'default', dbQueryFactory?: any) {
    this._soapSql = soapSql;
    this._databaseType = soapSql.databaseType || 'mysql';
    this._queryFactory = new SqlQueryFactory(this._databaseType);
    this._dbQueryFactory = dbQueryFactory;
    this._fieldResolver = new SqlFieldResolver<any>({}, this._databaseType);
    this._transformers = new SqlTransformers();
    this._sessionManager = soapSql.sessions;
    this._collectionName = collectionName;
  }

  /**
   * Gets the collection name
   */
  get collectionName(): string {
    return this._collectionName;
  }

  /**
   * Creates a new SQL data source
   */
  public static async create<T = any>(config: SqlConfig, collectionName?: string): Promise<SqlDataSource<T>> {
    const soapSql = await SoapSQL.create(config as any);
    return new SqlDataSource<T>(soapSql, collectionName);
  }

  /**
   * Creates a new SQL data source with custom DbQueryFactory
   */
  public static async createWithQueryFactory<T = any>(
    config: SqlConfig, 
    queryFactory: any, 
    collectionName?: string
  ): Promise<SqlDataSource<T>> {
    const soapSql = await SoapSQL.create(config as any);
    return new SqlDataSource<T>(soapSql, collectionName, queryFactory);
  }

  /**
   * Executes a raw SQL query
   */
  async query(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult> {
    try {
      const result = await this._soapSql.query(sql, params);
      
      return {
        data: result.rows || result || [],
        count: result.rowCount || result.affectedRows || 0,
        insertId: result.insertId,
        info: result.info,
        affectedRows: result.affectedRows
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Query execution failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Finds documents/records based on criteria
   */
  async find(query?: DbQuery): Promise<T[]> {
    try {

      
      if (!query || typeof query === 'string') {
        // Handle simple collection name or criteria
        const collection = (query as string) || this._collectionName;
        const queryOptions = {
          table: collection,
          where: {},
          fields: [],
          limit: 1000
        };

        const sqlQuery = this._queryFactory.buildFindQuery(collection, {}, queryOptions);
        const result = await this.query(sqlQuery.sql, sqlQuery.params);
        return result.data as T[];
      }

      // Handle complex query object
      const queryObj = query as any;
      const collection = queryObj.collection || this._collectionName;
      const criteria = queryObj.criteria || queryObj.where || {};
      const options = queryObj.options || {};
      
      const queryOptions = {
        table: collection,
        where: criteria,
        fields: options?.fields,
        orderBy: options?.orderBy || options?.sort,
        limit: options?.limit,
        offset: options?.offset || options?.skip,
        groupBy: options?.groupBy,
        having: options?.having
      };


      const sqlQuery = this._queryFactory.buildFindQuery(collection, criteria, queryOptions);
      
      const result = await this.query(sqlQuery.sql, sqlQuery.params);
      return result.data as T[];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Find operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Finds a single document/record
   */
  async findOne(collection: string, criteria?: any, options?: QueryOptions): Promise<any> {
    try {
      const queryOptions = {
        table: collection,
        where: criteria,
        fields: options?.fields,
        limit: 1
      };

      const query = this._queryFactory.buildFindOneQuery(collection, criteria, queryOptions);
      const result = await this.query(query.sql, query.params, options);
      return result.data[0] || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`FindOne operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Inserts a document/record
   */
  async insert(query: DbQuery): Promise<T[]> {
    try {
      const queryObj = query as any;
      const collection = queryObj.collection || this._collectionName;
      const data = queryObj.data || queryObj.documents || queryObj;
      const options = queryObj.options || {};

      // Handle both single objects and arrays
      if (Array.isArray(data)) {
        // If data is an array, perform insert for each element
        const results: T[] = [];
        for (const item of data) {
          const insertQuery = this._queryFactory.buildInsertQuery({ 
            table: collection, 
            data: item,
            ignore: options?.hint?.ignore,
            onDuplicateKeyUpdate: options?.hint?.onDuplicateKeyUpdate
          });
          const result = await this.query(insertQuery.sql, insertQuery.params, options);
          // For INSERT we return inserted data, not result.data
          const insertedItem = { ...item, id: result.insertId };
          results.push(insertedItem as T);
        }
        return results;
      } else {
        // If data is a single object
        const insertQuery = this._queryFactory.buildInsertQuery({ 
          table: collection, 
          data,
          ignore: options?.hint?.ignore,
          onDuplicateKeyUpdate: options?.hint?.onDuplicateKeyUpdate
        });
        const result = await this.query(insertQuery.sql, insertQuery.params, options);
        // For INSERT we return inserted data, not result.data
        return [{ ...data, id: result.insertId } as T];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Insert operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Updates documents/records
   */
  async update(query: DbQuery): Promise<any> {
    try {
      const queryObj = query as any;
      const collection = queryObj.collection || this._collectionName;
      const criteria = queryObj.criteria || queryObj.where || {};
      const data = queryObj.data || queryObj.update || {};
      const options = queryObj.options || {};

      const updateQuery = this._queryFactory.buildUpdateQuery({ 
        table: collection, 
        data, 
        where: criteria,
        limit: options?.limit
      });
      const result = await this.query(updateQuery.sql, updateQuery.params, options);
      return {
        modifiedCount: result.affectedRows || 0,
        upsertedCount: 0,
        matchedCount: result.affectedRows || 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Update operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Removes documents/records (alias for delete)
   */
  async remove(query: DbQuery): Promise<any> {
    const queryObj = query as any;
    return this.delete(queryObj.collection || this._collectionName, queryObj.criteria || queryObj.where, queryObj.options);
  }

  /**
   * Deletes documents/records
   */
  async delete(collection: string, criteria?: any, options?: QueryOptions): Promise<QueryResult> {
    try {
      const query = this._queryFactory.buildDeleteQuery({ 
        table: collection, 
        where: criteria,
        limit: options?.limit
      });
      return await this.query(query.sql, query.params, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Delete operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Aggregates documents/records
   */
  async aggregate<AggregationType = T>(query: DbQuery): Promise<AggregationType[]> {
    try {
      // Handle query object
      const queryObj = query as any;
      const pipeline = queryObj.pipeline || [];
      
      // Convert MongoDB aggregation pipeline to SQL
      const sqlQuery = this._convertAggregationPipeline(pipeline);
      const result = await this.query(sqlQuery.sql, sqlQuery.params);
      return result.data as AggregationType[];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Aggregate operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Counts documents/records
   */
  async count(query?: DbQuery): Promise<number> {
    try {
      if (!query) {
        // Count all documents in the collection
        const queryOptions = {
          table: this._collectionName,
          where: {},
          fields: ['COUNT(*) as count']
        };

        const countQuery = this._queryFactory.buildCountQuery(queryOptions);
        const result = await this.query(countQuery.sql, countQuery.params);
        return parseInt(result.data[0]?.count) || 0;
      }

      // Handle query object
      const queryObj = query as any;
      const collection = queryObj.collection || this._collectionName;
      const criteria = queryObj.criteria || queryObj.where || {};
      const options = queryObj.options || {};

      const queryOptions = {
        table: collection,
        where: criteria,
        fields: ['COUNT(*) as count'],
        groupBy: options?.groupBy,
        having: options?.having
      };

      const countQuery = this._queryFactory.buildCountQuery(queryOptions);
      const result = await this.query(countQuery.sql, countQuery.params, options);
      return parseInt(result.data[0]?.count) || 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Count operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Creates a new collection/table
   */
  async createCollection(name: string, definition: TableDefinition): Promise<void> {
    try {
      const sqlDefinition = this._convertTableDefinition(definition);
      const query = this._queryFactory.buildCreateTableQuery(name, sqlDefinition);
      await this.query(query.sql, query.params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Create collection failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Drops a collection/table
   */
  async dropCollection(name: string): Promise<void> {
    try {
      const query = this._queryFactory.buildDropTableQuery(name);
      await this.query(query.sql, query.params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Drop collection failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Creates an index
   */
  async createIndex(collection: string, index: IndexDefinition): Promise<void> {
    try {
      const sqlIndex = this._convertIndexDefinition(index);
      const query = this._queryFactory.buildCreateIndexQuery(collection, sqlIndex);
      await this.query(query.sql, query.params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Create index failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Drops an index
   */
  async dropIndex(collection: string, indexName: string): Promise<void> {
    try {
      const query = this._queryFactory.buildDropIndexQuery(collection, indexName);
      await this.query(query.sql, query.params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Drop index failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Gets field mappings for a collection
   */
  async getFieldMappings(collection: string): Promise<FieldMapping[]> {
    try {
      const query = this._queryFactory.buildDescribeTableQuery(collection);
      const result = await this.query(query.sql, query.params);
      
      return result.data.map((row: any) => ({
        name: row.Field || row.column_name,
        type: row.Type || row.data_type,
        nullable: row.Null === 'YES' || row.is_nullable === 'YES',
        defaultValue: row.Default || row.column_default
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Get field mappings failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Starts a transaction
   */
  async beginTransaction(): Promise<SqlTransaction> {
    try {
      let connection;
      if (this._databaseType === 'mysql') {
        connection = await this._soapSql.mysqlPool?.getConnection();
      } else {
        connection = await this._soapSql.postgresqlPool?.connect();
      }
      
      if (!connection) {
        throw new Error('No connection available');
      }

      const session = this._sessionManager.createSession(
        connection,
        this._databaseType
      );
      await session.startTransaction();
      return { 
        id: session.id, 
        sessionId: session.id, 
        isActive: true, 
        createdAt: new Date(), 
        lastUsed: new Date() 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to begin transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Commits a transaction
   */
  async commitTransaction(session: DatabaseSession): Promise<void> {
    try {
      await session.commitTransaction();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to commit transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Rolls back a transaction
   */
  async rollbackTransaction(session: DatabaseSession): Promise<void> {
    try {
      await session.rollbackTransaction();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to rollback transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Creates a new database session (matches MongoDB API)
   */
  async createSession(): Promise<DatabaseSession> {
    const connection = await this._soapSql.getConnection();
    const session = this._sessionManager.createSession(connection, this._databaseType);
    return session;
  }

  /**
   * Ends a session (matches MongoDB API)
   */
  async endSession(session: DatabaseSession): Promise<void> {
    await session.end();
  }

  /**
   * Starts a transaction on the current session (matches MongoDB API)
   */
  async startTransaction(session: DatabaseSession): Promise<void> {
    await session.startTransaction();
  }



  /**
   * Closes the data source
   */
  async close(): Promise<void> {
    try {
      await this._soapSql.close();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlConnectionError(`Failed to close data source: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Checks if the data source is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      return await this._soapSql.isHealthy();
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the database type
   */
  getDatabaseType(): 'mysql' | 'postgresql' | 'sqlite' {
    return this._databaseType;
  }

  /**
   * Converts MongoDB aggregation pipeline to SQL
   */
  private _convertAggregationPipeline(pipeline: any[]): { sql: string; params: any[] } {
    // Simple implementation - can be extended for complex pipelines
    let sql = `SELECT * FROM ${this._collectionName}`;
    const params: any[] = [];

    for (const stage of pipeline) {
      if (stage.$match) {
        const whereClause = SqlUtils.buildWhereClause(stage.$match, this._databaseType);
        sql += ` WHERE ${whereClause.sql}`;
        params.push(...whereClause.params);
      } else if (stage.$limit) {
        sql += ` LIMIT ${stage.$limit}`;
      } else if (stage.$skip) {
        sql += ` OFFSET ${stage.$skip}`;
      }
    }

    return { sql, params };
  }

  /**
   * Converts generic table definition to SQL-specific definition
   */
  private _convertTableDefinition(definition: TableDefinition): SqlTableDefinition {
    return {
      name: definition.name,
      columns: definition.columns.map(col => ({
        name: col.name,
        type: col.type,
        length: col.length,
        nullable: col.nullable,
        defaultValue: col.defaultValue,
        autoIncrement: col.autoIncrement,
        primaryKey: col.primaryKey,
        unique: col.unique
      })),
      indexes: definition.indexes?.map(idx => this._convertIndexDefinition(idx)),
      primaryKey: definition.primaryKey,
      foreignKeys: definition.foreignKeys?.map(fk => ({
        name: fk.name,
        columns: fk.columns,
        referencedTable: fk.referencedTable,
        referencedColumns: fk.referencedColumns,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate
      }))
    };
  }

  /**
   * Converts generic index definition to SQL-specific definition
   */
  private _convertIndexDefinition(index: IndexDefinition): SqlIndexDefinition {
    return {
      name: index.name,
      columns: index.columns,
      unique: index.unique,
      type: index.type
    };
  }
}
