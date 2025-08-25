import { SqlTransformers } from '../sql.transformers';
import { DatabaseType } from '../sql.types';

describe('SqlTransformers', () => {
  describe('toSql', () => {
    it('should return null for null value', () => {
      expect(SqlTransformers.toSql(null, 'mysql')).toBeNull();
      expect(SqlTransformers.toSql(null, 'postgresql')).toBeNull();
    });

    it('should return null for undefined value', () => {
      expect(SqlTransformers.toSql(undefined, 'mysql')).toBeNull();
      expect(SqlTransformers.toSql(undefined, 'postgresql')).toBeNull();
    });

    it('should transform Date objects for MySQL', () => {
      const date = new Date('2023-01-01T12:30:45.123Z');
      const result = SqlTransformers.toSql(date, 'mysql');
      expect(result).toBe('2023-01-01 12:30:45');
    });

    it('should transform Date objects for PostgreSQL', () => {
      const date = new Date('2023-01-01T12:30:45.123Z');
      const result = SqlTransformers.toSql(date, 'postgresql');
      expect(result).toBe('2023-01-01T12:30:45.123Z');
    });

    it('should transform boolean values for MySQL', () => {
      expect(SqlTransformers.toSql(true, 'mysql')).toBe(1);
      expect(SqlTransformers.toSql(false, 'mysql')).toBe(0);
    });

    it('should preserve boolean values for PostgreSQL', () => {
      expect(SqlTransformers.toSql(true, 'postgresql')).toBe(true);
      expect(SqlTransformers.toSql(false, 'postgresql')).toBe(false);
    });

    it('should transform objects to JSON strings', () => {
      const obj = { name: 'John', age: 30 };
      const result = SqlTransformers.toSql(obj, 'mysql');
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should preserve primitive values', () => {
      expect(SqlTransformers.toSql('hello', 'mysql')).toBe('hello');
      expect(SqlTransformers.toSql(42, 'mysql')).toBe(42);
      expect(SqlTransformers.toSql([1, 2, 3], 'mysql')).toEqual([1, 2, 3]);
    });
  });

  describe('fromSql', () => {
    it('should return null for null value', () => {
      expect(SqlTransformers.fromSql(null, 'mysql')).toBeNull();
      expect(SqlTransformers.fromSql(null, 'postgresql')).toBeNull();
    });

    it('should return null for undefined value', () => {
      expect(SqlTransformers.fromSql(undefined, 'mysql')).toBeNull();
      expect(SqlTransformers.fromSql(undefined, 'postgresql')).toBeNull();
    });

    it('should parse JSON strings to objects', () => {
      const jsonString = '{"name":"John","age":30}';
      const result = SqlTransformers.fromSql(jsonString, 'mysql');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = '{"name":"John"';
      const result = SqlTransformers.fromSql(invalidJson, 'mysql');
      expect(result).toBe(invalidJson);
    });

    it('should parse MySQL datetime format', () => {
      const mysqlDate = '2023-01-01 12:30:45';
      const result = SqlTransformers.fromSql(mysqlDate, 'mysql');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(0); // January (0-indexed)
      expect(result?.getDate()).toBe(1);
      expect(result?.getHours()).toBe(12);
      expect(result?.getMinutes()).toBe(30);
      expect(result?.getSeconds()).toBe(45);
    });

    it('should parse ISO date strings', () => {
      const isoDate = '2023-01-01T12:30:45.123Z';
      const result = SqlTransformers.fromSql(isoDate, 'postgresql');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(new Date(isoDate).getTime());
    });

    it('should handle invalid date strings gracefully', () => {
      const invalidDate = 'not-a-date';
      const result = SqlTransformers.fromSql(invalidDate, 'postgresql');
      expect(result).toBe(invalidDate);
    });

    it('should transform MySQL boolean values', () => {
      expect(SqlTransformers.fromSql(1, 'mysql')).toBe(true);
      expect(SqlTransformers.fromSql(0, 'mysql')).toBe(false);
    });

    it('should preserve other numeric values', () => {
      expect(SqlTransformers.fromSql(42, 'mysql')).toBe(42);
      expect(SqlTransformers.fromSql(3.14, 'mysql')).toBe(3.14);
    });

    it('should return value as-is for non-special cases', () => {
      expect(SqlTransformers.fromSql('hello', 'postgresql')).toBe('hello');
      expect(SqlTransformers.fromSql(42, 'postgresql')).toBe(42);
    });
  });

  describe('lowercase', () => {
    it('should transform string to lowercase', () => {
      expect(SqlTransformers.lowercase('Hello World')).toBe('hello world');
      expect(SqlTransformers.lowercase('SQL DATABASE')).toBe('sql database');
    });

    it('should handle empty string', () => {
      expect(SqlTransformers.lowercase('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.lowercase(null as any)).toBe('');
      expect(SqlTransformers.lowercase(undefined as any)).toBe('');
    });

    it('should handle already lowercase strings', () => {
      expect(SqlTransformers.lowercase('hello world')).toBe('hello world');
    });
  });

  describe('uppercase', () => {
    it('should transform string to uppercase', () => {
      expect(SqlTransformers.uppercase('hello world')).toBe('HELLO WORLD');
      expect(SqlTransformers.uppercase('sql database')).toBe('SQL DATABASE');
    });

    it('should handle empty string', () => {
      expect(SqlTransformers.uppercase('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.uppercase(null as any)).toBe('');
      expect(SqlTransformers.uppercase(undefined as any)).toBe('');
    });

    it('should handle already uppercase strings', () => {
      expect(SqlTransformers.uppercase('HELLO WORLD')).toBe('HELLO WORLD');
    });
  });

  describe('trim', () => {
    it('should trim whitespace from string', () => {
      expect(SqlTransformers.trim('  hello world  ')).toBe('hello world');
      expect(SqlTransformers.trim('\t\nhello world\n\t')).toBe('hello world');
    });

    it('should handle string with no whitespace', () => {
      expect(SqlTransformers.trim('hello world')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(SqlTransformers.trim('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.trim(null as any)).toBe('');
      expect(SqlTransformers.trim(undefined as any)).toBe('');
    });
  });

  describe('arrayToString', () => {
    it('should transform array to comma-separated string', () => {
      expect(SqlTransformers.arrayToString(['a', 'b', 'c'])).toBe('a,b,c');
      expect(SqlTransformers.arrayToString([1, 2, 3])).toBe('1,2,3');
    });

    it('should handle empty array', () => {
      expect(SqlTransformers.arrayToString([])).toBe('');
    });

    it('should handle single element array', () => {
      expect(SqlTransformers.arrayToString(['hello'])).toBe('hello');
    });

    it('should handle non-array values', () => {
      expect(SqlTransformers.arrayToString('not an array' as any)).toBe('');
      expect(SqlTransformers.arrayToString(null as any)).toBe('');
      expect(SqlTransformers.arrayToString(undefined as any)).toBe('');
    });
  });

  describe('stringToArray', () => {
    it('should transform comma-separated string to array', () => {
      expect(SqlTransformers.stringToArray('a,b,c')).toEqual(['a', 'b', 'c']);
      expect(SqlTransformers.stringToArray('1,2,3')).toEqual(['1', '2', '3']);
    });

    it('should trim whitespace from array elements', () => {
      expect(SqlTransformers.stringToArray(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    it('should filter out empty elements', () => {
      expect(SqlTransformers.stringToArray('a,,b,c')).toEqual(['a', 'b', 'c']);
      expect(SqlTransformers.stringToArray('a, ,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle empty string', () => {
      expect(SqlTransformers.stringToArray('')).toEqual([]);
    });

    it('should handle non-string values', () => {
      expect(SqlTransformers.stringToArray(null as any)).toEqual([]);
      expect(SqlTransformers.stringToArray(undefined as any)).toEqual([]);
      expect(SqlTransformers.stringToArray(42 as any)).toEqual([]);
    });
  });

  describe('objectToJson', () => {
    it('should transform object to JSON string', () => {
      const obj = { name: 'John', age: 30 };
      const result = SqlTransformers.objectToJson(obj);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.objectToJson(null)).toBe('');
      expect(SqlTransformers.objectToJson(undefined)).toBe('');
    });

    it('should handle primitive values', () => {
      expect(SqlTransformers.objectToJson('hello')).toBe('"hello"');
      expect(SqlTransformers.objectToJson(42)).toBe('42');
      expect(SqlTransformers.objectToJson(true)).toBe('true');
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'John' };
      obj.self = obj;
      const result = SqlTransformers.objectToJson(obj);
      expect(result).toBe('');
    });
  });

  describe('jsonToObject', () => {
    it('should transform JSON string to object', () => {
      const jsonString = '{"name":"John","age":30}';
      const result = SqlTransformers.jsonToObject(jsonString);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.jsonToObject(null as any)).toBeNull();
      expect(SqlTransformers.jsonToObject(undefined as any)).toBeNull();
    });

    it('should handle non-string values', () => {
      expect(SqlTransformers.jsonToObject(42 as any)).toBeNull();
      expect(SqlTransformers.jsonToObject({} as any)).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = '{"name":"John"';
      const result = SqlTransformers.jsonToObject(invalidJson);
      expect(result).toBeNull();
    });
  });

  describe('toInteger', () => {
    it('should transform values to integers', () => {
      expect(SqlTransformers.toInteger(42.7)).toBe(42);
      expect(SqlTransformers.toInteger('42.7')).toBe(42);
      expect(SqlTransformers.toInteger('42')).toBe(42);
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toInteger(null)).toBe(0);
      expect(SqlTransformers.toInteger(undefined)).toBe(0);
    });

    it('should handle invalid numbers', () => {
      expect(SqlTransformers.toInteger('not a number')).toBe(0);
      expect(SqlTransformers.toInteger(NaN)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toInteger(0)).toBe(0);
      expect(SqlTransformers.toInteger(-42.7)).toBe(-43); // Math.floor rounds down
    });
  });

  describe('toFloat', () => {
    it('should transform values to floats', () => {
      expect(SqlTransformers.toFloat(42.7)).toBe(42.7);
      expect(SqlTransformers.toFloat('42.7')).toBe(42.7);
      expect(SqlTransformers.toFloat('42')).toBe(42);
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toFloat(null)).toBe(0);
      expect(SqlTransformers.toFloat(undefined)).toBe(0);
    });

    it('should handle invalid numbers', () => {
      expect(SqlTransformers.toFloat('not a number')).toBe(0);
      expect(SqlTransformers.toFloat(NaN)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toFloat(0)).toBe(0);
      expect(SqlTransformers.toFloat(-42.7)).toBe(-42.7);
    });
  });

  describe('toBoolean', () => {
    it('should transform values to booleans', () => {
      expect(SqlTransformers.toBoolean(true)).toBe(true);
      expect(SqlTransformers.toBoolean(false)).toBe(false);
      expect(SqlTransformers.toBoolean(1)).toBe(true);
      expect(SqlTransformers.toBoolean(0)).toBe(false);
      expect(SqlTransformers.toBoolean('true')).toBe(true);
      expect(SqlTransformers.toBoolean('false')).toBe(false);
      expect(SqlTransformers.toBoolean('1')).toBe(true);
      expect(SqlTransformers.toBoolean('yes')).toBe(true);
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toBoolean(null)).toBe(false);
      expect(SqlTransformers.toBoolean(undefined)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toBoolean('')).toBe(false);
      expect(SqlTransformers.toBoolean('random')).toBe(false);
      expect(SqlTransformers.toBoolean({})).toBe(true);
      expect(SqlTransformers.toBoolean([])).toBe(true);
    });
  });

  describe('toString', () => {
    it('should transform values to strings', () => {
      expect(SqlTransformers.toString(42)).toBe('42');
      expect(SqlTransformers.toString(true)).toBe('true');
      expect(SqlTransformers.toString({ name: 'John' })).toBe('[object Object]');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toString(null)).toBe('');
      expect(SqlTransformers.toString(undefined)).toBe('');
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toString('')).toBe('');
      expect(SqlTransformers.toString(0)).toBe('0');
      expect(SqlTransformers.toString(false)).toBe('false');
    });
  });

  describe('toDate', () => {
    it('should transform values to dates', () => {
      const date = new Date('2023-01-01');
      expect(SqlTransformers.toDate(date)).toEqual(date);
      expect(SqlTransformers.toDate('2023-01-01')).toEqual(new Date('2023-01-01'));
      expect(SqlTransformers.toDate(1672531200000)).toEqual(new Date(1672531200000));
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toDate(null)).toBeNull();
      expect(SqlTransformers.toDate(undefined)).toBeNull();
    });

    it('should handle invalid dates', () => {
      expect(SqlTransformers.toDate('not a date')).toBeNull();
      expect(SqlTransformers.toDate('invalid')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toDate('')).toBeNull();
      expect(SqlTransformers.toDate({})).toBeNull();
    });
  });

  describe('toTimestamp', () => {
    it('should transform values to timestamps', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      const timestamp = date.getTime();
      expect(SqlTransformers.toTimestamp(date)).toBe(timestamp);
      expect(SqlTransformers.toTimestamp(timestamp)).toBe(timestamp);
      expect(SqlTransformers.toTimestamp('2023-01-01T00:00:00Z')).toBe(timestamp);
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toTimestamp(null)).toBeNull();
      expect(SqlTransformers.toTimestamp(undefined)).toBeNull();
    });

    it('should handle invalid dates', () => {
      expect(SqlTransformers.toTimestamp('not a date')).toBeNull();
      expect(SqlTransformers.toTimestamp('invalid')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toTimestamp('')).toBeNull();
      expect(SqlTransformers.toTimestamp({})).toBeNull();
    });
  });

  describe('toDecimal', () => {
    it('should transform values to decimal strings', () => {
      expect(SqlTransformers.toDecimal(42.123)).toBe('42.12');
      expect(SqlTransformers.toDecimal(42.123, 3)).toBe('42.123');
      expect(SqlTransformers.toDecimal('42.123')).toBe('42.12');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toDecimal(null)).toBe('0.00');
      expect(SqlTransformers.toDecimal(undefined)).toBe('0.00');
    });

    it('should handle invalid numbers', () => {
      expect(SqlTransformers.toDecimal('not a number')).toBe('0.00');
      expect(SqlTransformers.toDecimal(NaN)).toBe('0.00');
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toDecimal(0)).toBe('0.00');
      expect(SqlTransformers.toDecimal(-42.123)).toBe('-42.12');
      expect(SqlTransformers.toDecimal(42.123, 0)).toBe('42');
    });
  });

  describe('toCurrency', () => {
    it('should transform values to currency strings', () => {
      expect(SqlTransformers.toCurrency(42.123)).toBe('42.12 USD');
      expect(SqlTransformers.toCurrency(42.123, 'EUR')).toBe('42.12 EUR');
      expect(SqlTransformers.toCurrency('42.123')).toBe('42.12 USD');
    });

    it('should handle null and undefined', () => {
      expect(SqlTransformers.toCurrency(null)).toBe('0.00 USD');
      expect(SqlTransformers.toCurrency(undefined)).toBe('0.00 USD');
    });

    it('should handle invalid numbers', () => {
      expect(SqlTransformers.toCurrency('not a number')).toBe('0.00 USD');
      expect(SqlTransformers.toCurrency(NaN)).toBe('0.00 USD');
    });

    it('should handle edge cases', () => {
      expect(SqlTransformers.toCurrency(0)).toBe('0.00 USD');
      expect(SqlTransformers.toCurrency(-42.123)).toBe('-42.12 USD');
      expect(SqlTransformers.toCurrency(42.123, 'PLN')).toBe('42.12 PLN');
    });
  });
});
