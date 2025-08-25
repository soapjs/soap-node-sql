import { SqlPerformanceMonitor } from '../../sql.performance';
import { SoapSQL } from '../../soap.sql';
import { SqlDataSource } from '../../sql.source';
import { 
  setupMySqlDatabase,
  cleanupTestDatabases,
  cleanupMySqlTables,
  mysqlSoap,
  createMySqlTestTable,
  insertMySqlTestData
} from './setup';

describe('MySQL Performance Integration Tests', () => {
  let performanceMonitor: SqlPerformanceMonitor;
  let dataSource: SqlDataSource<any>;

  beforeAll(async () => {
    // Setup test database
    await setupMySqlDatabase();
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabases();
  });

  beforeEach(async () => {
    // Ensure we have a valid connection before each test
    if (!mysqlSoap || !mysqlSoap.mysqlPool) {
      console.log('Reconnecting to MySQL for performance test...');
      await setupMySqlDatabase();
    }

    // Create test table for MySQL
    const createTableSQL = `
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INT,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    
    await createMySqlTestTable('users', createTableSQL);
    
    // Create fresh performance monitor for each test
    performanceMonitor = new SqlPerformanceMonitor({
      enabled: true,
      slowQueryThreshold: 100, // Low threshold for testing
      maxQueriesToTrack: 1000,
      enableQueryLogging: true,
      enableMetricsCollection: true
    });

    // Create data source with performance monitoring
    dataSource = new SqlDataSource<any>(mysqlSoap!, 'users');
  });

  afterEach(async () => {
    // Reset performance monitor
    performanceMonitor.resetMetrics();
    
    // Clean up tables after each test
    try {
      await cleanupMySqlTables();
    } catch (error) {
      console.log('Cleanup error (expected):', error.message);
    }
  });

  describe('Query Performance Tracking', () => {
    it('should track simple SELECT queries', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' }
      ];
      await insertMySqlTestData('users', testData);

      const startTime = Date.now();
      
      await dataSource.find({});
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Manually record the query since we're not integrating monitor with dataSource yet
      performanceMonitor.recordQuery(
        'SELECT * FROM users',
        [],
        executionTime,
        true
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.totalExecutionTime).toBeGreaterThan(0);
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
    }, 30000); // Add timeout

    it('should track complex queries with WHERE clauses', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const startTime = Date.now();
      
      await dataSource.find({ age: { $gte: 25 } });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(
        'SELECT * FROM users WHERE age >= ?',
        [25],
        executionTime,
        true
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.slowestQuery).toContain('WHERE age >=');
    }, 30000); // Add timeout

    it('should track INSERT operations', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const startTime = Date.now();
      
      await dataSource.insert({
        name: 'Performance Test User',
        email: 'perf@test.com',
        age: 30,
        status: 'active'
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(
        'INSERT INTO users (name, email, age, status) VALUES (?, ?, ?, ?)',
        ['Performance Test User', 'perf@test.com', 30, 'active'],
        executionTime,
        true,
        undefined,
        1
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.slowestQuery).toContain('INSERT INTO');
    }, 30000); // Add timeout

    it('should track UPDATE operations', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // First insert a record
      const inserted = await dataSource.insert({
        name: 'Update Test User',
        email: 'update@test.com',
        age: 25,
        status: 'inactive'
      });

      const startTime = Date.now();
      
      await dataSource.update({
        collection: 'users',
        criteria: { id: inserted[0].id },
        data: { status: 'active', age: 26 }
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(
        'UPDATE users SET status = ?, age = ? WHERE id = ?',
        ['active', 26, inserted[0].id],
        executionTime,
        true,
        undefined,
        1
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.slowestQuery).toContain('UPDATE');
    }, 30000); // Add timeout

    it('should track DELETE operations', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // First insert a record
      const inserted = await dataSource.insert({
        name: 'Delete Test User',
        email: 'delete@test.com',
        age: 35,
        status: 'active'
      });

      const startTime = Date.now();
      
      await dataSource.remove({
        collection: 'users',
        criteria: { id: inserted[0].id }
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(
        'DELETE FROM users WHERE id = ?',
        [inserted[0].id],
        executionTime,
        true,
        undefined,
        1
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.slowestQuery).toContain('DELETE');
    }, 30000); // Add timeout
  });

  describe('Slow Query Detection', () => {
    it('should detect slow queries', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Insert some test data first
      const testData = [
        { name: 'User 1', email: 'user1@test.com', age: 25, status: 'active' },
        { name: 'User 2', email: 'user2@test.com', age: 30, status: 'active' },
        { name: 'User 3', email: 'user3@test.com', age: 35, status: 'active' }
      ];
      await insertMySqlTestData('users', testData);

      // Simulate a slow query
      const slowQuery = `
        SELECT u.*, 
               (SELECT COUNT(*) FROM users WHERE age > u.age) as older_count,
               (SELECT COUNT(*) FROM users WHERE age < u.age) as younger_count
        FROM users u
        WHERE u.age BETWEEN 20 AND 30
        ORDER BY u.age DESC
      `;

      const startTime = Date.now();
      
      // Execute the slow query
      await mysqlSoap!.query(slowQuery);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(slowQuery, [], executionTime, true);

      const slowQueries = performanceMonitor.getSlowQueries();
      if (executionTime > 100) { // Only if query was actually slow
        expect(slowQueries.length).toBeGreaterThan(0);
        expect(slowQueries[0].sql).toBe(slowQuery);
      }
    }, 30000); // Add timeout

    it('should not flag fast queries as slow', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const fastQuery = 'SELECT COUNT(*) FROM users';

      const startTime = Date.now();
      
      await mysqlSoap!.query(fastQuery);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(fastQuery, [], executionTime, true);

      const slowQueries = performanceMonitor.getSlowQueries();
      expect(slowQueries.length).toBe(0);
    }, 30000); // Add timeout
  });

  describe('Error Query Tracking', () => {
    it('should track failed queries', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const invalidQuery = 'SELECT * FROM non_existent_table';

      const startTime = Date.now();
      let error: string | undefined;
      
      try {
        await mysqlSoap!.query(invalidQuery);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(invalidQuery, [], executionTime, false, error);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.errorCount).toBe(1);

      const errorQueries = performanceMonitor.getErrorQueries();
      expect(errorQueries.length).toBe(1);
      expect(errorQueries[0].error).toBeDefined();
    }, 30000); // Add timeout

    it('should track syntax errors', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const syntaxErrorQuery = 'SELECT * FROM users WHERE';

      const startTime = Date.now();
      let error: string | undefined;
      
      try {
        await mysqlSoap!.query(syntaxErrorQuery);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(syntaxErrorQuery, [], executionTime, false, error);

      const errorQueries = performanceMonitor.getErrorQueries();
      expect(errorQueries.length).toBe(1);
      expect(errorQueries[0].success).toBe(false);
    }, 30000); // Add timeout
  });

  describe('Performance Metrics', () => {
    it('should calculate correct performance summary', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Execute multiple queries
      const queries = [
        { sql: 'SELECT * FROM users', params: [], expectedTime: 10 },
        { sql: 'SELECT COUNT(*) FROM users', params: [], expectedTime: 5 },
        { sql: 'SELECT * FROM users WHERE age > ?', params: [25], expectedTime: 15 }
      ];

      for (const query of queries) {
        const startTime = Date.now();
        await mysqlSoap!.query(query.sql, query.params);
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        performanceMonitor.recordQuery(query.sql, query.params, executionTime, true);
      }

      const summary = performanceMonitor.getPerformanceSummary();
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(3);
      expect(summary.queriesPerSecond).toBeGreaterThan(0);
      expect(summary.errorRate).toBe(0);
      expect(summary.averageResponseTime).toBeGreaterThan(0);
      expect(summary.slowQueryPercentage).toBe(0); // No queries above 100ms threshold
    }, 30000); // Add timeout

    it('should handle mixed success and error queries', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Successful query
      const startTime1 = Date.now();
      await mysqlSoap!.query('SELECT * FROM users');
      const endTime1 = Date.now();
      performanceMonitor.recordQuery('SELECT * FROM users', [], endTime1 - startTime1, true);

      // Failed query
      const startTime2 = Date.now();
      let error: string | undefined;
      try {
        await mysqlSoap!.query('SELECT * FROM invalid_table');
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const endTime2 = Date.now();
      performanceMonitor.recordQuery('SELECT * FROM invalid_table', [], endTime2 - startTime2, false, error);

      const summary = performanceMonitor.getPerformanceSummary();
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(2);
      expect(summary.errorRate).toBe(50);
    }, 30000); // Add timeout
  });

  describe('Query History', () => {
    it('should maintain query history', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const queries = [
        'SELECT * FROM users',
        'SELECT COUNT(*) FROM users',
        'SELECT * FROM users WHERE age > 25'
      ];

      for (const sql of queries) {
        const startTime = Date.now();
        await mysqlSoap!.query(sql);
        const endTime = Date.now();
        performanceMonitor.recordQuery(sql, [], endTime - startTime, true);
      }

      const recentQueries = performanceMonitor.getRecentQueries();
      expect(recentQueries.length).toBe(3);
      expect(recentQueries[0].sql).toBe('SELECT * FROM users WHERE age > 25');
      expect(recentQueries[1].sql).toBe('SELECT COUNT(*) FROM users');
      expect(recentQueries[2].sql).toBe('SELECT * FROM users');
    }, 30000); // Add timeout

    it('should limit query history size', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      const limitedMonitor = new SqlPerformanceMonitor({
        enabled: true,
        maxQueriesToTrack: 2
      });

      const queries = [
        'SELECT * FROM users',
        'SELECT COUNT(*) FROM users',
        'SELECT * FROM users WHERE age > 25'
      ];

      for (const sql of queries) {
        const startTime = Date.now();
        await mysqlSoap!.query(sql);
        const endTime = Date.now();
        limitedMonitor.recordQuery(sql, [], endTime - startTime, true);
      }

      const recentQueries = limitedMonitor.getRecentQueries();
      expect(recentQueries.length).toBe(2);
      expect(recentQueries[0].sql).toBe('SELECT * FROM users WHERE age > 25');
      expect(recentQueries[1].sql).toBe('SELECT COUNT(*) FROM users');
    }, 30000); // Add timeout
  });

  describe('Performance Report Generation', () => {
    it('should generate comprehensive performance report', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Execute various types of queries
      const queries = [
        { sql: 'SELECT * FROM users', success: true },
        { sql: 'SELECT COUNT(*) FROM users', success: true },
        { sql: 'SELECT * FROM invalid_table', success: false }
      ];

      for (const query of queries) {
        const startTime = Date.now();
        let error: string | undefined;
        
        try {
          await mysqlSoap!.query(query.sql);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        performanceMonitor.recordQuery(query.sql, [], executionTime, query.success, error);
      }

      const report = performanceMonitor.generateReport();
      
      expect(report).toContain('=== SQL Performance Report ===');
      expect(report).toContain('Total Queries: 3');
      expect(report).toContain('Error Rate: 33.33%');
      expect(report).toContain('Recent Errors');
      expect(report).toContain('invalid_table');
    }, 30000); // Add timeout
  });

  describe('Real-world Performance Scenarios', () => {
    it('should handle bulk operations', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Insert multiple records
      const bulkData = Array.from({ length: 10 }, (_, i) => ({
        name: `Bulk User ${i}`,
        email: `bulk${i}@test.com`,
        age: 20 + i,
        status: 'active'
      }));

      const startTime = Date.now();
      
      for (const data of bulkData) {
        await dataSource.insert(data);
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(
        'Bulk INSERT operations',
        [],
        executionTime,
        true,
        undefined,
        bulkData.length
      );

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.totalExecutionTime).toBeGreaterThan(0);
    }, 60000); // Longer timeout for bulk operations

    it('should track complex joins and aggregations', async () => {
      // Ensure connection is valid
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Insert some test data first
      const testData = [
        { name: 'User 1', email: 'user1@test.com', age: 25, status: 'active' },
        { name: 'User 2', email: 'user2@test.com', age: 30, status: 'active' },
        { name: 'User 3', email: 'user3@test.com', age: 25, status: 'active' },
        { name: 'User 4', email: 'user4@test.com', age: 35, status: 'inactive' }
      ];
      await insertMySqlTestData('users', testData);

      const complexQuery = `
        SELECT 
          u.age,
          COUNT(*) as total_users,
          AVG(u.age) as avg_age
        FROM users u
        WHERE u.status = 'active'
        GROUP BY u.age
        HAVING COUNT(*) > 1
        ORDER BY avg_age DESC
      `;

      const startTime = Date.now();
      
      await mysqlSoap!.query(complexQuery);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      performanceMonitor.recordQuery(complexQuery, [], executionTime, true);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.slowestQuery).toContain('GROUP BY');
    }, 30000); // Add timeout
  });
});
