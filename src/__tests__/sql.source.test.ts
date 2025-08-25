import { SqlDataSource } from '../sql.source';
import { SoapSQL } from '../soap.sql';
import { SqlSessionManager } from '../sql.session-manager';
import { SqlQueryFactory } from '../sql.query-factory';
import { SqlFieldResolver } from '../sql.field-resolver';
import { SqlTransformers } from '../sql.transformers';
import { SqlQueryError, SqlConnectionError } from '../sql.errors';

// Mock dependencies
jest.mock('../soap.sql');
jest.mock('../sql.session-manager');
jest.mock('../sql.query-factory');
jest.mock('../sql.field-resolver');
jest.mock('../sql.transformers');
jest.mock('../sql.utils');

describe('SqlDataSource', () => {
  let dataSource: SqlDataSource<any>;
  let mockSoapSql: jest.Mocked<SoapSQL>;
  let mockSessionManager: jest.Mocked<SqlSessionManager>;
  let mockQueryFactory: jest.Mocked<SqlQueryFactory<any>>;
  let mockFieldResolver: jest.Mocked<SqlFieldResolver<any>>;
  let mockTransformers: jest.Mocked<SqlTransformers>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockSoapSql = {
      databaseType: 'mysql',
      query: jest.fn(),
      getConnection: jest.fn(),
      mysqlPool: {
        getConnection: jest.fn()
      },
      postgresqlPool: {
        connect: jest.fn()
      },
      close: jest.fn(),
      isHealthy: jest.fn(),
      sessions: {
        createSession: jest.fn(),
        getSession: jest.fn(),
        hasSession: jest.fn(),
        deleteSession: jest.fn(),
        removeSession: jest.fn(),
        getAllSessions: jest.fn(),
        getSessionCount: jest.fn(),
        closeAllSessions: jest.fn(),
        getSessionStats: jest.fn(),
        transactionScope: {} as any
      }
    } as any;

    mockSessionManager = mockSoapSql.sessions as any;

    // Mock static create method
    (SoapSQL.create as jest.Mock).mockResolvedValue(mockSoapSql);

    // Mock SqlUtils.buildWhereClause
    const { SqlUtils } = require('../sql.utils');
    SqlUtils.buildWhereClause = jest.fn().mockReturnValue({
      sql: '1=1',
      params: []
    });

    // Create data source instance
    dataSource = new SqlDataSource(mockSoapSql, 'test_collection');

    // Get the actual instances created by the constructor
    mockQueryFactory = (dataSource as any)._queryFactory;
    mockFieldResolver = (dataSource as any)._fieldResolver;
    mockTransformers = (dataSource as any)._transformers;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create SqlDataSource with default collection name', () => {
      const ds = new SqlDataSource(mockSoapSql);
      expect(ds.collectionName).toBe('default');
    });

    it('should create SqlDataSource with custom collection name', () => {
      const ds = new SqlDataSource(mockSoapSql, 'custom_collection');
      expect(ds.collectionName).toBe('custom_collection');
    });

    it('should initialize with mysql database type by default', () => {
      const ds = new SqlDataSource(mockSoapSql, 'test');
      expect(mockSoapSql.databaseType).toBe('mysql');
    });
  });

  describe('static create', () => {
    it('should create SqlDataSource instance', async () => {
      const config = { 
        type: 'mysql' as const,
        host: 'localhost', 
        port: 3306,
        username: 'test',
        password: 'test',
        database: 'test' 
      };
      const result = await SqlDataSource.create(config, 'test_collection');
      
      expect(SoapSQL.create).toHaveBeenCalledWith(config);
      expect(result).toBeInstanceOf(SqlDataSource);
      expect(result.collectionName).toBe('test_collection');
    });

    it('should create SqlDataSource with default collection name', async () => {
      const config = { 
        type: 'mysql' as const,
        host: 'localhost', 
        port: 3306,
        username: 'test',
        password: 'test',
        database: 'test' 
      };
      const result = await SqlDataSource.create(config);
      
      expect(result.collectionName).toBe('default');
    });
  });

  describe('query', () => {
    it('should execute raw SQL query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.query('SELECT * FROM test', [1]);

      expect(mockSoapSql.query).toHaveBeenCalledWith('SELECT * FROM test', [1]);
      expect(result).toEqual({
        data: [{ id: 1, name: 'test' }],
        count: 1,
        insertId: undefined,
        info: undefined,
        affectedRows: 1
      });
    });

    it('should handle query error', async () => {
      const error = new Error('Database error');
      mockSoapSql.query.mockRejectedValue(error);

      await expect(dataSource.query('SELECT * FROM test'))
        .rejects
        .toThrow(SqlQueryError);
    });
  });

  describe('find', () => {
    it('should find documents with simple string query', async () => {
      const mockQuery = { sql: 'SELECT * FROM test_collection', params: [] };
      mockQueryFactory.buildFindQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.find('test_collection');

      expect(mockQueryFactory.buildFindQuery).toHaveBeenCalledWith(
        'test_collection',
        {},
        expect.objectContaining({
          table: 'test_collection',
          where: {},
          fields: [],
          limit: 1000
        })
      );
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should find documents with complex query object', async () => {
      const mockQuery = { sql: 'SELECT * FROM test_collection WHERE id = ?', params: [1] };
      mockQueryFactory.buildFindQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        collection: 'test_collection',
        criteria: { id: 1 },
        options: { limit: 10, fields: ['id', 'name'] }
      };

      const result = await dataSource.find(query);

      expect(mockQueryFactory.buildFindQuery).toHaveBeenCalledWith(
        'test_collection',
        { id: 1 },
        expect.objectContaining({
          table: 'test_collection',
          where: { id: 1 },
          fields: ['id', 'name'],
          limit: 10
        })
      );
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should handle find error', async () => {
      const error = new Error('Find error');
      mockSoapSql.query.mockRejectedValue(error);

      await expect(dataSource.find({ collection: 'test' }))
        .rejects
        .toThrow(SqlQueryError);
    });
  });

  describe('findOne', () => {
    it('should find single document', async () => {
      const mockQuery = { sql: 'SELECT * FROM test_collection WHERE id = ? LIMIT 1', params: [1] };
      mockQueryFactory.buildFindOneQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.findOne('test_collection', { id: 1 });

      expect(mockQueryFactory.buildFindOneQuery).toHaveBeenCalledWith(
        'test_collection',
        { id: 1 },
        expect.objectContaining({
          table: 'test_collection',
          where: { id: 1 },
          limit: 1
        })
      );
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('should return null when no document found', async () => {
      const mockQuery = { sql: 'SELECT * FROM test_collection WHERE id = ? LIMIT 1', params: [1] };
      mockQueryFactory.buildFindOneQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [],
        rowCount: 0,
        affectedRows: 0
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.findOne('test_collection', { id: 1 });

      expect(result).toBeNull();
    });
  });

  describe('insert', () => {
    it('should insert document', async () => {
      const mockQuery = { sql: 'INSERT INTO test_collection (name) VALUES (?)', params: ['test'] };
      mockQueryFactory.buildInsertQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        affectedRows: 1,
        insertId: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        collection: 'test_collection',
        data: { name: 'test' }
      };

      const result = await dataSource.insert(query);

      expect(mockQueryFactory.buildInsertQuery).toHaveBeenCalledWith({
        table: 'test_collection',
        data: { name: 'test' },
        ignore: undefined,
        onDuplicateKeyUpdate: undefined
      });
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });
  });

  describe('update', () => {
    it('should update documents', async () => {
      const mockQuery = { sql: 'UPDATE test_collection SET name = ? WHERE id = ?', params: ['new_name', 1] };
      mockQueryFactory.buildUpdateQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [],
        rowCount: 0,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        collection: 'test_collection',
        criteria: { id: 1 },
        data: { name: 'new_name' }
      };

      const result = await dataSource.update(query);

      expect(mockQueryFactory.buildUpdateQuery).toHaveBeenCalledWith({
        table: 'test_collection',
        data: { name: 'new_name' },
        where: { id: 1 },
        limit: undefined
      });
      expect(result).toEqual({
        modifiedCount: 1,
        upsertedCount: 0,
        matchedCount: 1
      });
    });
  });

  describe('remove', () => {
    it('should remove documents', async () => {
      const mockQuery = { sql: 'DELETE FROM test_collection WHERE id = ?', params: [1] };
      mockQueryFactory.buildDeleteQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [],
        rowCount: 0,
        affectedRows: 1
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        collection: 'test_collection',
        criteria: { id: 1 }
      };

      const result = await dataSource.remove(query);

      expect(mockQueryFactory.buildDeleteQuery).toHaveBeenCalledWith({
        table: 'test_collection',
        where: { id: 1 },
        limit: undefined
      });
      expect(result).toEqual({
        affectedRows: 1,
        count: 1,
        data: [],
        info: undefined,
        insertId: undefined
      });
    });
  });

  describe('count', () => {
    it('should count documents', async () => {
      const mockQuery = { sql: 'SELECT COUNT(*) as count FROM test_collection', params: [] };
      mockQueryFactory.buildCountQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ count: '5' }],
        rowCount: 1,
        affectedRows: 0
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        collection: 'test_collection',
        criteria: { active: true }
      };

      const result = await dataSource.count(query);

      expect(mockQueryFactory.buildCountQuery).toHaveBeenCalledWith({
        table: 'test_collection',
        where: { active: true },
        fields: ['COUNT(*) as count'],
        groupBy: undefined,
        having: undefined
      });
      expect(result).toBe(5);
    });

    it('should count all documents when no query provided', async () => {
      const mockQuery = { sql: 'SELECT COUNT(*) as count FROM test_collection', params: [] };
      mockQueryFactory.buildCountQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [{ count: '10' }],
        rowCount: 1,
        affectedRows: 0
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.count();

      expect(mockQueryFactory.buildCountQuery).toHaveBeenCalledWith({
        table: 'test_collection',
        where: {},
        fields: ['COUNT(*) as count']
      });
      expect(result).toBe(10);
    });
  });

  describe('aggregate', () => {
    it('should execute aggregation pipeline', async () => {
      const mockResult = {
        rows: [{ total: 100 }],
        rowCount: 1,
        affectedRows: 0
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const query = {
        pipeline: [
          { $match: { status: 'active' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]
      };

      const result = await dataSource.aggregate(query);

      expect(result).toEqual([{ total: 100 }]);
    });
  });

  describe('createCollection', () => {
    it('should create collection/table', async () => {
      const mockQuery = { sql: 'CREATE TABLE test_table (id INT PRIMARY KEY)', params: [] };
      mockQueryFactory.buildCreateTableQuery.mockReturnValue(mockQuery);
      
      mockSoapSql.query.mockResolvedValue({});

      const definition = {
        name: 'test_table',
        columns: [
          { name: 'id', type: 'INT', primaryKey: true }
        ]
      };

      await dataSource.createCollection('test_table', definition);

      expect(mockQueryFactory.buildCreateTableQuery).toHaveBeenCalledWith('test_table', definition);
    });
  });

  describe('dropCollection', () => {
    it('should drop collection/table', async () => {
      const mockQuery = { sql: 'DROP TABLE test_table', params: [] };
      mockQueryFactory.buildDropTableQuery.mockReturnValue(mockQuery);
      
      mockSoapSql.query.mockResolvedValue({});

      await dataSource.dropCollection('test_table');

      expect(mockQueryFactory.buildDropTableQuery).toHaveBeenCalledWith('test_table');
    });
  });

  describe('createIndex', () => {
    it('should create index', async () => {
      const mockQuery = { sql: 'CREATE INDEX idx_name ON test_table (name)', params: [] };
      mockQueryFactory.buildCreateIndexQuery.mockReturnValue(mockQuery);
      
      mockSoapSql.query.mockResolvedValue({});

      const index = {
        name: 'idx_name',
        columns: ['name'],
        unique: false
      };

      await dataSource.createIndex('test_table', index);

      expect(mockQueryFactory.buildCreateIndexQuery).toHaveBeenCalledWith('test_table', index);
    });
  });

  describe('dropIndex', () => {
    it('should drop index', async () => {
      const mockQuery = { sql: 'DROP INDEX idx_name ON test_table', params: [] };
      mockQueryFactory.buildDropIndexQuery.mockReturnValue(mockQuery);
      
      mockSoapSql.query.mockResolvedValue({});

      await dataSource.dropIndex('test_table', 'idx_name');

      expect(mockQueryFactory.buildDropIndexQuery).toHaveBeenCalledWith('test_table', 'idx_name');
    });
  });

  describe('getFieldMappings', () => {
    it('should get field mappings', async () => {
      const mockQuery = { sql: 'DESCRIBE test_table', params: [] };
      mockQueryFactory.buildDescribeTableQuery.mockReturnValue(mockQuery);
      
      const mockResult = {
        rows: [
          { Field: 'id', Type: 'int(11)', Null: 'NO', Default: null },
          { Field: 'name', Type: 'varchar(255)', Null: 'YES', Default: null }
        ],
        rowCount: 2,
        affectedRows: 0
      };
      mockSoapSql.query.mockResolvedValue(mockResult);

      const result = await dataSource.getFieldMappings('test_table');

      expect(mockQueryFactory.buildDescribeTableQuery).toHaveBeenCalledWith('test_table');
      expect(result).toEqual([
        { name: 'id', type: 'int(11)', nullable: false, defaultValue: undefined },
        { name: 'name', type: 'varchar(255)', nullable: true, defaultValue: undefined }
      ]);
    });
  });

  describe('beginTransaction', () => {
    it('should begin transaction for MySQL', async () => {
      const mockConnection = { beginTransaction: jest.fn() };
      (mockSoapSql.mysqlPool.getConnection as jest.Mock).mockResolvedValue(mockConnection);
      
      const mockSession = {
        id: 'session_123',
        startTransaction: jest.fn().mockResolvedValue({}),
        end: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn()
      } as any;
      mockSessionManager.createSession.mockReturnValue(mockSession);

      const result = await dataSource.beginTransaction();

      expect(mockSoapSql.mysqlPool.getConnection).toHaveBeenCalled();
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(mockConnection, 'mysql');
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'session_123',
        sessionId: 'session_123',
        isActive: true,
        createdAt: expect.any(Date),
        lastUsed: expect.any(Date)
      });
    });

    it('should begin transaction for PostgreSQL', async () => {
      // Create a new instance with PostgreSQL database type
      const postgresqlSoapSql = {
        ...mockSoapSql,
        databaseType: 'postgresql'
      };
      const postgresqlDataSource = new SqlDataSource(postgresqlSoapSql as any, 'test_collection');
      
      const mockConnection = { query: jest.fn() };
      (postgresqlSoapSql.postgresqlPool.connect as jest.Mock).mockResolvedValue(mockConnection);
      
      const mockSession = {
        id: 'session_123',
        startTransaction: jest.fn().mockResolvedValue({}),
        end: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn()
      } as any;
      (postgresqlSoapSql.sessions.createSession as jest.Mock).mockReturnValue(mockSession);

      const result = await postgresqlDataSource.beginTransaction();

      expect(postgresqlSoapSql.postgresqlPool.connect).toHaveBeenCalled();
      expect(postgresqlSoapSql.sessions.createSession).toHaveBeenCalledWith(mockConnection, 'postgresql');
      expect(result).toBeDefined();
    });

    it('should handle transaction error', async () => {
      (mockSoapSql.mysqlPool.getConnection as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(dataSource.beginTransaction())
        .rejects
        .toThrow(SqlConnectionError);
    });
  });

  describe('createSession', () => {
    it('should create database session', async () => {
      const mockConnection = {};
      mockSoapSql.getConnection.mockResolvedValue(mockConnection);
      
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn()
      } as any;
      mockSessionManager.createSession.mockReturnValue(mockSession);

      const result = await dataSource.createSession();

      expect(mockSoapSql.getConnection).toHaveBeenCalled();
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(mockConnection, 'mysql');
      expect(result).toBe(mockSession);
    });
  });

  describe('commitTransaction', () => {
    it('should commit transaction', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue({}),
        rollbackTransaction: jest.fn()
      } as any;

      await dataSource.commitTransaction(mockSession);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should handle commit error', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockRejectedValue(new Error('Commit failed')),
        rollbackTransaction: jest.fn()
      } as any;

      await expect(dataSource.commitTransaction(mockSession))
        .rejects
        .toThrow(SqlConnectionError);
    });
  });

  describe('rollbackTransaction', () => {
    it('should rollback transaction', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn().mockResolvedValue({})
      } as any;

      await dataSource.rollbackTransaction(mockSession);

      expect(mockSession.rollbackTransaction).toHaveBeenCalled();
    });

    it('should handle rollback error', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn().mockRejectedValue(new Error('Rollback failed'))
      } as any;

      await expect(dataSource.rollbackTransaction(mockSession))
        .rejects
        .toThrow(SqlConnectionError);
    });
  });

  describe('endSession', () => {
    it('should end session', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn().mockResolvedValue({}),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn()
      } as any;

      await dataSource.endSession(mockSession);

      expect(mockSession.end).toHaveBeenCalled();
    });
  });

  describe('startTransaction', () => {
    it('should start transaction on session', async () => {
      const mockSession = {
        id: 'session_123',
        end: jest.fn(),
        startTransaction: jest.fn().mockResolvedValue({}),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn()
      } as any;

      await dataSource.startTransaction(mockSession);

      expect(mockSession.startTransaction).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close data source', async () => {
      mockSoapSql.close.mockResolvedValue(undefined);

      await dataSource.close();

      expect(mockSoapSql.close).toHaveBeenCalled();
    });

    it('should handle close error', async () => {
      mockSoapSql.close.mockRejectedValue(new Error('Close failed'));

      await expect(dataSource.close())
        .rejects
        .toThrow(SqlConnectionError);
    });
  });

  describe('isHealthy', () => {
    it('should return true when healthy', async () => {
      mockSoapSql.isHealthy.mockResolvedValue(true);

      const result = await dataSource.isHealthy();

      expect(mockSoapSql.isHealthy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when unhealthy', async () => {
      mockSoapSql.isHealthy.mockResolvedValue(false);

      const result = await dataSource.isHealthy();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockSoapSql.isHealthy.mockRejectedValue(new Error('Health check failed'));

      const result = await dataSource.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('getDatabaseType', () => {
    it('should return database type', () => {
      const result = dataSource.getDatabaseType();

      expect(result).toBe('mysql');
    });
  });

  describe('collectionName', () => {
    it('should return collection name', () => {
      expect(dataSource.collectionName).toBe('test_collection');
    });
  });
});
