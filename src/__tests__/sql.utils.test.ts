import { SqlUtils } from '../sql.utils';
import { DatabaseType } from '../sql.types';

describe('SqlUtils', () => {
  describe('escapeString', () => {
    it('should return NULL for null value', () => {
      expect(SqlUtils.escapeString(null as any)).toBe('NULL');
    });

    it('should return NULL for undefined value', () => {
      expect(SqlUtils.escapeString(undefined as any)).toBe('NULL');
    });

    it('should escape single quotes by doubling them', () => {
      expect(SqlUtils.escapeString("O'Connor")).toBe("'O''Connor'");
      expect(SqlUtils.escapeString("user's data")).toBe("'user''s data'");
    });

    it('should wrap string in single quotes', () => {
      expect(SqlUtils.escapeString('hello')).toBe("'hello'");
      expect(SqlUtils.escapeString('')).toBe("''");
    });

    it('should handle strings with multiple single quotes', () => {
      expect(SqlUtils.escapeString("can't won't don't")).toBe("'can''t won''t don''t'");
    });
  });

  describe('escapeIdentifier', () => {
    it('should return empty string for falsy values', () => {
      expect(SqlUtils.escapeIdentifier('')).toBe('');
      expect(SqlUtils.escapeIdentifier(null as any)).toBe('');
      expect(SqlUtils.escapeIdentifier(undefined as any)).toBe('');
    });

    it('should escape double quotes by doubling them', () => {
      expect(SqlUtils.escapeIdentifier('table"name')).toBe('"table""name"');
      expect(SqlUtils.escapeIdentifier('column"with"quotes')).toBe('"column""with""quotes"');
    });

    it('should wrap identifier in double quotes', () => {
      expect(SqlUtils.escapeIdentifier('users')).toBe('"users"');
      expect(SqlUtils.escapeIdentifier('user_name')).toBe('"user_name"');
    });

    it('should handle identifiers with special characters', () => {
      expect(SqlUtils.escapeIdentifier('user-table')).toBe('"user-table"');
      expect(SqlUtils.escapeIdentifier('123column')).toBe('"123column"');
    });
  });

  describe('buildParameterizedQuery', () => {
    it('should replace question marks with escaped values', () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND age = ?';
      const params = ['John', 25];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE name = 'John' AND age = 25");
    });

    it('should handle null values', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = [null];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe('SELECT * FROM users WHERE name = NULL');
    });

    it('should handle undefined values', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = [undefined];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe('SELECT * FROM users WHERE name = NULL');
    });

    it('should handle string values', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = ["O'Connor"];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE name = 'O''Connor'");
    });

    it('should handle number values', () => {
      const sql = 'SELECT * FROM users WHERE age = ? AND score = ?';
      const params = [25, 3.14];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe('SELECT * FROM users WHERE age = 25 AND score = 3.14');
    });

    it('should handle boolean values', () => {
      const sql = 'SELECT * FROM users WHERE active = ? AND verified = ?';
      const params = [true, false];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe('SELECT * FROM users WHERE active = 1 AND verified = 0');
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      const sql = 'SELECT * FROM users WHERE created_at = ?';
      const params = [date];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE created_at = '2023-01-01T00:00:00.000Z'");
    });

    it('should handle array values', () => {
      const sql = 'SELECT * FROM users WHERE tags = ?';
      const params = [['admin', 'user']];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE tags = 'admin', 'user'");
    });

    it('should handle object values', () => {
      const sql = 'SELECT * FROM users WHERE metadata = ?';
      const params = [{ role: 'admin', permissions: ['read', 'write'] }];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE metadata = '{\"role\":\"admin\",\"permissions\":[\"read\",\"write\"]}'");
    });

    it('should handle mixed parameter types', () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND age = ? AND active = ?';
      const params = ['John', 25, true];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE name = 'John' AND age = 25 AND active = 1");
    });

    it('should handle no parameters', () => {
      const sql = 'SELECT * FROM users';
      const params: any[] = [];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe('SELECT * FROM users');
    });

    it('should handle more placeholders than parameters', () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND age = ?';
      const params = ['John'];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE name = 'John' AND age = NULL");
    });

    it('should handle unknown parameter types', () => {
      const sql = 'SELECT * FROM users WHERE data = ?';
      const params = [Symbol('test')];
      const result = SqlUtils.buildParameterizedQuery(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE data = 'Symbol(test)'");
    });
  });

  describe('toSqlValue', () => {
    it('should return null for null values', () => {
      expect(SqlUtils.toSqlValue(null, 'mysql')).toBeNull();
      expect(SqlUtils.toSqlValue(undefined, 'postgresql')).toBeNull();
    });

    it('should handle Date objects for MySQL', () => {
      const date = new Date('2023-01-01T12:34:56.789Z');
      const result = SqlUtils.toSqlValue(date, 'mysql');
      expect(result).toBe('2023-01-01 12:34:56');
    });

    it('should handle Date objects for PostgreSQL', () => {
      const date = new Date('2023-01-01T12:34:56.789Z');
      const result = SqlUtils.toSqlValue(date, 'postgresql');
      expect(result).toBe('2023-01-01T12:34:56.789Z');
    });

    it('should handle boolean values for MySQL', () => {
      expect(SqlUtils.toSqlValue(true, 'mysql')).toBe(1);
      expect(SqlUtils.toSqlValue(false, 'mysql')).toBe(0);
    });

    it('should handle boolean values for PostgreSQL', () => {
      expect(SqlUtils.toSqlValue(true, 'postgresql')).toBe(true);
      expect(SqlUtils.toSqlValue(false, 'postgresql')).toBe(false);
    });

    it('should handle object values', () => {
      const obj = { name: 'John', age: 25 };
      const result = SqlUtils.toSqlValue(obj, 'mysql');
      expect(result).toBe('{"name":"John","age":25}');
    });

    it('should handle primitive values', () => {
      expect(SqlUtils.toSqlValue('hello', 'mysql')).toBe('hello');
      expect(SqlUtils.toSqlValue(42, 'postgresql')).toBe(42);
      expect(SqlUtils.toSqlValue(3.14, 'mysql')).toBe(3.14);
    });

    it('should handle array values', () => {
      expect(SqlUtils.toSqlValue([1, 2, 3], 'mysql')).toEqual([1, 2, 3]);
    });
  });

  describe('fromSqlValue', () => {
    it('should return null for null values', () => {
      expect(SqlUtils.fromSqlValue(null, 'mysql')).toBeNull();
      expect(SqlUtils.fromSqlValue(undefined, 'postgresql')).toBeNull();
    });

    it('should parse JSON strings', () => {
      const jsonString = '{"name":"John","age":25}';
      const result = SqlUtils.fromSqlValue(jsonString, 'mysql');
      expect(result).toEqual({ name: 'John', age: 25 });
    });

    it('should not parse non-JSON strings', () => {
      const stringValue = 'hello world';
      const result = SqlUtils.fromSqlValue(stringValue, 'mysql');
      expect(result).toBe('hello world');
    });

    it('should parse MySQL datetime format', () => {
      const mysqlDate = '2023-01-01 12:34:56';
      const result = SqlUtils.fromSqlValue(mysqlDate, 'mysql');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(12);
      expect(result.getMinutes()).toBe(34);
      expect(result.getSeconds()).toBe(56);
    });

    it('should parse ISO date strings', () => {
      const isoDate = '2023-01-01T12:34:56.789Z';
      const result = SqlUtils.fromSqlValue(isoDate, 'mysql');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(new Date(isoDate).getTime());
    });

    it('should handle invalid date strings', () => {
      const invalidDate = 'not a date';
      const result = SqlUtils.fromSqlValue(invalidDate, 'mysql');
      expect(result).toBe('not a date');
    });

    it('should handle MySQL boolean values', () => {
      expect(SqlUtils.fromSqlValue(0, 'mysql')).toBe(false);
      expect(SqlUtils.fromSqlValue(1, 'mysql')).toBe(true);
      expect(SqlUtils.fromSqlValue(42, 'mysql')).toBe(42);
    });

    it('should not convert numbers to booleans for PostgreSQL', () => {
      expect(SqlUtils.fromSqlValue(0, 'postgresql')).toBe(0);
      expect(SqlUtils.fromSqlValue(1, 'postgresql')).toBe(1);
    });

    it('should return original value for non-string types', () => {
      expect(SqlUtils.fromSqlValue(42, 'mysql')).toBe(42);
      expect(SqlUtils.fromSqlValue(true, 'postgresql')).toBe(true);
      expect(SqlUtils.fromSqlValue([1, 2, 3], 'mysql')).toEqual([1, 2, 3]);
    });
  });

  describe('generateTempTableName', () => {
    it('should generate unique table names with default prefix', () => {
      const name1 = SqlUtils.generateTempTableName();
      const name2 = SqlUtils.generateTempTableName();
      
      expect(name1).toMatch(/^temp_\d+_[a-z0-9]{6}$/);
      expect(name2).toMatch(/^temp_\d+_[a-z0-9]{6}$/);
      expect(name1).not.toBe(name2);
    });

    it('should generate unique table names with custom prefix', () => {
      const name1 = SqlUtils.generateTempTableName('custom');
      const name2 = SqlUtils.generateTempTableName('custom');
      
      expect(name1).toMatch(/^custom_\d+_[a-z0-9]{6}$/);
      expect(name2).toMatch(/^custom_\d+_[a-z0-9]{6}$/);
      expect(name1).not.toBe(name2);
    });

    it('should include timestamp and random string', () => {
      const name = SqlUtils.generateTempTableName('test');
      const parts = name.split('_');
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('test');
      expect(parseInt(parts[1])).toBeGreaterThan(0);
      expect(parts[2]).toMatch(/^[a-z0-9]{6}$/);
    });
  });

  describe('sanitizeName', () => {
    it('should return empty string for falsy values', () => {
      expect(SqlUtils.sanitizeName('')).toBe('');
      expect(SqlUtils.sanitizeName(null as any)).toBe('');
      expect(SqlUtils.sanitizeName(undefined as any)).toBe('');
    });

    it('should keep alphanumeric and underscore characters', () => {
      expect(SqlUtils.sanitizeName('user_name')).toBe('user_name');
      expect(SqlUtils.sanitizeName('table123')).toBe('table123');
      expect(SqlUtils.sanitizeName('_private')).toBe('_private');
    });

    it('should remove special characters', () => {
      expect(SqlUtils.sanitizeName('user-name')).toBe('username');
      expect(SqlUtils.sanitizeName('table.name')).toBe('tablename');
      expect(SqlUtils.sanitizeName('user@domain')).toBe('userdomain');
      expect(SqlUtils.sanitizeName('user space')).toBe('userspace');
    });

    it('should handle mixed characters', () => {
      expect(SqlUtils.sanitizeName('user-name_123')).toBe('username_123');
      expect(SqlUtils.sanitizeName('table.name@domain')).toBe('tablenamedomain');
    });
  });

  describe('buildWhereClause', () => {
    it('should build WHERE clause from simple conditions', () => {
      const conditions = { name: 'John', age: 25 };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`name` = ? AND `age` = ?');
      expect(result.params).toEqual(['John', 25]);
    });

    it('should handle null values as IS NULL', () => {
      const conditions = { name: null, age: 25 };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`name` IS NULL AND `age` = ?');
      expect(result.params).toEqual([25]);
    });

    it('should handle undefined values as IS NULL', () => {
      const conditions = { name: undefined, age: 25 };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`name` IS NULL AND `age` = ?');
      expect(result.params).toEqual([25]);
    });

    it('should handle array values as IN clause', () => {
      const conditions = { status: ['active', 'pending'] };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`status` IN (?, ?)');
      expect(result.params).toEqual(['active', 'pending']);
    });

    it('should handle empty arrays as always false', () => {
      const conditions = { tags: [] };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('1 = 0');
      expect(result.params).toEqual([]);
    });

    it('should return 1 = 1 for empty conditions', () => {
      const conditions = {};
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('1 = 1');
      expect(result.params).toEqual([]);
    });

    it('should handle mixed condition types', () => {
      const conditions = {
        name: 'John',
        age: null,
        status: ['active', 'pending'],
        verified: true
      };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`name` = ? AND `age` IS NULL AND `status` IN (?, ?) AND `verified` = ?');
      expect(result.params).toEqual(['John', 'active', 'pending', 1]);
    });

    it('should convert values using toSqlValue', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      const conditions = { created_at: date };
      const result = SqlUtils.buildWhereClause(conditions, 'mysql');
      
      expect(result.sql).toBe('`created_at` = ?');
      expect(result.params).toEqual(['2023-01-01 00:00:00']);
    });
  });

  describe('buildOrderByClause', () => {
    it('should build ORDER BY from array of fields', () => {
      const orderBy = ['name', 'age', 'created_at'];
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('"name", "age", "created_at"');
    });

    it('should build ORDER BY from object with directions', () => {
      const orderBy: Record<string, 'ASC' | 'DESC'> = { name: 'ASC', age: 'DESC' };
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('"name" ASC, "age" DESC');
    });

    it('should handle mixed case directions', () => {
      const orderBy: Record<string, 'ASC' | 'DESC'> = { name: 'ASC', age: 'DESC' };
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('"name" ASC, "age" DESC');
    });

    it('should handle single field array', () => {
      const orderBy = ['name'];
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('"name"');
    });

    it('should handle single field object', () => {
      const orderBy: Record<string, 'ASC' | 'DESC'> = { name: 'ASC' };
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('"name" ASC');
    });

    it('should handle empty array', () => {
      const orderBy: string[] = [];
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('');
    });

    it('should handle empty object', () => {
      const orderBy = {};
      const result = SqlUtils.buildOrderByClause(orderBy);
      
      expect(result).toBe('');
    });
  });

  describe('buildLimitClause', () => {
    it('should return empty string when no limit or offset', () => {
      expect(SqlUtils.buildLimitClause()).toBe('');
      expect(SqlUtils.buildLimitClause(undefined, undefined)).toBe('');
    });

    it('should build LIMIT clause with only limit', () => {
      expect(SqlUtils.buildLimitClause(10)).toBe('LIMIT 10');
      expect(SqlUtils.buildLimitClause(100)).toBe('LIMIT 100');
    });

    it('should build LIMIT clause with limit and offset', () => {
      expect(SqlUtils.buildLimitClause(10, 20)).toBe('LIMIT 20, 10');
      expect(SqlUtils.buildLimitClause(5, 0)).toBe('LIMIT 0, 5');
    });

    it('should handle offset without limit', () => {
      expect(SqlUtils.buildLimitClause(undefined, 20)).toBe('');
    });

    it('should handle zero values', () => {
      expect(SqlUtils.buildLimitClause(0)).toBe('LIMIT 0');
      expect(SqlUtils.buildLimitClause(10, 0)).toBe('LIMIT 0, 10');
    });
  });
});
