import {
  DbQueryFactory,
  FindParams,
  CountParams,
  AggregationParams,
  UpdateParams,
  RemoveParams,
  UpdateMethod,
  Where,
  DbQuery
} from '@soapjs/soap';
import { DatabaseType, DeleteOptions, InsertOptions, QueryOptions, UpdateOptions } from './sql.types';
import { SqlWhereParser } from './sql.where.parser';
import { SqlUtils } from './sql.utils';

/**
 * SQL implementation of DbQueryFactory interface.
 * Converts standard @soapjs/soap parameters to SQL queries.
 * 
 * @template T - The type of the entity.
 */
export class SqlQueryFactory<T> implements DbQueryFactory {
  private whereParser: SqlWhereParser;

  constructor(private databaseType: DatabaseType) {
    this.whereParser = new SqlWhereParser(this.databaseType);
  }

  /**
   * Creates a find query for SQL.
   * @param {FindParams} params - The find parameters.
   * @returns {DbQuery} The SQL find query.
   */
  createFindQuery(params: FindParams, ...args: unknown[]): DbQuery {
    const { limit, offset, sort, where, projection } = params;
    
    // Get table name from args or use default
    const tableName = args[0] as string || 'default_table';
    
    // Convert Sort to orderBy format
    const orderBy = sort ? this.convertSortToOrderBy(sort) : undefined;
    
    // Parse where clause using whereParser
    const whereClause = where ? this.whereParser.parse(where) : undefined;
    
    // Convert FindParams to QueryOptions format
    const queryOptions = {
      table: tableName,
      fields: projection ? Object.keys(projection) : undefined,
      where: whereClause && typeof whereClause === 'object' && 'sql' in whereClause ? whereClause : undefined,
      orderBy,
      limit,
      offset
    };

    const result = this.buildSelectQuery(queryOptions);
    
    return {
      sql: result.sql,
      params: result.params,
      filter: whereClause || {},
      options: {
        limit,
        offset,
        sort,
        projection
      }
    } as DbQuery;
  }

  /**
   * Creates a count query for SQL.
   * @param {CountParams} params - The count parameters.
   * @returns {DbQuery} The SQL count query.
   */
  createCountQuery(params: CountParams, ...args: unknown[]): DbQuery {
    const { sort, where } = params;
    
    // Get table name from args or use default
    const tableName = args[0] as string || 'default_table';
    
    // Convert Sort to orderBy format
    const orderBy = sort ? this.convertSortToOrderBy(sort) : undefined;
    
    // Parse where clause using whereParser
    const whereClause = where ? this.whereParser.parse(where) : undefined;
    
    const queryOptions = {
      table: tableName,
      where: whereClause && typeof whereClause === 'object' && 'sql' in whereClause ? whereClause : undefined,
      orderBy
    };

    const result = this.buildCountQuery(queryOptions);
    
    return {
      sql: result.sql,
      params: result.params,
      filter: whereClause || {},
      options: {
        sort
      }
    } as DbQuery;
  }

