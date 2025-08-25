import { SqlFieldMapping } from './sql.types';
import { Where, Condition, VariedCondition, NestedCondition, ConditionWithManyKeys } from "@soapjs/soap";

/**
 * Represents a parsed WHERE clause with SQL and parameters
 */
export interface ParsedWhereClause {
  sql: string;
  params: any[];
  hasConditions: boolean;
}

/**
 * Supported comparison operators
 */
export type ComparisonOperator = 
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'nin' | 'like' | 'nlike' | 'regex' | 'nregex'
  | 'exists' | 'nexists' | 'between' | 'nbetween'
  | 'json_extract' | 'json_path' | 'full_text_search' | 'array_contains' | 'text_search';

/**
 * WHERE clause parser for SQL queries
 */
export class SqlWhereParser {
  private _fieldMappings: Map<string, SqlFieldMapping> = new Map();
  private _tableAlias?: string;
  private _databaseType: 'mysql' | 'postgresql' | 'sqlite';

  constructor(
    databaseType: 'mysql' | 'postgresql' | 'sqlite' = 'mysql',
    fieldMappings?: SqlFieldMapping[], 
    tableAlias?: string
  ) {
    this._databaseType = databaseType;
    if (fieldMappings) {
      this.setFieldMappings(fieldMappings);
    }
    this._tableAlias = tableAlias;
  }

  /**
   * Sets field mappings for the parser
   */
  setFieldMappings(fieldMappings: SqlFieldMapping[]): void {
    this._fieldMappings.clear();
    fieldMappings.forEach(mapping => {
      this._fieldMappings.set(mapping.name, mapping);
    });
  }

  /**
   * Sets table alias for field references
   */
  setTableAlias(alias: string): void {
    this._tableAlias = alias;
  }

  /**
   * Parses a Where condition or criteria object into a WHERE clause
   * Compatible with MongoWhereParser API
   */
  parse(where: Where | any): ParsedWhereClause {
    if (!where) {
      return { sql: '', params: [], hasConditions: false };
    }

    // If where is already a plain object, parse it as criteria
    if (typeof where === 'object' && !where.build) {
      return this.parseCriteria(where);
    }

    // If where is a Where instance, use the build method
    if (where && typeof where.build === 'function') {
      const condition = where.build();
      if (!condition) {
        return { sql: '', params: [], hasConditions: false };
      }
      return this.parseCondition(condition);
    }

    return { sql: '', params: [], hasConditions: false };
  }

  /**
   * Parses a criteria object into a WHERE clause (legacy method)
   */
  parseCriteria(criteria: any): ParsedWhereClause {
    if (!criteria || typeof criteria !== 'object') {
      return { sql: '', params: [], hasConditions: false };
    }

    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(criteria)) {
      const condition = this._parseCondition(key, value, params);
      if (condition) {
        conditions.push(condition);
      }
    }

