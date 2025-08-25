import { SoapSQL } from '../soap.sql';
import { SqlDatabaseConfig } from '../sql.config';
import { SqlConnectionError, SqlConfigError } from '../sql.errors';

// Mock dependencies
jest.mock('mysql2/promise');
jest.mock('pg');
jest.mock('sqlite3');

describe('SoapSQL', () => {
  let mockMySqlPool: any;
  let mockPgPool: any;
  let mockSqliteDb: any;
  let mockMySqlConnection: any;
  let mockPgClient: any;

  // Define mock objects outside beforeEach to avoid reference issues
  beforeEach(() => {
    // Don't reset mocks as it clears our mock implementations
    // jest.resetAllMocks();

    // Mock MySQL
    mockMySqlConnection = {
      release: jest.fn(),
      ping: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };

    mockMySqlPool = {
      getConnection: jest.fn().mockResolvedValue(mockMySqlConnection),
      end: jest.fn(),
      query: jest.fn()
    };

    // Mock PostgreSQL
    mockPgClient = {
      release: jest.fn(),
      query: jest.fn(),
      connect: jest.fn()
    };

    mockPgPool = {
      connect: jest.fn().mockResolvedValue(mockPgClient),
      end: jest.fn(),
      query: jest.fn()
    };

    // Mock SQLite
    mockSqliteDb = {
      run: jest.fn().mockImplementation((sql, params, callback) => {
        // Call the callback immediately with success
        if (callback) {
          callback.call({ changes: 1, lastID: 123 }, null);
        }
      }),
      get: jest.fn().mockImplementation((sql, callback) => {
        // Call the callback immediately with success
        if (callback) {
          callback(null, { result: 'ok' });
        }
      }),
      all: jest.fn().mockImplementation((sql, params, callback) => {
        // Call the callback immediately with success
        if (callback) {
          callback(null, []);
        }
      }),
      close: jest.fn().mockImplementation((callback) => {
        // Call the callback immediately with success
        if (callback) {
          callback(null);
        }
      })
    };

    // Set up mock implementations
    const sqlite3 = require('sqlite3');
    sqlite3.Database = jest.fn().mockImplementation((filename, mode) => {
      // Simulate the constructor behavior - return instance immediately
      return mockSqliteDb;
    });

    const mysql2 = require('mysql2/promise');
    mysql2.createPool = jest.fn().mockReturnValue(mockMySqlPool);

    const pg = require('pg');
    pg.Pool = jest.fn().mockImplementation(() => mockPgPool);
  });

  afterEach(() => {
    // Don't reset mocks as it clears our mock implementations
    // jest.resetAllMocks();
  });

  describe('create', () => {
    it('should create MySQL instance successfully', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      const soapSql = await SoapSQL.create(config);

      expect(soapSql).toBeInstanceOf(SoapSQL);
      expect(soapSql.databaseType).toBe('mysql');
      expect(soapSql.mysqlPool).toBeDefined();
      expect(soapSql.postgresqlPool).toBeUndefined();
      expect(soapSql.sqliteDb).toBeUndefined();
    });

    it('should create PostgreSQL instance successfully', async () => {
      const config = new SqlDatabaseConfig({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8'
      });

      const soapSql = await SoapSQL.create(config);

      expect(soapSql).toBeInstanceOf(SoapSQL);
      expect(soapSql.databaseType).toBe('postgresql');
      expect(soapSql.postgresqlPool).toBeDefined();
      expect(soapSql.mysqlPool).toBeUndefined();
      expect(soapSql.sqliteDb).toBeUndefined();
    });

    it('should create SQLite instance successfully', async () => {
      const config = new SqlDatabaseConfig({
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        database: 'test.db',
        username: '',
        password: '',
        connectionLimit: 1,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8',
        filename: 'test.db',
        mode: undefined,
        verbose: false,
        memory: false
      });

      const soapSql = await SoapSQL.create(config);

      expect(soapSql).toBeInstanceOf(SoapSQL);
      expect(soapSql.databaseType).toBe('sqlite');
      expect(soapSql.sqliteDb).toBeDefined();
      expect(soapSql.mysqlPool).toBeUndefined();
      expect(soapSql.postgresqlPool).toBeUndefined();
    });

    it('should create SQLite in-memory instance', async () => {
      const config = new SqlDatabaseConfig({
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        database: ':memory:',
        username: '',
        password: '',
        connectionLimit: 1,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8',
        filename: ':memory:',
        mode: undefined,
        verbose: false,
        memory: true
      });

      const soapSql = await SoapSQL.create(config);

      expect(soapSql).toBeInstanceOf(SoapSQL);
      expect(soapSql.databaseType).toBe('sqlite');
    });

    it('should throw error for unsupported database type', async () => {
      // Create a config object that bypasses validation but has unsupported type
      const config = {
        type: 'unsupported',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4',
        validate: () => {}, // Mock validate method
        getMySqlOptions: () => ({}),
        getPostgreSqlOptions: () => ({}),
        getSqliteOptions: () => ({}),
        getConnectionString: () => '',
        clone: () => config
      } as any;

      await expect(SoapSQL.create(config)).rejects.toThrow('Unsupported database type: unsupported');
    });

    it('should throw error for invalid configuration', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: '',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      await expect(SoapSQL.create(config)).rejects.toThrow('Host is required');
    });
  });

  describe('MySQL operations', () => {
    let soapSql: SoapSQL;
    let config: SqlDatabaseConfig;

    beforeEach(async () => {
      config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      soapSql = await SoapSQL.create(config);
    });

    it('should get connection pool stats for MySQL', async () => {
      mockMySqlConnection.query.mockResolvedValue([[{ Value: '5' }]]);

      const stats = await soapSql.getConnectionPoolStats();

      expect(stats).toEqual({ connections: '5' });
      expect(mockMySqlPool.getConnection).toHaveBeenCalled();
      expect(mockMySqlConnection.release).toHaveBeenCalled();
    });

    it('should get server status for MySQL', async () => {
      const mockStatus = [{ Variable_name: 'Threads_connected', Value: '5' }];
      mockMySqlConnection.query.mockResolvedValue([mockStatus]);

      const status = await soapSql.getServerStatus();

      expect(status).toEqual({ status: mockStatus });
    });

    it('should execute query for MySQL', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockMySqlConnection.query.mockResolvedValue([mockRows]);

      const result = await soapSql.query('SELECT * FROM users', ['param1']);

      expect(result).toEqual(mockRows);
      expect(mockMySqlPool.getConnection).toHaveBeenCalled();
      expect(mockMySqlConnection.release).toHaveBeenCalled();
    });

    it('should get database info for MySQL', async () => {
      const mockInfo = { database_name: 'testdb', version: '8.0.0' };
      mockMySqlConnection.query.mockResolvedValue([[mockInfo]]);

      const info = await soapSql.getDatabaseInfo();

      expect(info).toEqual(mockInfo);
      expect(mockMySqlPool.getConnection).toHaveBeenCalled();
      expect(mockMySqlConnection.release).toHaveBeenCalled();
    });

    it('should check health for MySQL', async () => {
      mockMySqlConnection.ping.mockResolvedValue(undefined);

      const isHealthy = await soapSql.isHealthy();

      expect(isHealthy).toBe(true);
      expect(mockMySqlConnection.ping).toHaveBeenCalled();
    });

    it('should get connection for MySQL', async () => {
      const connection = await soapSql.getConnection();

      expect(connection).toBe(mockMySqlConnection);
      expect(mockMySqlPool.getConnection).toHaveBeenCalled();
    });
  });

  describe('PostgreSQL operations', () => {
    let soapSql: SoapSQL;
    let config: SqlDatabaseConfig;

    beforeEach(async () => {
      config = new SqlDatabaseConfig({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8'
      });

      soapSql = await SoapSQL.create(config);
    });

    it('should get connection pool stats for PostgreSQL', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [{ connections: '3' }] });

      const stats = await soapSql.getConnectionPoolStats();

      expect(stats).toEqual({ connections: 3 });
      expect(mockPgPool.connect).toHaveBeenCalled();
      expect(mockPgClient.release).toHaveBeenCalled();
    });

    it('should get server status for PostgreSQL', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [{ version: 'PostgreSQL 14.0' }] });

      const status = await soapSql.getServerStatus();

      expect(status).toEqual({ version: 'PostgreSQL 14.0' });
    });

    it('should execute query for PostgreSQL', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPgClient.query.mockResolvedValue({ rows: mockRows });

      const result = await soapSql.query('SELECT * FROM users', ['param1']);

      expect(result).toEqual(mockRows);
      expect(mockPgPool.connect).toHaveBeenCalled();
      expect(mockPgClient.release).toHaveBeenCalled();
    });

    it('should get database info for PostgreSQL', async () => {
      const mockInfo = { database_name: 'testdb', version: 'PostgreSQL 14.0' };
      mockPgClient.query.mockResolvedValue({ rows: [mockInfo] });

      const info = await soapSql.getDatabaseInfo();

      expect(info).toEqual(mockInfo);
    });

    it('should check health for PostgreSQL', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [] });

      const isHealthy = await soapSql.isHealthy();

      expect(isHealthy).toBe(true);
      expect(mockPgClient.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should get connection for PostgreSQL', async () => {
      const connection = await soapSql.getConnection();

      expect(connection).toBe(mockPgClient);
      expect(mockPgPool.connect).toHaveBeenCalled();
    });
  });

  describe('SQLite operations', () => {
    let soapSql: SoapSQL;
    let config: SqlDatabaseConfig;

    beforeEach(async () => {
      config = new SqlDatabaseConfig({
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        database: 'test.db',
        username: '',
        password: '',
        connectionLimit: 1,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8',
        filename: 'test.db',
        mode: undefined,
        verbose: false,
        memory: false
      });

      soapSql = await SoapSQL.create(config);
    });

    it('should get connection pool stats for SQLite', async () => {
      mockSqliteDb.get.mockImplementation((sql, callback) => {
        callback(null, { connections: 2 });
      });

      const stats = await soapSql.getConnectionPoolStats();

      expect(stats).toEqual({ connections: 1, tables: 2 });
      expect(mockSqliteDb.get).toHaveBeenCalledWith('SELECT COUNT(*) as connections FROM sqlite_master', expect.any(Function));
    });

    it('should get server status for SQLite', async () => {
      mockSqliteDb.get.mockImplementation((sql, callback) => {
        callback(null, { version: '3.36.0' });
      });

      const status = await soapSql.getServerStatus();

      expect(status).toEqual({ version: '3.36.0' });
      expect(mockSqliteDb.get).toHaveBeenCalledWith('SELECT sqlite_version() as version', expect.any(Function));
    });

    it('should execute SELECT query for SQLite', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockSqliteDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockRows);
      });

      const result = await soapSql.query('SELECT * FROM users', ['param1']);

      expect(result).toEqual(mockRows);
      expect(mockSqliteDb.all).toHaveBeenCalledWith('SELECT * FROM users', ['param1'], expect.any(Function));
    });

    it('should execute INSERT query for SQLite', async () => {
      mockSqliteDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ changes: 1, lastID: 123 }, null);
      });

      const result = await soapSql.query('INSERT INTO users (name) VALUES (?)', ['test']);

      expect(result).toEqual({ affectedRows: 1, insertId: 123 });
      expect(mockSqliteDb.run).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)', ['test'], expect.any(Function));
    });

    it('should get database info for SQLite', async () => {
      const mockInfo = { database_name: 'test.db', version: '3.36.0' };
      mockSqliteDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockInfo);
      });

      const info = await soapSql.getDatabaseInfo();

      expect(info).toEqual(mockInfo);
      expect(mockSqliteDb.get).toHaveBeenCalledWith('SELECT ? as database_name, sqlite_version() as version', ['test.db'], expect.any(Function));
    });

    it('should check health for SQLite', async () => {
      mockSqliteDb.get.mockImplementation((sql, callback) => {
        callback(null, {});
      });

      const isHealthy = await soapSql.isHealthy();

      expect(isHealthy).toBe(true);
      expect(mockSqliteDb.get).toHaveBeenCalledWith('SELECT 1', expect.any(Function));
    });

    it('should get connection for SQLite', async () => {
      const connection = await soapSql.getConnection();

      expect(connection).toBe(mockSqliteDb);
    });
  });

  describe('error handling', () => {
    it('should handle MySQL connection error', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      mockMySqlPool.getConnection.mockRejectedValue(new Error('Connection failed'));

      await expect(SoapSQL.create(config)).rejects.toThrow('Failed to initialize SQL connection: Connection failed');
    });

    it('should handle PostgreSQL connection error', async () => {
      const config = new SqlDatabaseConfig({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8'
      });

      mockPgPool.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(SoapSQL.create(config)).rejects.toThrow('Failed to initialize SQL connection: Connection failed');
    });

    it('should handle SQLite connection error', async () => {
      const config = new SqlDatabaseConfig({
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        database: 'test.db',
        username: '',
        password: '',
        connectionLimit: 1,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8',
        filename: 'test.db',
        mode: undefined,
        verbose: false,
        memory: false
      });

      // Mock the SQLite get method to simulate an error during connection test
      mockSqliteDb.get.mockImplementationOnce((sql, callback) => {
        callback(new Error('SQLite connection failed'));
      });

      await expect(SoapSQL.create(config)).rejects.toThrow('Failed to create SoapSQL instance: Failed to initialize SQL connection: SQLite connection failed');
    });

    it('should handle query execution error', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      const soapSql = await SoapSQL.create(config);
      mockMySqlConnection.query.mockRejectedValue(new Error('Query failed'));

      await expect(soapSql.query('SELECT * FROM users')).rejects.toThrow('Failed to execute query: Query failed');
    });
  });

  describe('close', () => {
    it('should close MySQL connections', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      const soapSql = await SoapSQL.create(config);
      await soapSql.close();

      expect(mockMySqlPool.end).toHaveBeenCalled();
      expect(soapSql.mysqlPool).toBeUndefined();
    });

    it('should close PostgreSQL connections', async () => {
      const config = new SqlDatabaseConfig({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8'
      });

      const soapSql = await SoapSQL.create(config);
      await soapSql.close();

      expect(mockPgPool.end).toHaveBeenCalled();
      expect(soapSql.postgresqlPool).toBeUndefined();
    });

    it('should close SQLite connections', async () => {
      const config = new SqlDatabaseConfig({
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        database: 'test.db',
        username: '',
        password: '',
        connectionLimit: 1,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8',
        filename: 'test.db',
        mode: undefined,
        verbose: false,
        memory: false
      });

      const soapSql = await SoapSQL.create(config);
      mockSqliteDb.close.mockImplementation((callback) => {
        callback(null);
      });

      await soapSql.close();

      expect(mockSqliteDb.close).toHaveBeenCalled();
      expect(soapSql.sqliteDb).toBeUndefined();
    });
  });

  describe('sessions', () => {
    it('should return session manager', async () => {
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        charset: 'utf8mb4'
      });

      const soapSql = await SoapSQL.create(config);

      expect(soapSql.sessions).toBeDefined();
      expect(typeof soapSql.sessions.createSession).toBe('function');
    });
  });
});
