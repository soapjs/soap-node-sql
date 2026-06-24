import {
  Source,
  SourceOptions,
  DatabaseSession,
  DbQuery,
  RepositoryQuery,
  FindParams,
  CountParams,
  RemoveParams,
  AggregationParams,
  UpdateParams,
} from '@soapjs/soap';
import { SoapSQL } from './soap.sql';
import { SqlQueryFactory } from './sql.query-factory';
import { SqlFieldResolver } from './sql.field-resolver';
import { SqlTransformers } from './sql.transformers';
import { SqlSessionManager } from './sql.session-manager';
import { SqlTransaction } from './sql.transaction';
import {
  PerformanceConfig,
  QueryPerformanceData,
  SqlPerformanceMetrics,
  SqlPerformanceMonitor,
} from './sql.performance';

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

export type SqlSourceOptions<T> = SourceOptions<T> & {
  performanceMonitoring?: Partial<PerformanceConfig> & {
    maxMetrics?: number;
    metricsCollector?: (metrics: QueryPerformanceData) => void;
  };
};

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
  private _performanceMonitor: SqlPerformanceMonitor;
  public readonly options?: SqlSourceOptions<T>;

  constructor(soapSql: SoapSQL, collectionName: string = 'default', optionsOrQueryFactory?: SqlSourceOptions<T> | any) {
    this._soapSql = soapSql;
    this._databaseType = soapSql.databaseType || 'mysql';
    this.options = this._normalizeSourceOptions(optionsOrQueryFactory);
    this._dbQueryFactory = this.options?.queries || (this.options ? undefined : optionsOrQueryFactory);
    this._queryFactory = (this._dbQueryFactory as SqlQueryFactory<T>) || new SqlQueryFactory(this._databaseType);
    this._fieldResolver = new SqlFieldResolver<any>(
      {
        modelClass: this.options?.modelClass,
        modelFieldMappings: this.options?.modelFieldMappings,
      },
      this._databaseType
    );
    this._transformers = new SqlTransformers();
    this._sessionManager = soapSql.sessions;
    this._collectionName = collectionName;
    this._performanceMonitor = this._createPerformanceMonitor(this.options?.performanceMonitoring);
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
  public static async create<T = any>(
    config: SqlConfig,
    collectionName?: string,
    options?: SqlSourceOptions<T>
  ): Promise<SqlDataSource<T>> {
    const soapSql = await SoapSQL.create(config as any);
    return new SqlDataSource<T>(soapSql, collectionName, options);
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
    const startTime = Date.now();
    try {
      const transactionSession =
        typeof (this._sessionManager as any).getCurrentTransactionSession === 'function'
          ? this._sessionManager.getCurrentTransactionSession()
          : undefined;
      const result = transactionSession
        ? await transactionSession.executeQuery(sql, params)
        : await this._soapSql.query(sql, params);
      const queryResult = {
        data: result.rows || result || [],
        count: result.rowCount || result.affectedRows || 0,
        insertId: result.insertId,
        info: result.info,
        affectedRows: result.affectedRows
      };
      this._recordPerformance(sql, params || [], startTime, true, undefined, queryResult.affectedRows || queryResult.count);
      return queryResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._recordPerformance(sql, params || [], startTime, false, errorMessage);
      throw new SqlQueryError(`Query execution failed: ${errorMessage}`, errorMessage);
    }
  }

  getPerformanceMetrics(): SqlPerformanceMetrics {
    return this._performanceMonitor.getMetrics();
  }

  getPerformanceSummary(): ReturnType<SqlPerformanceMonitor['getPerformanceSummary']> {
    return this._performanceMonitor.getPerformanceSummary();
  }

  getSlowQueries(threshold?: number): QueryPerformanceData[] {
    return this._performanceMonitor.getSlowQueries(threshold);
  }

  getRecentQueries(limit?: number): QueryPerformanceData[] {
    return this._performanceMonitor.getRecentQueries(limit);
  }

  resetPerformanceMetrics(): void {
    this._performanceMonitor.resetMetrics();
  }

  /**
   * Finds documents/records based on criteria.
   *
   * Accepts (in priority order):
   *   1. `RepositoryQuery`              — built into a DbQuery and re-dispatched.
   *   2. Pre-built `{ sql, params }`    — executed verbatim.
   *   3. Soap params (FindParams)       — recognised either by `instanceof
   *                                        FindParams` or by carrying a `Where`
   *                                        instance on `where`. Routed through
   *                                        `SqlQueryFactory.createFindQuery` so
   *                                        the WHERE clause goes through
   *                                        `SqlWhereParser` and `limit/offset`
   *                                        are honoured. The legacy
   *                                        `buildWhereClause` path treats
   *                                        `Where` like a plain object and
   *                                        silently drops the clause; it also
   *                                        ignores top-level `limit/offset` on
   *                                        a `FindParams` instance, returning
   *                                        every row.
   *   4. Legacy `{ collection?, criteria|where?, options? }` plain object.
   */
  async find(query?: DbQuery | FindParams | RepositoryQuery): Promise<T[]> {
    try {
      if (RepositoryQuery.isQueryBuilder(query)) {
        return this.find(query.build() as any);
      }

      if (query && typeof (query as any).sql === 'string') {
        const built = query as any;
        const result = await this.query(built.sql, built.params);
        return result.data as T[];
      }

      if (query instanceof FindParams || SqlDataSource.isSoapParamsWithWhere(query)) {
        const built = this._queryFactory.createFindQuery(query as FindParams, this._collectionName) as any;
        const result = await this.query(built.sql, built.params);
        return result.data as T[];
      }

      if (!query || typeof query === 'string') {
        const collection = (query as string) || this._collectionName;
        const sqlQuery = this._queryFactory.buildFindQuery(collection, {}, { table: collection, where: {}, fields: [], limit: 1000 });
        const result = await this.query(sqlQuery.sql, sqlQuery.params);
        return result.data as T[];
      }

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
          // For INSERT we return inserted data, preserving caller-provided ids.
          const insertedItem = { ...item, id: item.id ?? result.insertId };
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
        // For INSERT we return inserted data, preserving caller-provided ids.
        return [{ ...data, id: data.id ?? result.insertId } as T];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Insert operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Updates documents/records.
   *
   * Accepts (in priority order):
   *   1. `RepositoryQuery`                 — built and re-dispatched.
   *   2. Pre-built `{ sql, params }`       — executed verbatim.
   *   3. Soap `{ updates, where: Where[], methods }` shape produced by
   *      `ReadWriteRepository.update` (also matches `UpdateParams.isUpdateParams`).
   *      Routed through `SqlQueryFactory.createUpdateQuery`.
   *   4. Legacy `{ collection?, data|update?, criteria|where? }` plain object.
   */
  async update(query: DbQuery | UpdateParams<any> | RepositoryQuery): Promise<any> {
    try {
      if (RepositoryQuery.isQueryBuilder(query)) {
        return this.update(query.build() as any);
      }

      if (query && typeof (query as any).sql === 'string') {
        const built = query as any;
        const result = await this.query(built.sql, built.params);
        return {
          modifiedCount: result.affectedRows || 0,
          upsertedCount: 0,
          matchedCount: result.affectedRows || 0
        };
      }

      // UpdateParams class OR shape produced by ReadWriteRepository.update
      // ({ updates: ModelType[], where: Where[], methods: UpdateMethod[] }).
      // instanceof is the strongest signal — `UpdateParams.isUpdateParams`
      // also matches plain payloads like `{ sql, params }`, so we rely on
      // structural checks only as a fallback.
      const isSoapUpdateShape =
        query instanceof UpdateParams ||
        UpdateParams.isUpdateParams(query as any) ||
        (query && Array.isArray((query as any).updates) && Array.isArray((query as any).where) && Array.isArray((query as any).methods));
      if (isSoapUpdateShape) {
        const params = query as any;
        const built = this._queryFactory.createUpdateQuery(params.updates, params.where, params.methods, this._collectionName) as any;
        const result = await this.query(built.sql, built.params);
        return {
          modifiedCount: result.affectedRows || 0,
          upsertedCount: 0,
          matchedCount: result.affectedRows || 0
        };
      }

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
   * Removes documents/records (alias for delete).
   *
   * Accepts (in priority order):
   *   1. `RepositoryQuery`            — built and re-dispatched.
   *   2. Pre-built `{ sql, params }`  — executed verbatim.
   *   3. Soap params (`RemoveParams`) — detected by the presence of a `Where`
   *                                      instance on `where`; routed through
   *                                      `SqlQueryFactory.createRemoveQuery`.
   *                                      The legacy path would treat `Where` like
   *                                      a plain object and drop the clause — i.e.
   *                                      DELETE EVERY ROW. This is the same class
   *                                      of bug we patched in soap (`isFindParams`
   *                                      was accepting `RepositoryQuery` instances).
   *   4. Legacy `{ collection?, criteria|where? }` plain object.
   */
  async remove(query: DbQuery | RemoveParams | RepositoryQuery): Promise<any> {
    try {
      if (RepositoryQuery.isQueryBuilder(query)) {
        return this.remove(query.build() as any);
      }

      if (query && typeof (query as any).sql === 'string') {
        const built = query as any;
        const result = await this.query(built.sql, built.params);
        return {
          deletedCount: result.affectedRows || 0,
          affectedRows: result.affectedRows || 0,
          count: result.count || 0
        };
      }

      if (query instanceof RemoveParams || SqlDataSource.isSoapParamsWithWhere(query)) {
        const built = this._queryFactory.createRemoveQuery(query as RemoveParams, this._collectionName) as any;
        const result = await this.query(built.sql, built.params);
        return {
          deletedCount: result.affectedRows || 0,
          affectedRows: result.affectedRows || 0,
          count: result.count || 0
        };
      }

      const queryObj = query as any;
      return this.delete(queryObj.collection || this._collectionName, queryObj.criteria || queryObj.where, queryObj.options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Remove operation failed: ${errorMessage}`, errorMessage);
    }
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
   * Aggregates documents/records.
   *
   * Accepts (in priority order):
   *   1. `RepositoryQuery`               — built and re-dispatched (typical escape
   *                                         hatch for vendor-specific aggregations).
   *   2. Pre-built `{ sql, params }`     — executed verbatim.
   *   3. Soap `AggregationParams`        — detected by aggregation-only fields
   *                                         (`sum`/`average`/`min`/`max`/`count`/`groupBy`);
   *                                         routed through `SqlQueryFactory.createAggregationQuery`.
   *   4. Legacy `{ pipeline: [...] }`    — MongoDB-style pipeline translated to SQL.
   */
  async aggregate<AggregationType = T>(query: DbQuery | AggregationParams | RepositoryQuery): Promise<AggregationType[]> {
    try {
      if (RepositoryQuery.isQueryBuilder(query)) {
        return this.aggregate(query.build() as any);
      }

      if (query && typeof (query as any).sql === 'string') {
        const built = query as any;
        const result = await this.query(built.sql, built.params);
        return result.data as AggregationType[];
      }

      const q: any = query;
      const looksLikeAggregationParams = query instanceof AggregationParams || (q && typeof q === 'object' && !Array.isArray(q.pipeline) && (
        q.sum !== undefined || q.average !== undefined || q.min !== undefined ||
        q.max !== undefined || q.count !== undefined ||
        Array.isArray(q.groupBy)
      ));
      if (looksLikeAggregationParams) {
        const built = this._queryFactory.createAggregationQuery(query as AggregationParams, this._collectionName) as any;
        const result = await this.query(built.sql, built.params);
        return result.data as AggregationType[];
      }

      const pipeline = q?.pipeline || [];
      const sqlQuery = this._convertAggregationPipeline(pipeline);
      const result = await this.query(sqlQuery.sql, sqlQuery.params);
      return result.data as AggregationType[];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Aggregate operation failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Detects soap-style params (FindParams / CountParams / RemoveParams) by the
   * presence of a `Where` instance on `where` (a `Where` exposes `.build()`).
   *
   * We can't rely on `FindParams.isFindParams` etc — those static guards are
   * loose by design and also match legacy DbQuery objects like
   * `{ collection, criteria, options }`, sending them down the wrong code path
   * (where the mocked-or-real `createXxxQuery` then returns nothing usable).
   *
   * Plain-object `where: {}` still uses the legacy `buildWhereClause` path, so
   * existing callers passing `{ collection, where: { id: 1 } }` keep working.
   */
  private static isSoapParamsWithWhere(query: any): boolean {
    if (!query || typeof query !== 'object') return false;
    if (Array.isArray(query)) return false;
    const w = query.where;
    return !!(w && typeof w === 'object' && typeof (w as any).build === 'function');
  }

  /**
   * Sanctioned escape hatch — runs a NATIVE SQL query the abstract API can't
   * express. The payload is produced by a {@link RepositoryQuery}'s `build()`
   * (or passed raw) as either a SQL string or `{ sql, params?, options? }`, and
   * is executed verbatim. Returns the raw rows (use the lower-level `query()`
   * directly if you need the full QueryResult metadata).
   */
  async native<ResultType = T[]>(query: DbQuery | RepositoryQuery): Promise<ResultType> {
    try {
      const payload: any = RepositoryQuery.isQueryBuilder(query) ? query.build() : query;

      let sql: string;
      let params: any[] | undefined;
      let options: QueryOptions | undefined;

      if (typeof payload === 'string') {
        sql = payload;
      } else if (payload && typeof payload.sql === 'string') {
        sql = payload.sql;
        params = payload.params;
        options = payload.options;
      } else {
        throw new SqlQueryError(
          'native() expects a SQL string or { sql, params?, options? }',
          'invalid native query',
        );
      }

      const result = await this.query(sql, params, options);
      return result.data as ResultType;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlQueryError(`Native query failed: ${errorMessage}`, errorMessage);
    }
  }

  /**
   * Counts documents/records.
   *
   * Accepts (in priority order):
   *   1. no argument                  — counts every row in `_collectionName`.
   *   2. `RepositoryQuery`            — built and re-dispatched.
   *   3. Pre-built `{ sql, params }`  — executed verbatim.
   *   4. Soap params (`CountParams`)  — detected by the presence of a `Where`
   *                                      instance on `where`; routed through
   *                                      `SqlQueryFactory.createCountQuery`.
   *   5. Legacy `{ collection?, criteria|where?, options? }` plain object.
   */
  async count(query?: DbQuery | CountParams | RepositoryQuery): Promise<number> {
    try {
      if (!query) {
        const countQuery = this._queryFactory.buildCountQuery({ table: this._collectionName, where: {}, fields: ['COUNT(*) as count'] });
        const result = await this.query(countQuery.sql, countQuery.params);
        return parseInt(result.data[0]?.count) || 0;
      }

      if (RepositoryQuery.isQueryBuilder(query)) {
        return this.count(query.build() as any);
      }

      if (typeof (query as any).sql === 'string') {
        const built = query as any;
        const result = await this.query(built.sql, built.params);
        return parseInt(result.data[0]?.count) || 0;
      }

      if (query instanceof CountParams || SqlDataSource.isSoapParamsWithWhere(query)) {
        const built = this._queryFactory.createCountQuery(query as CountParams, this._collectionName) as any;
        const result = await this.query(built.sql, built.params);
        return parseInt(result.data[0]?.count) || 0;
      }

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

  private _normalizeSourceOptions(optionsOrQueryFactory?: SqlSourceOptions<T> | any): SqlSourceOptions<T> | undefined {
    if (!optionsOrQueryFactory || typeof optionsOrQueryFactory !== 'object') {
      return undefined;
    }

    const looksLikeSourceOptions =
      'modelClass' in optionsOrQueryFactory ||
      'modelFieldMappings' in optionsOrQueryFactory ||
      'queries' in optionsOrQueryFactory ||
      'performanceMonitoring' in optionsOrQueryFactory ||
      'indexes' in optionsOrQueryFactory;

    return looksLikeSourceOptions ? optionsOrQueryFactory : undefined;
  }

  private _createPerformanceMonitor(config?: SqlSourceOptions<T>['performanceMonitoring']): SqlPerformanceMonitor {
    const normalizedConfig = {
      enabled: config?.enabled ?? false,
      slowQueryThreshold: config?.slowQueryThreshold ?? 1000,
      maxQueriesToTrack: config?.maxQueriesToTrack ?? config?.maxMetrics ?? 1000,
      enableQueryLogging: config?.enableQueryLogging ?? false,
      enableMetricsCollection: config?.enableMetricsCollection ?? true,
    };

    const monitor = new SqlPerformanceMonitor(normalizedConfig);
    if (config?.metricsCollector) {
      monitor.on('queryExecuted', config.metricsCollector);
    }
    return monitor;
  }

  private _recordPerformance(
    sql: string,
    params: any[],
    startTime: number,
    success: boolean,
    error?: string,
    rowsAffected?: number
  ): void {
    this._performanceMonitor.recordQuery(
      sql,
      params,
      Date.now() - startTime,
      success,
      error,
      rowsAffected
    );
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
