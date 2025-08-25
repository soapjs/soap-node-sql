import { SqlQueryFactory } from '../sql.query-factory';
import { FindParams, CountParams, AggregationParams, RemoveParams, UpdateMethod, Where } from '@soapjs/soap';
import { SqlWhereParser } from '../sql.where.parser';

// Mock dependencies
jest.mock('../sql.where.parser');

describe('SqlQueryFactory', () => {
  let queryFactory: SqlQueryFactory<any>;
  let mockWhereParser: jest.Mocked<SqlWhereParser>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock SqlWhereParser
    mockWhereParser = {
      parse: jest.fn().mockReturnValue({ field: 'value' })
    } as any;

    // Mock SqlWhereParser constructor
    (SqlWhereParser as any).mockImplementation(() => mockWhereParser);

    queryFactory = new SqlQueryFactory('mysql');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create SqlQueryFactory with database type', () => {
      expect(queryFactory).toBeInstanceOf(SqlQueryFactory);
    });
  });

  describe('createFindQuery', () => {
    it('should create find query with FindParams', () => {
      const where = new Where();
      where.valueOf('field').isEq('value');
      
      const findParams = new FindParams(
        10, // limit
        5,  // offset
        { name: 1 }, // sort
        where, // where
        { name: 1, email: 1 } // projection
      );

      const result = queryFactory.createFindQuery(findParams);

      expect(result).toBeDefined();
      expect((result as any).sql).toContain('SELECT');
      expect((result as any).sql).toContain('FROM');
      expect((result as any).params).toBeDefined();
      expect((result as any).filter).toEqual({ field: 'value' });
      expect((result as any).options.limit).toBe(10);
      expect((result as any).options.offset).toBe(5);
      // Note: sort and projection are passed through from FindParams
      expect((result as any).options.sort).toBeDefined();
      expect((result as any).options.projection).toBeDefined();
    });

    it('should handle FindParams without optional fields', () => {
      const findParams = new FindParams();

      const result = queryFactory.createFindQuery(findParams);

      expect(result).toBeDefined();
      expect((result as any).filter).toEqual({});
      expect((result as any).options).toEqual({
        limit: undefined,
        offset: undefined,
        sort: undefined,
        projection: undefined
      });
    });
  });

  describe('createCountQuery', () => {
    it('should create count query with CountParams', () => {
      const where = new Where();
      where.valueOf('field').isEq('value');
      
      const countParams = new CountParams(
        { name: 1 }, // sort
        where // where
      );

      const result = queryFactory.createCountQuery(countParams);

      expect(result).toBeDefined();
      expect((result as any).sql).toContain('SELECT COUNT');
      expect((result as any).sql).toContain('FROM');
      expect((result as any).params).toBeDefined();
      expect((result as any).filter).toEqual({ field: 'value' });
      expect((result as any).options).toEqual({
        sort: { name: 1 }
      });
    });

    it('should handle CountParams without optional fields', () => {
      const countParams = new CountParams();

      const result = queryFactory.createCountQuery(countParams);

      expect(result).toBeDefined();
      expect((result as any).filter).toEqual({});
      expect((result as any).options).toEqual({
        sort: undefined
      });
    });
  });

  describe('createUpdateQuery', () => {
    it('should create update query with updates, where, and methods', () => {
      const updates = [{ name: 'John' }, { age: 30 }];
      
      const where1 = new Where();
      where1.valueOf('id').isEq(1);
      const where2 = new Where();
      where2.valueOf('active').isEq(true);
      const where = [where1, where2];
      
      const methods = [UpdateMethod.UpdateOne, UpdateMethod.UpdateMany];

      const result = queryFactory.createUpdateQuery(updates, where, methods);

      expect(result).toBeDefined();
      expect((result as any).sql).toContain('UPDATE');
      expect((result as any).sql).toContain('SET');
      expect((result as any).params).toBeDefined();
      expect((result as any).filter).toEqual({ field: 'value' });
      expect((result as any).update).toEqual({ name: 'John', age: 30 });
      expect((result as any).options).toEqual({
        multi: true
      });
    });

    it('should throw error when arrays have different lengths', () => {
      const updates = [{ name: 'John' }];
      const where = new Where();
      where.valueOf('id').isEq(1);
      const whereArray = [where];
      const methods = [UpdateMethod.UpdateOne, UpdateMethod.UpdateMany]; // Different length

      expect(() => {
        queryFactory.createUpdateQuery(updates, whereArray, methods);
      }).toThrow('Updates, where conditions, and methods arrays must have the same length');
    });
  });

  describe('createRemoveQuery', () => {
    it('should create remove query with RemoveParams', () => {
      const where = new Where();
      where.valueOf('field').isEq('value');
      const removeParams = new RemoveParams(where);

      const result = queryFactory.createRemoveQuery(removeParams);

      expect(result).toBeDefined();
      expect((result as any).sql).toContain('DELETE FROM');
      expect((result as any).params).toBeDefined();
      expect((result as any).filter).toEqual({ field: 'value' });
      expect((result as any).options).toEqual({});
    });

    it('should handle RemoveParams without where', () => {
      const removeParams = new RemoveParams();

      const result = queryFactory.createRemoveQuery(removeParams);

      expect(result).toBeDefined();
      expect((result as any).filter).toEqual({});
    });
  });

  describe('createAggregationQuery', () => {
    it('should create aggregation query with AggregationParams', () => {
      const where = new Where();
      where.valueOf('active').isEq(true);
      
      const aggregationParams = new AggregationParams(
        ['category', 'status'], // groupBy
        undefined, // filterBy
        { name: 1 }, // sort
        'price', // sum
        'rating', // average
        'price', // min
        'price', // max
        'id', // count
        where, // where
        100, // limit
        { total: { $gt: 1000 } }, // having
        10 // offset
      );

      const result = queryFactory.createAggregationQuery(aggregationParams);

      expect(result).toBeDefined();
      expect((result as any).sql).toContain('SELECT');
      expect((result as any).sql).toContain('FROM');
      expect((result as any).params).toBeDefined();
      expect((result as any).pipeline).toBeDefined();
      expect((result as any).options).toEqual({
        limit: 100,
        offset: 10
      });
    });

    it('should handle AggregationParams with minimal fields', () => {
      const aggregationParams = new AggregationParams();

      const result = queryFactory.createAggregationQuery(aggregationParams);

      expect(result).toBeDefined();
      expect((result as any).pipeline).toBeDefined();
      expect((result as any).pipeline[0].$sql).toContain('SELECT');
      expect((result as any).pipeline[0].$sql).toContain('FROM');
    });
  });

  describe('convertSortToOrderBy', () => {
    it('should convert numeric sort to orderBy', () => {
      const sort = { name: 1, age: -1 };
      
      // Access private method through any
      const result = (queryFactory as any).convertSortToOrderBy(sort);
      
      expect(result).toEqual({
        name: 'ASC',
        age: 'DESC'
      });
    });

    it('should convert string sort to orderBy', () => {
      const sort = { name: 'asc', age: 'desc' };
      
      const result = (queryFactory as any).convertSortToOrderBy(sort);
      
      expect(result).toEqual({
        name: 'ASC',
        age: 'DESC'
      });
    });

    it('should handle mixed sort values', () => {
      const sort = { name: 1, age: 'desc', status: 'ASC' };
      
      const result = (queryFactory as any).convertSortToOrderBy(sort);
      
      expect(result).toEqual({
        name: 'ASC',
        age: 'DESC',
        status: 'ASC'
      });
    });

    it('should handle invalid sort values', () => {
      const sort = { name: 1, age: 'invalid', status: 0 };
      
      const result = (queryFactory as any).convertSortToOrderBy(sort);
      
      expect(result).toEqual({
        name: 'ASC'
        // age and status are filtered out due to invalid values
      });
    });

    it('should handle empty or null sort', () => {
      expect((queryFactory as any).convertSortToOrderBy(null)).toEqual({});
      expect((queryFactory as any).convertSortToOrderBy(undefined)).toEqual({});
      expect((queryFactory as any).convertSortToOrderBy({})).toEqual({});
    });
  });

  describe('utility methods', () => {
    it('should get WhereParser', () => {
      const result = queryFactory.getWhereParser();
      expect(result).toBeDefined();
    });

    it('should get database type', () => {
      const result = queryFactory.getDatabaseType();
      expect(result).toBe('mysql');
    });
  });
});
