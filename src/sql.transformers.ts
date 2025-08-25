import { DatabaseType } from './sql.types';

/**
 * Common transformers for SQL operations
 */
export class SqlTransformers {
  /**
   * Transforms a value to SQL format
   */
  static toSql(value: any, databaseType: DatabaseType): any {
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
   * Transforms a value from SQL format
   */
  static fromSql(value: any, databaseType: DatabaseType): any {
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
          return new Date(
            parseInt(dateMatch[1]),
            parseInt(dateMatch[2]) - 1,
            parseInt(dateMatch[3]),
            parseInt(dateMatch[4]),
            parseInt(dateMatch[5]),
            parseInt(dateMatch[6])
          );
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
   * Transforms a string to lowercase
   */
  static lowercase(value: string): string {
    return value?.toLowerCase() || '';
  }

  /**
   * Transforms a string to uppercase
   */
  static uppercase(value: string): string {
    return value?.toUpperCase() || '';
  }

  /**
   * Trims whitespace from a string
   */
  static trim(value: string): string {
    return value?.trim() || '';
  }

  /**
   * Transforms an array to a comma-separated string
   */
  static arrayToString(value: any[]): string {
    if (!Array.isArray(value)) {
      return '';
    }
    return value.join(',');
  }

  /**
   * Transforms a comma-separated string to an array
   */
  static stringToArray(value: string): string[] {
    if (typeof value !== 'string') {
      return [];
    }
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * Transforms an object to a JSON string
   */
  static objectToJson(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  /**
   * Transforms a JSON string to an object
   */
  static jsonToObject(value: string): any {
    if (typeof value !== 'string') {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  /**
   * Transforms a number to an integer
   */
  static toInteger(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = Number(value);
    return isNaN(num) ? 0 : Math.floor(num);
  }

  /**
   * Transforms a number to a float
   */
  static toFloat(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Transforms a value to a boolean
   */
  static toBoolean(value: any): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return Boolean(value);
  }

  /**
   * Transforms a value to a string
   */
  static toString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  /**
   * Transforms a value to a date
   */
  static toDate(value: any): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  /**
   * Transforms a value to a timestamp
   */
  static toTimestamp(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.getTime();
    }
    return null;
  }

  /**
   * Transforms a value to a decimal string
   */
  static toDecimal(value: any, precision: number = 2): string {
    if (value === null || value === undefined) {
      return '0.00';
    }
    const num = Number(value);
    if (isNaN(num)) {
      return '0.00';
    }
    return num.toFixed(precision);
  }

  /**
   * Transforms a value to a currency string
   */
  static toCurrency(value: any, currency: string = 'USD'): string {
    if (value === null || value === undefined) {
      return `0.00 ${currency}`;
    }
    const num = Number(value);
    if (isNaN(num)) {
      return `0.00 ${currency}`;
    }
    return `${num.toFixed(2)} ${currency}`;
  }
}