  /**
   * Creates an update query for SQL.
   * @param {UpdateType[]} updates - The updates to apply.
   * @param {Where[]} where - The where conditions.
   * @param {UpdateMethod[]} methods - The update methods.
   * @returns {DbQuery} The SQL update query.
   */
  createUpdateQuery<UpdateType = unknown>(
    updates: UpdateType[],
    where: Where[],
    methods: UpdateMethod[],
    ...args: unknown[]
  ): DbQuery {
    if (updates.length !== where.length || updates.length !== methods.length) {
      throw new Error("Updates, where conditions, and methods arrays must have the same length");
    }

    // Get table name from args or use default
    const tableName = args[0] as string || 'default_table';

    // Combine all updates
    const combinedUpdate = updates.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});

    // Combine all where conditions with AND
    const combinedWhere = where.reduce((acc, curr) => {
      const parsed = this.whereParser.parse(curr);
      return { ...acc, ...parsed };
    }, {});

    const queryOptions = {
      table: tableName,
      data: combinedUpdate,
      where: combinedWhere && typeof combinedWhere === 'object' && 'sql' in combinedWhere ? combinedWhere : undefined
    };

    const result = this.buildUpdateQuery(queryOptions);
    
    return {
      sql: result.sql,
      params: result.params,
      filter: combinedWhere || {},
      update: combinedUpdate,
      options: {
        multi: true
      }
    } as DbQuery;
  }

  /**
   * Creates a remove query for SQL.
   * @param {RemoveParams} params - The remove parameters.
   * @returns {DbQuery} The SQL remove query.
   */
  createRemoveQuery(params: RemoveParams, ...args: unknown[]): DbQuery {
    const { where } = params;
    
    // Get table name from args or use default
    const tableName = args[0] as string || 'default_table';
    
    // Parse where clause using whereParser
    const whereClause = where ? this.whereParser.parse(where) : undefined;
    
    const deleteOptions = {
      table: tableName,
      where: whereClause && typeof whereClause === 'object' && 'sql' in whereClause ? whereClause : undefined
    };

    const result = this.buildDeleteQuery(deleteOptions);
    
    return {
      sql: result.sql,
      params: result.params,
      filter: whereClause || {},
      options: {}
    } as DbQuery;
  }

  /**
   * Creates an aggregation query for SQL.
   * @param {AggregationParams} params - The aggregation parameters.
   * @returns {DbQuery} The SQL aggregation query.
   */
  createAggregationQuery(params: AggregationParams, ...args: unknown[]): DbQuery {
    const { 
      groupBy, 
      filterBy, 
      sort, 
      sum, 
      average, 
      min, 
      max, 
      count, 
      where, 
      limit, 
      having, 
      offset 
    } = params;

    // Get table name from args or use default
    const tableName = args[0] as string || 'default_table';

    // Build SELECT clause with aggregation functions
    let fields: string[] = [];
    
    if (groupBy && groupBy.length > 0) {
      fields.push(...groupBy);
    }
    
    if (sum) {
      const sumFields = Array.isArray(sum) ? sum : [sum];
      sumFields.forEach(field => {
        fields.push(`SUM(${field}) as sum_${field}`);
      });
    }
    
    if (average) {
      const averageFields = Array.isArray(average) ? average : [average];
      averageFields.forEach(field => {
        fields.push(`AVG(${field}) as average_${field}`);
      });
    }
    
    if (min) {
      const minFields = Array.isArray(min) ? min : [min];
      minFields.forEach(field => {
        fields.push(`MIN(${field}) as min_${field}`);
      });
    }
    
    if (max) {
      const maxFields = Array.isArray(max) ? max : [max];
      maxFields.forEach(field => {
        fields.push(`MAX(${field}) as max_${field}`);
      });
    }
    
    if (count) {
      const countFields = Array.isArray(count) ? count : [count];
      countFields.forEach(field => {
        fields.push(`COUNT(${field}) as count_${field}`);
      });
    }

    // Parse where clause using whereParser
    const whereClause = where ? this.whereParser.parse(where) : undefined;
    
    const queryOptions = {
      table: tableName,
      fields: fields.length > 0 ? fields : undefined,
      where: whereClause && typeof whereClause === 'object' && 'sql' in whereClause ? whereClause : undefined,
      orderBy: sort ? this.convertSortToOrderBy(sort) : undefined,
      limit,
      offset,
      groupBy,
      having
    };

    const result = this.buildSelectQuery(queryOptions);
    
    return {
      sql: result.sql,
      params: result.params,
      filter: whereClause || {},
      // Additional fields for compatibility
      pipeline: [
        // SQL doesn't have pipeline like MongoDB, but we can represent it
        { $sql: result.sql, $params: result.params }
      ],
      options: {
        limit,
        offset
      }
    } as DbQuery;
  }

  /**
   * Gets the underlying SqlWhereParser for custom where parsing.
   * @returns {SqlWhereParser} The SQL where parser.
   */
  getWhereParser(): SqlWhereParser {
    return this.whereParser;
  }

  /**
   * Converts Sort from @soapjs/soap to orderBy format for QueryOptions.
   * Sort: { field: 1 } -> orderBy: { field: 'ASC' }
   * Sort: { field: -1 } -> orderBy: { field: 'DESC' }
   */
  private convertSortToOrderBy(sort: any): Record<string, 'ASC' | 'DESC'> {
    if (!sort || typeof sort !== 'object') {
      return {};
    }

    const orderBy: Record<string, 'ASC' | 'DESC'> = {};
    
    for (const [field, direction] of Object.entries(sort)) {
      if (typeof direction === 'number') {
        // Only accept 1 (ASC) or -1 (DESC), ignore 0 and other values
        if (direction === 1) {
          orderBy[field] = 'ASC';
        } else if (direction === -1) {
          orderBy[field] = 'DESC';
        }
        // direction === 0 or other values are ignored
      } else if (typeof direction === 'string') {
        // Handle string values like 'asc', 'desc'
        const upperDirection = direction.toUpperCase();
        if (upperDirection === 'ASC' || upperDirection === 'DESC') {
          orderBy[field] = upperDirection as 'ASC' | 'DESC';
        }
      }
    }

    return orderBy;
  }

  /**
   * Builds a SELECT query
   */
  buildSelectQuery(options: QueryOptions): { sql: string; params: any[] } {
    const { table, fields, where, orderBy, limit, offset, groupBy, having } = options;
    
    let sql = 'SELECT ';
    
    // Fields
    if (fields && fields.length > 0) {
      sql += fields.map(field => SqlUtils.escapeIdentifier(field, this.databaseType)).join(', ');
    } else {
      sql += '*';
    }
    
    // Table
    sql += ` FROM ${SqlUtils.escapeIdentifier(table, this.databaseType)}`;
    
    // Where clause
    let params: any[] = [];
    if (where && Object.keys(where).length > 0) {
      const whereClause = SqlUtils.buildWhereClause(where, this.databaseType);
      sql += ` WHERE ${whereClause.sql}`;
      params.push(...whereClause.params);
    }
    
    // Group by
    if (groupBy && groupBy.length > 0) {
      sql += ` GROUP BY ${groupBy.map(field => SqlUtils.escapeIdentifier(field, this.databaseType)).join(', ')}`;
    }
    
    // Having
    if (having && Object.keys(having).length > 0) {
      const havingClause = SqlUtils.buildWhereClause(having, this.databaseType);
      sql += ` HAVING ${havingClause.sql}`;
      params.push(...havingClause.params);
    }
    
    // Order by
    if (orderBy) {
      const orderByClause = SqlUtils.buildOrderByClause(orderBy);
      if (orderByClause) {
        sql += ` ORDER BY ${orderByClause}`;
      }
    }
    
    // Limit and offset
    const limitClause = SqlUtils.buildLimitClause(limit, offset);
    if (limitClause) {
      sql += ` ${limitClause}`;
    }
    
    return { sql, params };
  }

  /**
   * Builds an INSERT query
   */
  buildInsertQuery(options: InsertOptions): { sql: string; params: any[] } {
    const { table, data, ignore, onDuplicateKeyUpdate } = options;
    
    if (!data || Object.keys(data).length === 0) {
      throw new Error('No data provided for INSERT query');
    }
    
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => '?').join(', ');
    
    let sql = 'INSERT ';
    
    if (ignore) {
      sql += 'IGNORE ';
    }
    
    sql += `INTO ${SqlUtils.escapeIdentifier(table, this.databaseType)} (`;
    sql += fields.map(field => SqlUtils.escapeIdentifier(field, this.databaseType)).join(', ');
    sql += `) VALUES (${placeholders})`;
    
    // ON DUPLICATE KEY UPDATE (MySQL only)
    if (onDuplicateKeyUpdate && this.databaseType === 'mysql' && Object.keys(onDuplicateKeyUpdate).length > 0) {
      const updateFields = Object.keys(onDuplicateKeyUpdate);
      const updateValues = Object.values(onDuplicateKeyUpdate);
      
      sql += ' ON DUPLICATE KEY UPDATE ';
      sql += updateFields.map(field => `${SqlUtils.escapeIdentifier(field, this.databaseType)} = ?`).join(', ');
      
      return { sql, params: [...values, ...updateValues] };
    }
    
    // ON CONFLICT DO UPDATE (PostgreSQL only)
    if (onDuplicateKeyUpdate && this.databaseType === 'postgresql' && Object.keys(onDuplicateKeyUpdate).length > 0) {
      const updateFields = Object.keys(onDuplicateKeyUpdate);
      const updateValues = Object.values(onDuplicateKeyUpdate);
      
      sql += ' ON CONFLICT DO UPDATE SET ';
      sql += updateFields.map(field => `${SqlUtils.escapeIdentifier(field, this.databaseType)} = ?`).join(', ');
      
      return { sql, params: [...values, ...updateValues] };
    }

    // ON CONFLICT DO UPDATE (SQLite only)
    if (onDuplicateKeyUpdate && this.databaseType === 'sqlite' && Object.keys(onDuplicateKeyUpdate).length > 0) {
      const updateFields = Object.keys(onDuplicateKeyUpdate);
      const updateValues = Object.values(onDuplicateKeyUpdate);
      
      sql += ' ON CONFLICT DO UPDATE SET ';
      sql += updateFields.map(field => `${SqlUtils.escapeIdentifier(field, this.databaseType)} = ?`).join(', ');
      
      return { sql, params: [...values, ...updateValues] };
    }
    
    // Add RETURNING clause for PostgreSQL to get insertId
    if (this.databaseType === 'postgresql') {
      sql += ' RETURNING id';
    }
    
    return { sql, params: values };
  }

  /**
   * Builds an UPDATE query
   */
  buildUpdateQuery(options: UpdateOptions): { sql: string; params: any[] } {
    const { table, data, where, limit } = options;
    
    if (!data || Object.keys(data).length === 0) {
      throw new Error('No data provided for UPDATE query');
    }
    
    const fields = Object.keys(data);
    const values = Object.values(data);
    
    let sql = `UPDATE ${SqlUtils.escapeIdentifier(table, this.databaseType)} SET `;
    sql += fields.map(field => `${SqlUtils.escapeIdentifier(field, this.databaseType)} = ?`).join(', ');
    
    // Where clause
    let params = [...values];
    if (where && Object.keys(where).length > 0) {
      const whereClause = SqlUtils.buildWhereClause(where, this.databaseType);
      sql += ` WHERE ${whereClause.sql}`;
      params.push(...whereClause.params);
    }
    
    // Limit (MySQL only)
    if (limit && this.databaseType === 'mysql') {
      sql += ` LIMIT ${limit}`;
    }
    
    return { sql, params };
  }

  /**
   * Builds a DELETE query
   */
  buildDeleteQuery(options: DeleteOptions): { sql: string; params: any[] } {
    const { table, where, limit } = options;
    
    let sql = `DELETE FROM ${SqlUtils.escapeIdentifier(table, this.databaseType)}`;
    
    // Where clause
    let params: any[] = [];
    if (where && Object.keys(where).length > 0) {
      const whereClause = SqlUtils.buildWhereClause(where, this.databaseType);
      sql += ` WHERE ${whereClause.sql}`;
      params.push(...whereClause.params);
    }
    
    // Limit (MySQL only)
    if (limit && this.databaseType === 'mysql') {
      sql += ` LIMIT ${limit}`;
    }
    
    return { sql, params };
  }

  /**
   * Builds a COUNT query
   */
  buildCountQuery(options: QueryOptions): { sql: string; params: any[] } {
    const { table, where, groupBy, having } = options;
    
    let sql = 'SELECT COUNT(*) as count';
    
    // Table
    sql += ` FROM ${SqlUtils.escapeIdentifier(table, this.databaseType)}`;
    
    // Where clause
    let params: any[] = [];
    if (where && Object.keys(where).length > 0) {
      const whereClause = SqlUtils.buildWhereClause(where, this.databaseType);
      sql += ` WHERE ${whereClause.sql}`;
      params.push(...whereClause.params);
    }
    
    // Group by
    if (groupBy && groupBy.length > 0) {
      sql += ` GROUP BY ${groupBy.map(field => SqlUtils.escapeIdentifier(field, this.databaseType)).join(', ')}`;
    }
    
    // Having
    if (having && Object.keys(having).length > 0) {
      const havingClause = SqlUtils.buildWhereClause(having, this.databaseType);
      sql += ` HAVING ${havingClause.sql}`;
      params.push(...havingClause.params);
    }
    
    return { sql, params };
  }

  /**
   * Builds a JOIN query
   */
  buildJoinQuery(
    mainTable: string,
    joins: Array<{
      type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
      table: string;
      on: string;
    }>,
    options: QueryOptions
  ): { sql: string; params: any[] } {
    const { fields, where, orderBy, limit, offset } = options;
    
    let sql = 'SELECT ';
    
    // Fields
    if (fields && fields.length > 0) {
      sql += fields.map(field => SqlUtils.escapeIdentifier(field, this.databaseType)).join(', ');
    } else {
      sql += '*';
    }
    
    // Main table
    sql += ` FROM ${SqlUtils.escapeIdentifier(mainTable, this.databaseType)}`;
    
    // Joins
    for (const join of joins) {
      sql += ` ${join.type} JOIN ${SqlUtils.escapeIdentifier(join.table, this.databaseType)} ON ${join.on}`;
    }
    
    // Where clause
    let params: any[] = [];
    if (where && Object.keys(where).length > 0) {
      const whereClause = SqlUtils.buildWhereClause(where, this.databaseType);
      sql += ` WHERE ${whereClause.sql}`;
      params.push(...whereClause.params);
    }
    
    // Order by
    if (orderBy) {
      const orderByClause = SqlUtils.buildOrderByClause(orderBy);
      if (orderByClause) {
        sql += ` ORDER BY ${orderByClause}`;
      }
    }
    
    // Limit and offset
    const limitClause = SqlUtils.buildLimitClause(limit, offset);
    if (limitClause) {
      sql += ` ${limitClause}`;
    }
    
    return { sql, params };
  }

  /**
   * Builds a raw SQL query with parameter substitution
   */
  buildRawQuery(sql: string, params: any[]): { sql: string; params: any[] } {
    return { sql, params };
  }

  /**
   * Escapes a table or column name
   */
  escapeIdentifier(identifier: string): string {
    return SqlUtils.escapeIdentifier(identifier, this.databaseType);
  }

  /**
   * Escapes a string value
   */
  escapeString(value: string): string {
    return SqlUtils.escapeString(value);
  }

  /**
   * Gets the database type
   */
  getDatabaseType(): DatabaseType {
    return this.databaseType;
  }

  /**
   * Builds a find query
   */
  buildFindQuery(collection: string, criteria?: any, options?: any): { sql: string; params: any[] } {
    const queryOptions: QueryOptions = {
      table: collection,
      fields: options?.fields,
      where: criteria,
      orderBy: options?.orderBy,
      limit: options?.limit,
      offset: options?.offset,
      groupBy: options?.groupBy,
      having: options?.having
    };
    
    return this.buildSelectQuery(queryOptions);
  }

  /**
   * Builds a findOne query
   */
  buildFindOneQuery(collection: string, criteria?: any, options?: any): { sql: string; params: any[] } {
    const queryOptions: QueryOptions = {
      table: collection,
      fields: options?.fields,
      where: criteria,
      orderBy: options?.orderBy,
      limit: 1
    };
    
    return this.buildSelectQuery(queryOptions);
  }

  /**
   * Builds a create table query
   */
  buildCreateTableQuery(tableName: string, definition: any): { sql: string; params: any[] } {
    // This would need to be implemented based on the table definition
    // For now, return a placeholder
    return {
      sql: `CREATE TABLE ${SqlUtils.escapeIdentifier(tableName, this.databaseType)} (/* table definition */)`,
      params: []
    };
  }

  /**
   * Builds a drop table query
   */
  buildDropTableQuery(tableName: string): { sql: string; params: any[] } {
    return {
      sql: `DROP TABLE IF EXISTS ${SqlUtils.escapeIdentifier(tableName, this.databaseType)}`,
      params: []
    };
  }

  /**
   * Builds a create index query
   */
  buildCreateIndexQuery(tableName: string, index: any): { sql: string; params: any[] } {
    const unique = index.unique ? 'UNIQUE ' : '';
    const columns = index.columns.map((col: string) => SqlUtils.escapeIdentifier(col, this.databaseType)).join(', ');
    
    return {
      sql: `CREATE ${unique}INDEX ${SqlUtils.escapeIdentifier(index.name, this.databaseType)} ON ${SqlUtils.escapeIdentifier(tableName, this.databaseType)} (${columns})`,
      params: []
    };
  }

  /**
   * Builds a drop index query
   */
  buildDropIndexQuery(tableName: string, indexName: string): { sql: string; params: any[] } {
    return {
      sql: `DROP INDEX ${SqlUtils.escapeIdentifier(indexName, this.databaseType)} ON ${SqlUtils.escapeIdentifier(tableName, this.databaseType)}`,
      params: []
    };
  }

  /**
   * Builds a describe table query
   */
  buildDescribeTableQuery(tableName: string): { sql: string; params: any[] } {
    if (this.databaseType === 'mysql') {
      return {
        sql: `DESCRIBE ${SqlUtils.escapeIdentifier(tableName, this.databaseType)}`,
        params: []
      };
    } else {
      return {
        sql: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = ?`,
        params: [tableName]
      };
    }
  }
}