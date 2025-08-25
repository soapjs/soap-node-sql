import { SqlConfig, DatabaseType } from './sql.types';

/**
 * Utility functions for SQL operations
 */
export class SqlUtils {
  /**
   * Escapes a string value for SQL queries
   */
  static escapeString(value: string): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    // Replace single quotes with double single quotes
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Escapes an identifier (table/column name) for SQL queries
   */
  static escapeIdentifier(identifier: string, databaseType?: DatabaseType): string {
    if (!identifier) {
      return '';
    }
    
    // Use appropriate escaping based on database type
    if (databaseType === 'mysql') {
      // MySQL uses backticks
      return `\`${identifier.replace(/`/g, '``')}\``;
    } else if (databaseType === 'postgresql') {
      // PostgreSQL uses double quotes
      return `"${identifier.replace(/"/g, '""')}"`;
    } else if (databaseType === 'sqlite') {
      // SQLite uses double quotes
      return `"${identifier.replace(/"/g, '""')}"`;
    } else {
      // Default to double quotes
      return `"${identifier.replace(/"/g, '""')}"`;
    }
  }

  /**
   * Converts placeholders from ? to $1, $2, ... for PostgreSQL
   */
  static convertPlaceholders(sql: string, databaseType: DatabaseType): string {
    if (databaseType === 'postgresql') {
      let paramIndex = 1;
      return sql.replace(/\?/g, () => `$${paramIndex++}`);
    }
    return sql;
  }

  /**
   * Builds a parameterized query string
   */
  static buildParameterizedQuery(sql: string, params: any[]): string {
    let paramIndex = 0;
    return sql.replace(/\?/g, () => {
      const param = params[paramIndex++];
      if (param === null || param === undefined) {
        return 'NULL';
      }
      if (typeof param === 'string') {
        return this.escapeString(param);
      }
      if (typeof param === 'number') {
        return param.toString();
      }
      if (typeof param === 'boolean') {
        return param ? '1' : '0';
      }
      if (param instanceof Date) {
        return this.escapeString(param.toISOString());
      }
      if (Array.isArray(param)) {
        return param.map(p => this.escapeString(p.toString())).join(', ');
      }
      if (typeof param === 'object') {
        return this.escapeString(JSON.stringify(param));
      }
      
      return this.escapeString(param.toString());
    });
  }

  /**
   * Converts a JavaScript value to SQL-compatible value
   */
  static toSqlValue(value: any, databaseType: DatabaseType): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (value instanceof Date) {
      if (databaseType === 'mysql') {
        return value.toISOString().slice(0, 19).replace('T', ' ');
      } else if (databaseType === 'sqlite') {
        return value.toISOString();
      } else {
        return value.toISOString();
      }
    }
    
    if (typeof value === 'boolean') {
      if (databaseType === 'mysql') {
        return value ? 1 : 0;
      } else if (databaseType === 'sqlite') {
        return value ? 1 : 0;
      } else {
        return value;
      }
    }
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value);
    }
    
    return value;
  }

  /**
   * Helper function to transform date parts to Date object
   */
  static transformDate(dateMatch: RegExpMatchArray): Date {
    return new Date(
      parseInt(dateMatch[1]),
      parseInt(dateMatch[2]) - 1,
      parseInt(dateMatch[3]),
      parseInt(dateMatch[4]),
      parseInt(dateMatch[5]),
      parseInt(dateMatch[6])
    );
  }

  /**
   * Converts a SQL value to JavaScript value
   */
  static fromSqlValue(value: any, databaseType: DatabaseType): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (typeof value === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // Not JSON, continue
      }
      
      // Try to parse as date
      if (databaseType === 'mysql') {
        const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (dateMatch) {
          return new Date(
            parseInt(dateMatch[1]),
            parseInt(dateMatch[2]) - 1,
            parseInt(dateMatch[3]),
            parseInt(dateMatch[4]),
            parseInt(dateMatch[5]),
            parseInt(dateMatch[6])
          );
        }
      } else if (databaseType === 'sqlite') {
        // SQLite stores dates as ISO strings, so we can parse them directly
        const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
        if (dateMatch) {
          return SqlUtils.transformDate(dateMatch);
        }
      }
      
      // Try to parse as ISO date
      const isoDate = new Date(value);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }
    }
    
    if (typeof value === 'number' && (databaseType === 'mysql' || databaseType === 'sqlite')) {
      // MySQL and SQLite boolean values
      if (value === 0 || value === 1) {
        return Boolean(value);
      }
    }
    
    return value;
  }

  /**
   * Generates a unique table name for temporary operations
   */
  static generateTempTableName(prefix: string = 'temp'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Sanitizes a table or column name
   */
  static sanitizeName(name: string): string {
    if (!name) {
      return '';
    }
    
    // Remove any characters that could be used for SQL injection
    return name.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Builds a WHERE clause from an object
   */
  static buildWhereClause(conditions: Record<string, any>, databaseType: DatabaseType): { sql: string; params: any[] } {
    console.log('🔍 buildWhereClause called with:', { conditions, databaseType });
    
    const clauses: string[] = [];
    const params: any[] = [];
    
    for (const [key, value] of Object.entries(conditions)) {
      if (value === null || value === undefined) {
        clauses.push(`${this.escapeIdentifier(key, databaseType)} IS NULL`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          clauses.push('1 = 0'); // Always false
        } else {
          const placeholders = value.map(() => '?').join(', ');
          clauses.push(`${this.escapeIdentifier(key, databaseType)} IN (${placeholders})`);
          params.push(...value);
        }
      } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        // Handle MongoDB operators like { $gte: 25 }
        for (const [operator, operatorValue] of Object.entries(value)) {
          switch (operator) {
            case '$gte':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} >= ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            case '$lte':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} <= ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            case '$gt':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} > ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            case '$lt':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} < ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            case '$ne':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} != ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            case '$in':
              if (Array.isArray(operatorValue)) {
                const placeholders = operatorValue.map(() => '?').join(', ');
                clauses.push(`${this.escapeIdentifier(key, databaseType)} IN (${placeholders})`);
                params.push(...operatorValue.map(v => this.toSqlValue(v, databaseType)));
              }
              break;
            case '$nin':
              if (Array.isArray(operatorValue)) {
                const placeholders = operatorValue.map(() => '?').join(', ');
                clauses.push(`${this.escapeIdentifier(key, databaseType)} NOT IN (${placeholders})`);
                params.push(...operatorValue.map(v => this.toSqlValue(v, databaseType)));
              }
              break;
            case '$like':
              clauses.push(`${this.escapeIdentifier(key, databaseType)} LIKE ?`);
              params.push(this.toSqlValue(operatorValue, databaseType));
              break;
            default:
              // Unknown operator, treat as equality
              clauses.push(`${this.escapeIdentifier(key, databaseType)} = ?`);
              params.push(this.toSqlValue(value, databaseType));
          }
        }
      } else {
        clauses.push(`${this.escapeIdentifier(key, databaseType)} = ?`);
        params.push(this.toSqlValue(value, databaseType));
      }
    }
    
    const sql = clauses.length > 0 ? clauses.join(' AND ') : '1 = 1';
    console.log('🔍 buildWhereClause result:', { sql, params });
    
    return { sql, params };
  }

  /**
   * Builds an ORDER BY clause
   */
  static buildOrderByClause(orderBy: Record<string, 'ASC' | 'DESC'> | string[]): string {
    if (Array.isArray(orderBy)) {
      return orderBy.map(field => this.escapeIdentifier(field)).join(', ');
    }
    
    const clauses: string[] = [];
    for (const [field, direction] of Object.entries(orderBy)) {
      clauses.push(`${this.escapeIdentifier(field)} ${direction}`);
    }
    
    return clauses.join(', ');
  }

  /**
   * Builds a LIMIT clause
   */
  static buildLimitClause(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return '';
    }
    
    if (offset !== undefined && limit !== undefined) {
      return `LIMIT ${offset}, ${limit}`;
    }
    
    if (limit !== undefined) {
      return `LIMIT ${limit}`;
    }
    
    return '';
  }
}
