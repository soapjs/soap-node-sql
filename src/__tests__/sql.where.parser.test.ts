import { SqlWhereParser, ParsedWhereClause } from '../sql.where.parser';
import { SqlFieldMapping } from '../sql.types';
import { Where } from '@soapjs/soap';

describe('SqlWhereParser', () => {
  let parser: SqlWhereParser;

  beforeEach(() => {
    parser = new SqlWhereParser('mysql');
  });

  describe('constructor and configuration', () => {
    it('should create parser with default settings', () => {
      expect(parser).toBeInstanceOf(SqlWhereParser);
    });

    it('should create parser with field mappings', () => {
      const fieldMappings: SqlFieldMapping[] = [
        { name: 'user_id', type: 'number', nullable: false },
        { name: 'email', type: 'string', nullable: true }
      ];
      const parserWithMappings = new SqlWhereParser('mysql', fieldMappings);
      expect(parserWithMappings).toBeInstanceOf(SqlWhereParser);
    });

    it('should create parser with table alias', () => {
      const parserWithAlias = new SqlWhereParser('mysql', undefined, 'users');
      expect(parserWithAlias).toBeInstanceOf(SqlWhereParser);
    });

    it('should set field mappings', () => {
      const fieldMappings: SqlFieldMapping[] = [
        { name: 'id', type: 'number', nullable: false }
      ];
      parser.setFieldMappings(fieldMappings);
      // Note: field mappings are private, so we test through behavior
    });

    it('should set table alias', () => {
      parser.setTableAlias('products');
      // Note: table alias is private, so we test through behavior
    });
  });

  describe('parse method', () => {
    it('should return empty result for null input', () => {
      const result = parser.parse(null);
      expect(result).toEqual({
        sql: '',
        params: [],
        hasConditions: false
      });
    });

    it('should return empty result for undefined input', () => {
      const result = parser.parse(undefined);
      expect(result).toEqual({
        sql: '',
        params: [],
        hasConditions: false
      });
    });

    it('should return empty result for empty object', () => {
      const result = parser.parse({});
      expect(result).toEqual({
        sql: '',
        params: [],
        hasConditions: false
      });
    });

    it('should return empty result for non-object input', () => {
      const result = parser.parse('string');
      expect(result).toEqual({
        sql: '',
        params: [],
        hasConditions: false
      });
    });
  });

  describe('simple equality conditions', () => {
    it('should parse simple string equality', () => {
      const result = parser.parse({ name: 'John' });
      expect(result.sql).toBe('WHERE `name` = ?');
      expect(result.params).toEqual(['John']);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse simple number equality', () => {
      const result = parser.parse({ age: 25 });
      expect(result.sql).toBe('WHERE `age` = ?');
      expect(result.params).toEqual([25]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse boolean equality', () => {
      const result = parser.parse({ active: true });
      expect(result.sql).toBe('WHERE `active` = ?');
      expect(result.params).toEqual([true]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse null values', () => {
      const result = parser.parse({ description: null });
      expect(result.sql).toBe('WHERE `description` IS NULL');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse undefined values as null', () => {
      const result = parser.parse({ description: undefined });
      expect(result.sql).toBe('WHERE `description` IS NULL');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse multiple simple conditions', () => {
      const result = parser.parse({ name: 'John', age: 25 });
      expect(result.sql).toBe('WHERE `name` = ? AND `age` = ?');
      expect(result.params).toEqual(['John', 25]);
      expect(result.hasConditions).toBe(true);
    });
  });

  describe('field operators', () => {
    it('should parse eq operator', () => {
      const result = parser.parse({ age: { eq: 25 } });
      expect(result.sql).toBe('WHERE `age` = ?');
      expect(result.params).toEqual([25]);
    });

    it('should parse ne operator', () => {
      const result = parser.parse({ age: { ne: 25 } });
      expect(result.sql).toBe('WHERE `age` != ?');
      expect(result.params).toEqual([25]);
    });

    it('should parse gt operator', () => {
      const result = parser.parse({ age: { gt: 18 } });
      expect(result.sql).toBe('WHERE `age` > ?');
      expect(result.params).toEqual([18]);
    });

    it('should parse gte operator', () => {
      const result = parser.parse({ age: { gte: 18 } });
      expect(result.sql).toBe('WHERE `age` >= ?');
      expect(result.params).toEqual([18]);
    });

    it('should parse lt operator', () => {
      const result = parser.parse({ age: { lt: 65 } });
      expect(result.sql).toBe('WHERE `age` < ?');
      expect(result.params).toEqual([65]);
    });

    it('should parse lte operator', () => {
      const result = parser.parse({ age: { lte: 65 } });
      expect(result.sql).toBe('WHERE `age` <= ?');
      expect(result.params).toEqual([65]);
    });

    it('should parse in operator with array', () => {
      const result = parser.parse({ status: { in: ['active', 'pending'] } });
      expect(result.sql).toBe('WHERE `status` IN (?, ?)');
      expect(result.params).toEqual(['active', 'pending']);
    });

    it('should parse nin operator with array', () => {
      const result = parser.parse({ status: { nin: ['inactive', 'deleted'] } });
      expect(result.sql).toBe('WHERE `status` NOT IN (?, ?)');
      expect(result.params).toEqual(['inactive', 'deleted']);
    });

    it('should parse in operator with empty array', () => {
      const result = parser.parse({ status: { in: [] } });
      expect(result.sql).toBe('WHERE 1=0');
      expect(result.params).toEqual([]);
    });

    it('should parse nin operator with empty array', () => {
      const result = parser.parse({ status: { nin: [] } });
      expect(result.sql).toBe('WHERE 1=1');
      expect(result.params).toEqual([]);
    });

    it('should parse like operator', () => {
      const result = parser.parse({ name: { like: 'John%' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['John%']);
    });

    it('should parse nlike operator', () => {
      const result = parser.parse({ name: { nlike: 'John%' } });
      expect(result.sql).toBe('WHERE `name` NOT LIKE ?');
      expect(result.params).toEqual(['John%']);
    });

    it('should parse regex operator (converted to LIKE)', () => {
      const result = parser.parse({ name: { regex: 'John.*' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['%John_%%']);
    });

    it('should parse nregex operator (converted to NOT LIKE)', () => {
      const result = parser.parse({ name: { nregex: 'John.*' } });
      expect(result.sql).toBe('WHERE `name` NOT LIKE ?');
      expect(result.params).toEqual(['%John_%%']);
    });

    it('should parse exists operator with true', () => {
      const result = parser.parse({ description: { exists: true } });
      expect(result.sql).toBe('WHERE `description` IS NOT NULL');
      expect(result.params).toEqual([]);
    });

    it('should parse exists operator with false', () => {
      const result = parser.parse({ description: { exists: false } });
      expect(result.sql).toBe('WHERE `description` IS NULL');
      expect(result.params).toEqual([]);
    });

    it('should parse nexists operator with true', () => {
      const result = parser.parse({ description: { nexists: true } });
      expect(result.sql).toBe('WHERE `description` IS NULL');
      expect(result.params).toEqual([]);
    });

    it('should parse nexists operator with false', () => {
      const result = parser.parse({ description: { nexists: false } });
      expect(result.sql).toBe('WHERE `description` IS NOT NULL');
      expect(result.params).toEqual([]);
    });

    it('should parse between operator', () => {
      const result = parser.parse({ age: { between: [18, 65] } });
      expect(result.sql).toBe('WHERE `age` BETWEEN ? AND ?');
      expect(result.params).toEqual([18, 65]);
    });

    it('should parse nbetween operator', () => {
      const result = parser.parse({ age: { nbetween: [18, 65] } });
      expect(result.sql).toBe('WHERE `age` NOT BETWEEN ? AND ?');
      expect(result.params).toEqual([18, 65]);
    });

    it('should parse between operator with invalid array', () => {
      const result = parser.parse({ age: { between: [18] } });
      expect(result.sql).toBe('WHERE 1=0');
      expect(result.params).toEqual([]);
    });

    it('should parse multiple field operators', () => {
      const result = parser.parse({
        age: { gte: 18, lte: 65 },
        status: { in: ['active', 'pending'] }
      });
      expect(result.sql).toBe('WHERE `age` >= ? AND `age` <= ? AND `status` IN (?, ?)');
      expect(result.params).toEqual([18, 65, 'active', 'pending']);
    });
  });

  describe('logical operators', () => {
    it('should parse $and operator', () => {
      const result = parser.parse({
        $and: [
          { age: { gte: 18 } },
          { status: 'active' }
        ]
      });
      expect(result.sql).toBe('WHERE (`age` >= ?) AND (`status` = ?)');
      expect(result.params).toEqual([18, 'active']);
    });

    it('should parse $or operator', () => {
      const result = parser.parse({
        $or: [
          { status: 'active' },
          { status: 'pending' }
        ]
      });
      expect(result.sql).toBe('WHERE (`status` = ?) OR (`status` = ?)');
      expect(result.params).toEqual(['active', 'pending']);
    });

    it('should parse $not operator', () => {
      const result = parser.parse({
        $not: { status: 'inactive' }
      });
      expect(result.sql).toBe('WHERE NOT (`status` = ?)');
      expect(result.params).toEqual(['inactive']);
    });

    it('should parse $nor operator', () => {
      const result = parser.parse({
        $nor: [
          { status: 'inactive' },
          { status: 'deleted' }
        ]
      });
      expect(result.sql).toBe('WHERE (`status` = ?) AND NOT (`status` = ?)');
      expect(result.params).toEqual(['inactive', 'deleted']);
    });

    it('should parse nested logical operators', () => {
      const result = parser.parse({
        $and: [
          { age: { gte: 18 } },
          {
            $or: [
              { status: 'active' },
              { status: 'pending' }
            ]
          }
        ]
      });
      expect(result.sql).toBe('WHERE (`age` >= ?) AND ((`status` = ?) OR (`status` = ?))');
      expect(result.params).toEqual([18, 'active', 'pending']);
    });

    it('should handle empty logical operator arrays', () => {
      const result = parser.parse({
        $and: []
      });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle single condition in logical operator', () => {
      const result = parser.parse({
        $and: [{ status: 'active' }]
      });
      expect(result.sql).toBe('WHERE `status` = ?');
      expect(result.params).toEqual([]);
    });
  });

  describe('table alias support', () => {
    it('should include table alias in field references', () => {
      const parserWithAlias = new SqlWhereParser('mysql', undefined, 'users');
      const result = parserWithAlias.parse({ name: 'John' });
      expect(result.sql).toBe('WHERE users.`name` = ?');
      expect(result.params).toEqual(['John']);
    });

    it('should include table alias in complex conditions', () => {
      const parserWithAlias = new SqlWhereParser('mysql', undefined, 'products');
      const result = parserWithAlias.parse({
        price: { between: [10, 100] },
        category: { in: ['electronics', 'books'] }
      });
      expect(result.sql).toBe('WHERE products.`price` BETWEEN ? AND ? AND products.`category` IN (?, ?)');
      expect(result.params).toEqual([10, 100, 'electronics', 'books']);
    });
  });

  describe('field mapping support', () => {
    it('should work with field mappings', () => {
      const fieldMappings: SqlFieldMapping[] = [
        { name: 'user_id', type: 'number', nullable: false },
        { name: 'email', type: 'string', nullable: true }
      ];
      const parserWithMappings = new SqlWhereParser('mysql', fieldMappings);
      const result = parserWithMappings.parse({ user_id: 123, email: 'test@example.com' });
      expect(result.sql).toBe('WHERE `user_id` = ? AND `email` = ?');
      expect(result.params).toEqual([123, 'test@example.com']);
    });
  });

  describe('SQL injection prevention', () => {
    it('should escape field names with backticks', () => {
      const result = parser.parse({ 'user`name': 'John' });
      expect(result.sql).toBe('WHERE `user\\`name` = ?');
      expect(result.params).toEqual(['John']);
    });

    it('should escape field names with quotes', () => {
      const result = parser.parse({ "user'name": 'John' });
      expect(result.sql).toBe("WHERE `user\\'name` = ?");
      expect(result.params).toEqual(['John']);
    });

    it('should escape field names with double quotes', () => {
      const result = parser.parse({ 'user"name': 'John' });
      expect(result.sql).toBe('WHERE `user\\"name` = ?');
      expect(result.params).toEqual(['John']);
    });
  });

  describe('regex to LIKE conversion', () => {
    it('should convert regex dots to underscores', () => {
      const result = parser.parse({ name: { regex: 'John.Doe' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['%John_Doe%']);
    });

    it('should convert regex asterisks to percent signs', () => {
      const result = parser.parse({ name: { regex: 'John*Doe' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['%John%Doe%']);
    });

    it('should convert regex question marks to underscores', () => {
      const result = parser.parse({ name: { regex: 'John?Doe' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['%John_Doe%']);
    });

    it('should handle complex regex patterns', () => {
      const result = parser.parse({ name: { regex: 'John[abc]Doe' } });
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['%John_Doe%']);
    });
  });

  describe('static buildWhereClause method', () => {
    it('should build WHERE clause using static method', () => {
      const result = SqlWhereParser.buildWhereClause(
        { name: 'John', age: { gte: 18 } },
        undefined,
        'users'
      );
      expect(result.sql).toBe('WHERE users.`name` = ? AND users.`age` >= ?');
      expect(result.params).toEqual(['John', 18]);
      expect(result.hasConditions).toBe(true);
    });

    it('should build WHERE clause with field mappings', () => {
      const fieldMappings: SqlFieldMapping[] = [
        { name: 'user_id', type: 'number', nullable: false }
      ];
      const result = SqlWhereParser.buildWhereClause(
        { user_id: 123 },
        fieldMappings
      );
      expect(result.sql).toBe('WHERE `user_id` = ?');
      expect(result.params).toEqual([123]);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle unknown field operators gracefully', () => {
      const result = parser.parse({ age: { unknown: 25 } });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle mixed valid and invalid operators', () => {
      const result = parser.parse({
        age: { gte: 18, unknown: 25 },
        status: 'active'
      });
      expect(result.sql).toBe('WHERE `age` >= ? AND `status` = ?');
      expect(result.params).toEqual([18, 'active']);
    });

    it('should handle deeply nested conditions', () => {
      const result = parser.parse({
        $and: [
          { age: { gte: 18 } },
          {
            $or: [
              { status: 'active' },
              {
                $and: [
                  { status: 'pending' },
                  { verified: true }
                ]
              }
            ]
          }
        ]
      });
      expect(result.sql).toBe('WHERE (`age` >= ?) AND ((`status` = ?) OR ((`status` = ?) AND (`verified` = ?)))');
      expect(result.params).toEqual([18, 'active', 'pending', true]);
    });

    it('should handle empty nested conditions', () => {
      const result = parser.parse({
        $and: [
          { age: { gte: 18 } },
          { $or: [] }
        ]
      });
      expect(result.sql).toBe('WHERE `age` >= ?');
      expect(result.params).toEqual([]);
    });

    it('should handle unknown logical operators', () => {
      const result = parser.parse({
        $unknown: [{ status: 'active' }]
      });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle field operators with no valid conditions', () => {
      const result = parser.parse({
        age: { unknown1: 25, unknown2: 30 }
      });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });
  });

  describe('Where object compatibility', () => {
    it('should parse Where object with simple condition', () => {
      const where = new Where() as any;
      where._keys = ['name'];
      where.addCondition('eq', 'John');
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `name` = ?');
      expect(result.params).toEqual(['John']);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with comparison operators', () => {
      const where = new Where() as any;
      where._keys = ['age'];
      where.addCondition('gte', 18);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `age` >= ?');
      expect(result.params).toEqual([18]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with IN operator', () => {
      const where = new Where() as any;
      where._keys = ['status'];
      where.addCondition('in', ['active', 'pending']);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `status` IN (?, ?)');
      expect(result.params).toEqual(['active', 'pending']);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with null value', () => {
      const where = new Where() as any;
      where._keys = ['deleted_at'];
      where.addCondition('eq', null);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `deleted_at` IS NULL');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with undefined value', () => {
      const where = new Where() as any;
      where._keys = ['deleted_at'];
      where.addCondition('eq', undefined);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `deleted_at` IS NULL');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with NOT EQUAL null', () => {
      const where = new Where() as any;
      where._keys = ['deleted_at'];
      where.addCondition('ne', null);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `deleted_at` IS NOT NULL');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with LIKE operator', () => {
      const where = new Where() as any;
      where._keys = ['name'];
      where.addCondition('like', 'John%');
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE `name` LIKE ?');
      expect(result.params).toEqual(['John%']);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with empty IN array', () => {
      const where = new Where() as any;
      where._keys = ['status'];
      where.addCondition('in', []);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE 1=0');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse Where object with empty NOT IN array', () => {
      const where = new Where() as any;
      where._keys = ['status'];
      where.addCondition('nin', []);
      const result = parser.parse(where);
      expect(result.sql).toBe('WHERE 1=1');
      expect(result.params).toEqual([]);
      expect(result.hasConditions).toBe(true);
    });
  });

  describe('static parse method', () => {
    it('should parse using static method', () => {
      const where = new Where() as any;
      where._keys = ['name'];
      where.addCondition('eq', 'John');
      const result = SqlWhereParser.parse(where);
      expect(result.sql).toBe('WHERE `name` = ?');
      expect(result.params).toEqual(['John']);
      expect(result.hasConditions).toBe(true);
    });

    it('should parse plain object using static method', () => {
      const result = SqlWhereParser.parse({ name: 'John', age: 25 });
      expect(result.sql).toBe('WHERE `name` = ? AND `age` = ?');
      expect(result.params).toEqual(['John', 25]);
      expect(result.hasConditions).toBe(true);
    });
  });

  describe('extended operators', () => {
          describe('json_extract operator', () => {
      it('should parse json_extract for MySQL', () => {
        const mysqlParser = new SqlWhereParser('mysql');
        const result = mysqlParser.parse({ profile: { json_extract: { path: '$.preferences.theme', value: 'dark' } } });
        expect(result.sql).toBe('WHERE JSON_EXTRACT(`profile`, \'$.preferences.theme\') = ?');
        expect(result.params).toEqual(['dark']);
        expect(result.hasConditions).toBe(true);
      });

      it('should parse json_extract for PostgreSQL', () => {
        const pgParser = new SqlWhereParser('postgresql');
        const result = pgParser.parse({ profile: { json_extract: { path: '$.preferences.theme', value: 'dark' } } });
        expect(result.sql).toBe('WHERE `profile`->>\'$.preferences.theme\' = ?');
        expect(result.params).toEqual(['dark']);
        expect(result.hasConditions).toBe(true);
      });

      it('should parse json_extract for SQLite', () => {
        const sqliteParser = new SqlWhereParser('sqlite');
        const result = sqliteParser.parse({ profile: { json_extract: { path: '$.preferences.theme', value: 'dark' } } });
        expect(result.sql).toBe('WHERE json_extract(`profile`, \'$.preferences.theme\') = ?');
        expect(result.params).toEqual(['dark']);
        expect(result.hasConditions).toBe(true);
      });
    });

          describe('full_text_search operator', () => {
        it('should parse full_text_search for MySQL', () => {
          const mysqlParser = new SqlWhereParser('mysql');
          const result = mysqlParser.parse({ content: { full_text_search: { value: 'search term' } } });
          expect(result.sql).toBe('WHERE MATCH(`content`) AGAINST(? IN BOOLEAN MODE)');
          expect(result.params).toEqual(['search term']);
          expect(result.hasConditions).toBe(true);
        });

              it('should parse full_text_search for PostgreSQL', () => {
          const pgParser = new SqlWhereParser('postgresql');
          const result = pgParser.parse({ content: { full_text_search: { value: 'search term' } } });
          expect(result.sql).toBe('WHERE to_tsvector(\'english\', `content`) @@ plainto_tsquery(\'english\', ?)');
          expect(result.params).toEqual(['search term']);
          expect(result.hasConditions).toBe(true);
        });

              it('should parse full_text_search for SQLite', () => {
          const sqliteParser = new SqlWhereParser('sqlite');
          const result = sqliteParser.parse({ content: { full_text_search: { value: 'search term' } } });
          expect(result.sql).toBe('WHERE `content` MATCH ?');
          expect(result.params).toEqual(['search term']);
          expect(result.hasConditions).toBe(true);
        });
    });

          describe('array_contains operator', () => {
        it('should parse array_contains for MySQL', () => {
          const mysqlParser = new SqlWhereParser('mysql');
          const result = mysqlParser.parse({ tags: { array_contains: { values: ['important', 'urgent'] } } });
          expect(result.sql).toBe('WHERE JSON_CONTAINS(`tags`, ?)');
          expect(result.params).toEqual(['["important","urgent"]']);
          expect(result.hasConditions).toBe(true);
        });

              it('should parse array_contains for PostgreSQL', () => {
          const pgParser = new SqlWhereParser('postgresql');
          const result = pgParser.parse({ tags: { array_contains: { values: ['important', 'urgent'] } } });
          expect(result.sql).toBe('WHERE `tags` @> ?');
          expect(result.params).toEqual([['important', 'urgent']]);
          expect(result.hasConditions).toBe(true);
        });

              it('should parse array_contains for SQLite', () => {
          const sqliteParser = new SqlWhereParser('sqlite');
          const result = sqliteParser.parse({ tags: { array_contains: { values: ['important', 'urgent'] } } });
          expect(result.sql).toBe('WHERE json_extract(`tags`, \'$\') = ?');
          expect(result.params).toEqual(['["important","urgent"]']);
          expect(result.hasConditions).toBe(true);
        });
    });

          describe('text_search operator', () => {
        it('should parse text_search for all databases', () => {
          const mysqlParser = new SqlWhereParser('mysql');
          const result = mysqlParser.parse({ name: { text_search: { value: 'John' } } });
          expect(result.sql).toBe('WHERE `name` LIKE ?');
          expect(result.params).toEqual(['%John%']);
          expect(result.hasConditions).toBe(true);
        });
    });
  });
});