    const sql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    return {
      sql,
      params,
      hasConditions: conditions.length > 0
    };
  }

  /**
   * Parses a single condition from Where object into a WHERE clause
   */
  private parseCondition(condition: Condition | VariedCondition | NestedCondition | ConditionWithManyKeys): ParsedWhereClause {
    if (!condition) {
      return { sql: '', params: [], hasConditions: false };
    }

    const params: any[] = [];
    let sql = '';

    // Handle VariedCondition (AND/OR)
    if (this.isVariedCondition(condition)) {
      const parsedConditions = condition.conditions
        .map((cond: any) => this.parseCondition(cond))
        .filter(result => result.hasConditions);
      
      if (parsedConditions.length === 0) {
        return { sql: '', params: [], hasConditions: false };
      }

      const sqlParts = parsedConditions.map(result => {
        const conditionSql = result.sql.replace('WHERE ', '');
        params.push(...result.params);
        return `(${conditionSql})`;
      });

      const operator = condition.operator === "and" ? "AND" : "OR";
      sql = sqlParts.join(` ${operator} `);
    }
    // Handle NestedCondition
    else if (this.isNestedCondition(condition)) {
      return this.parseCondition(condition.result);
    }
    // Handle ConditionWithManyKeys
    else if (this.isConditionWithManyKeys(condition)) {
      const { left, operator, right } = condition;
      const conditions = left.map(key => this.createCondition(key, operator, right, params));
      sql = conditions.join(' OR ');
    }
    // Handle simple Condition
    else if (this.isCondition(condition)) {
      const { left, operator, right } = condition;
      sql = this.createCondition(left, operator, right, params);
    }

    return {
      sql: sql ? `WHERE ${sql}` : '',
      params,
      hasConditions: sql.length > 0
    };
  }

  /**
   * Creates a SQL condition from a field, operator, and value
   */
  private createCondition(field: string, operator: string, value: any, params: any[]): string {
    const fieldRef = this._getFieldReference(field);

    switch (operator) {
      case "eq":
        if (value === null || value === undefined) {
          return `${fieldRef} IS NULL`;
        }
        params.push(value);
        return `${fieldRef} = ?`;
      case "ne":
        if (value === null || value === undefined) {
          return `${fieldRef} IS NOT NULL`;
        }
        params.push(value);
        return `${fieldRef} != ?`;
      case "gt":
        params.push(value);
        return `${fieldRef} > ?`;
      case "gte":
        params.push(value);
        return `${fieldRef} >= ?`;
      case "lt":
        params.push(value);
        return `${fieldRef} < ?`;
      case "lte":
        params.push(value);
        return `${fieldRef} <= ?`;
      case "in":
        if (!Array.isArray(value) || value.length === 0) {
          return '1=0';
        }
        const placeholders = value.map(() => '?').join(', ');
        params.push(...value);
        return `${fieldRef} IN (${placeholders})`;
      case "nin":
        if (!Array.isArray(value) || value.length === 0) {
          return '1=1';
        }
        const ninPlaceholders = value.map(() => '?').join(', ');
        params.push(...value);
        return `${fieldRef} NOT IN (${ninPlaceholders})`;
      case "like":
        // For LIKE operator, use the pattern as-is (it's already a SQL LIKE pattern)
        params.push(value);
        return `${fieldRef} LIKE ?`;

      default:
        params.push(value);
        return `${fieldRef} = ?`;
    }
  }

  /**
   * Checks if a condition is a VariedCondition
   */
  private isVariedCondition(condition: any): condition is VariedCondition {
    return condition && condition.conditions && Array.isArray(condition.conditions) && condition.operator;
  }

  /**
   * Checks if a condition is a NestedCondition
   */
  private isNestedCondition(condition: any): condition is NestedCondition {
    return condition && condition.result;
  }

  /**
   * Checks if a condition is a ConditionWithManyKeys
   */
  private isConditionWithManyKeys(condition: any): condition is ConditionWithManyKeys {
    return condition && condition.left && Array.isArray(condition.left) && condition.operator;
  }

  /**
   * Checks if a condition is a Condition
   */
  private isCondition(condition: any): condition is Condition {
    return condition && condition.left && typeof condition.left === 'string' && condition.operator;
  }

  /**
   * Parses a single condition
   */
  private _parseCondition(key: string, value: any, params: any[]): string | null {
    // Handle special operators
    if (key.startsWith('$')) {
      return this._parseOperatorCondition(key, value, params);
    }

    // Handle field conditions
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return this._parseFieldOperators(key, value, params);
    }

    // Handle simple equality
    return this._parseSimpleCondition(key, value, params);
  }

  /**
   * Parses operator-based conditions
   */
  private _parseOperatorCondition(operator: string, value: any, params: any[]): string | null {
    switch (operator) {
      case '$and':
        return this._parseLogicalOperator('AND', value, params);
      case '$or':
        return this._parseLogicalOperator('OR', value, params);
      case '$not':
        return this._parseNotCondition(value, params);
      case '$nor':
        return this._parseLogicalOperator('AND NOT', value, params);
      default:
        return null;
    }
  }

  /**
   * Parses logical operators (AND, OR)
   */
  private _parseLogicalOperator(logicalOp: string, conditions: any[], params: any[]): string {
    const parsedConditions = conditions
      .map(condition => this.parse(condition))
      .filter(result => result.hasConditions);

    if (parsedConditions.length === 0) {
      return '';
    }

    if (parsedConditions.length === 1) {
      return parsedConditions[0].sql.replace('WHERE ', '');
    }

    const sqlParts = parsedConditions.map(result => {
      const sql = result.sql.replace('WHERE ', '');
      return `(${sql})`;
    });

    // Add parameters
    parsedConditions.forEach(result => {
      params.push(...result.params);
    });

    return sqlParts.join(` ${logicalOp} `);
  }

  /**
   * Parses NOT conditions
   */
  private _parseNotCondition(condition: any, params: any[]): string {
    const parsed = this.parse(condition);
    if (!parsed.hasConditions) {
      return '';
    }

    const sql = parsed.sql.replace('WHERE ', '');
    params.push(...parsed.params);
    
    return `NOT (${sql})`;
  }

  /**
   * Parses field-specific operators
   */
  private _parseFieldOperators(field: string, operators: any, params: any[]): string | null {
    const conditions: string[] = [];

    for (const [operator, value] of Object.entries(operators)) {
      const condition = this._parseFieldOperator(field, operator as ComparisonOperator, value, params);
      if (condition) {
        conditions.push(condition);
      }
    }

    return conditions.length > 0 ? conditions.join(' AND ') : null;
  }

  /**
   * Parses a single field operator
   */
  private _parseFieldOperator(field: string, operator: ComparisonOperator, value: any, params: any[]): string | null {
    const fieldRef = this._getFieldReference(field);

    switch (operator) {
      case 'eq':
        return this._buildComparison(fieldRef, '=', value, params);
      case 'ne':
        return this._buildComparison(fieldRef, '!=', value, params);
      case 'gt':
        return this._buildComparison(fieldRef, '>', value, params);
      case 'gte':
        return this._buildComparison(fieldRef, '>=', value, params);
      case 'lt':
        return this._buildComparison(fieldRef, '<', value, params);
      case 'lte':
        return this._buildComparison(fieldRef, '<=', value, params);
      case 'in':
        return this._buildInCondition(fieldRef, value, params, false);
      case 'nin':
        return this._buildInCondition(fieldRef, value, params, true);
      case 'like':
        return this._buildLikeCondition(fieldRef, value, params, false);
      case 'nlike':
        return this._buildLikeCondition(fieldRef, value, params, true);
      case 'regex':
        return this._buildRegexCondition(fieldRef, value, params, false);
      case 'nregex':
        return this._buildRegexCondition(fieldRef, value, params, true);
      case 'exists':
        return this._buildExistsCondition(fieldRef, value, params, false);
      case 'nexists':
        return this._buildExistsCondition(fieldRef, value, params, true);
      case 'between':
        return this._buildBetweenCondition(fieldRef, value, params, false);
      case 'nbetween':
        return this._buildBetweenCondition(fieldRef, value, params, true);
      case 'json_extract':
        return this._createJsonExtractCondition(field, value.path, value.value, params);
      case 'json_path':
        return this._createJsonPathCondition(field, value, params);
      case 'full_text_search':
        return this._createFullTextSearchCondition(field, value.value, params);
      case 'array_contains':
        return this._createArrayContainsCondition(field, value.values, params);
      case 'text_search':
        return this._createTextSearchCondition(field, value.value, params);
      default:
        return null;
    }
  }

  /**
   * Parses simple equality conditions
   */
  private _parseSimpleCondition(field: string, value: any, params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    if (value === null) {
      return `${fieldRef} IS NULL`;
    }
    
    if (value === undefined) {
      return `${fieldRef} IS NULL`;
    }

    return this._buildComparison(fieldRef, '=', value, params);
  }

  /**
   * Builds a comparison condition
   */
  private _buildComparison(field: string, operator: string, value: any, params: any[]): string {
    params.push(value);
    return `${field} ${operator} ?`;
  }

  /**
   * Builds an IN condition
   */
  private _buildInCondition(field: string, values: any[], params: any[], negate: boolean): string {
    if (!Array.isArray(values) || values.length === 0) {
      return negate ? '1=1' : '1=0';
    }

    const placeholders = values.map(() => '?').join(', ');
    params.push(...values);
    
    const operator = negate ? 'NOT IN' : 'IN';
    return `${field} ${operator} (${placeholders})`;
  }

  /**
   * Builds a LIKE condition
   */
  private _buildLikeCondition(field: string, pattern: string, params: any[], negate: boolean): string {
    params.push(pattern);
    const operator = negate ? 'NOT LIKE' : 'LIKE';
    return `${field} ${operator} ?`;
  }

  /**
   * Builds a REGEX condition (converted to LIKE for SQL compatibility)
   */
  private _buildRegexCondition(field: string, pattern: string, params: any[], negate: boolean): string {
    // Convert regex to LIKE pattern for SQL compatibility
    const likePattern = this._regexToLike(pattern);
    return this._buildLikeCondition(field, likePattern, params, negate);
  }

  /**
   * Builds an EXISTS condition
   */
  private _buildExistsCondition(field: string, value: boolean, params: any[], negate: boolean): string {
    if (value) {
      return negate ? `${field} IS NULL` : `${field} IS NOT NULL`;
    } else {
      return negate ? `${field} IS NOT NULL` : `${field} IS NULL`;
    }
  }

  /**
   * Builds a BETWEEN condition
   */
  private _buildBetweenCondition(field: string, values: [any, any], params: any[], negate: boolean): string {
    if (!Array.isArray(values) || values.length !== 2) {
      return negate ? '1=1' : '1=0';
    }

    params.push(values[0], values[1]);
    const operator = negate ? 'NOT BETWEEN' : 'BETWEEN';
    return `${field} ${operator} ? AND ?`;
  }

  /**
   * Gets the field reference with optional table alias
   */
  private _getFieldReference(field: string): string {
    if (this._tableAlias) {
      return `${this._tableAlias}.${this._escapeIdentifier(field)}`;
    }
    return this._escapeIdentifier(field);
  }

  /**
   * Escapes SQL identifiers
   */
  private _escapeIdentifier(identifier: string): string {
    // Basic SQL injection prevention - escape backticks and quotes
    return `\`${identifier.replace(/[`'"]/g, '\\$&')}\``;
  }

  /**
   * Converts regex pattern to LIKE pattern
   */
  private _regexToLike(regex: string): string {
    // Convert common regex patterns to SQL LIKE patterns
    return regex
      .replace(/\./g, '_')           // . -> _
      .replace(/\*/g, '%')           // * -> %
      .replace(/\?/g, '_')           // ? -> _
      .replace(/\[.*?\]/g, '_')      // [abc] -> _
      .replace(/\(.*?\)/g, '_')      // (abc) -> _
      .replace(/^/, '%')             // Start with %
      .replace(/$/, '%');            // End with %
  }

  /**
   * Creates a JSON_EXTRACT condition for extracting values from JSON fields
   */
  private _createJsonExtractCondition(field: string, path: string, value: any, params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    switch (this._databaseType) {
      case 'postgresql':
        params.push(value);
        return `${fieldRef}->>'${path}' = ?`;
      case 'mysql':
        params.push(value);
        return `JSON_EXTRACT(${fieldRef}, '${path}') = ?`;
      case 'sqlite':
        params.push(value);
        return `json_extract(${fieldRef}, '${path}') = ?`;
      default:
        params.push(value);
        return `${fieldRef} = ?`;
    }
  }

  /**
   * Creates a JSON path condition for PostgreSQL JSON operators
   */
  private _createJsonPathCondition(field: string, path: string, params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    if (this._databaseType === 'postgresql') {
      return `${fieldRef} @> ?`;
    } else {
      // Fallback to JSON_EXTRACT for other databases
      return this._createJsonExtractCondition(field, path, null, params);
    }
  }

  /**
   * Creates a full-text search condition
   */
  private _createFullTextSearchCondition(field: string, searchTerm: string, params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    switch (this._databaseType) {
      case 'postgresql':
        params.push(searchTerm);
        return `to_tsvector('english', ${fieldRef}) @@ plainto_tsquery('english', ?)`;
      case 'mysql':
        params.push(searchTerm);
        return `MATCH(${fieldRef}) AGAINST(? IN BOOLEAN MODE)`;
      case 'sqlite':
        params.push(searchTerm);
        return `${fieldRef} MATCH ?`;
      default:
        params.push(searchTerm);
        return `${fieldRef} LIKE ?`;
    }
  }

  /**
   * Creates an array contains condition
   */
  private _createArrayContainsCondition(field: string, values: any[], params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    switch (this._databaseType) {
      case 'postgresql':
        params.push(values);
        return `${fieldRef} @> ?`;
      case 'mysql':
        params.push(JSON.stringify(values));
        return `JSON_CONTAINS(${fieldRef}, ?)`;
      case 'sqlite':
        // SQLite doesn't have native array support, use JSON
        params.push(JSON.stringify(values));
        return `json_extract(${fieldRef}, '$') = ?`;
      default:
        // Fallback to IN operator
        if (!Array.isArray(values) || values.length === 0) {
          return '1=0';
        }
        const placeholders = values.map(() => '?').join(', ');
        params.push(...values);
        return `${fieldRef} IN (${placeholders})`;
    }
  }

  /**
   * Creates a text search condition (simpler than full-text search)
   */
  private _createTextSearchCondition(field: string, searchTerm: string, params: any[]): string {
    const fieldRef = this._getFieldReference(field);
    
    // Simple text search using LIKE with wildcards
    params.push(`%${searchTerm}%`);
    return `${fieldRef} LIKE ?`;
  }

  /**
   * Builds a complete WHERE clause from criteria
   */
  static buildWhereClause(criteria: any, fieldMappings?: SqlFieldMapping[], tableAlias?: string): ParsedWhereClause {
    const parser = new SqlWhereParser('mysql', fieldMappings, tableAlias);
    return parser.parse(criteria);
  }

  /**
   * Static method for backward compatibility.
   * @param {Where | any} where - The where condition to parse.
   * @returns {ParsedWhereClause} The parsed WHERE clause.
   */
  static parse(where: Where | any): ParsedWhereClause {
    const parser = new SqlWhereParser('mysql');
    return parser.parse(where);
  }
}
