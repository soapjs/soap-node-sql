import { 
  SqlPerformanceMonitor, 
  SqlPerformanceMetrics, 
  QueryPerformanceData,
  PerformanceConfig,
  trackPerformance
} from '../sql.performance';

describe('SqlPerformanceMonitor', () => {
  let monitor: SqlPerformanceMonitor;

  beforeEach(() => {
    monitor = new SqlPerformanceMonitor({
      enabled: true,
      slowQueryThreshold: 1000,
      maxQueriesToTrack: 100,
      enableQueryLogging: true,
      enableMetricsCollection: true
    });
  });

  describe('recordQuery', () => {
    it('should record a successful query', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [1];
      const executionTime = 50;
      
      monitor.recordQuery(sql, params, executionTime, true);

      const metrics = monitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.totalExecutionTime).toBe(50);
      expect(metrics.averageExecutionTime).toBe(50);
      expect(metrics.errorCount).toBe(0);
    });

    it('should record a failed query', () => {
      const sql = 'SELECT * FROM invalid_table';
      const params = [];
      const executionTime = 100;
      const error = 'Table does not exist';
      
      monitor.recordQuery(sql, params, executionTime, false, error);

      const metrics = monitor.getMetrics();
      expect(metrics.queryCount).toBe(1);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.lastQueryTime).toBeGreaterThan(0);
    });

    it('should not record when disabled', () => {
      const disabledMonitor = new SqlPerformanceMonitor({ enabled: false });
      
      disabledMonitor.recordQuery('SELECT * FROM users', [], 50, true);
      
      const metrics = disabledMonitor.getMetrics();
      expect(metrics.queryCount).toBe(0);
    });

    it('should track slowest and fastest queries', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 10, true);
      monitor.recordQuery('SELECT * FROM comments', [], 500, true);

      const metrics = monitor.getMetrics();
      expect(metrics.slowestQueryTime).toBe(500);
      expect(metrics.slowestQuery).toBe('SELECT * FROM comments');
      expect(metrics.fastestQueryTime).toBe(10);
      expect(metrics.fastestQuery).toBe('SELECT * FROM posts');
    });
  });

  describe('getMetrics', () => {
    it('should return current performance metrics', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);

      const metrics = monitor.getMetrics();
      
      expect(metrics.queryCount).toBe(2);
      expect(metrics.totalExecutionTime).toBe(300);
      expect(metrics.averageExecutionTime).toBe(150);
      expect(metrics.errorCount).toBe(0);
    });

    it('should return copy of metrics', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);

      const metrics1 = monitor.getMetrics();
      const metrics2 = monitor.getMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('getRecentQueries', () => {
    it('should return recent queries', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);
      monitor.recordQuery('SELECT * FROM comments', [], 300, true);

      const recentQueries = monitor.getRecentQueries(2);
      expect(recentQueries).toHaveLength(2);
      expect(recentQueries[0].sql).toBe('SELECT * FROM comments');
      expect(recentQueries[1].sql).toBe('SELECT * FROM posts');
    });

    it('should return all queries when limit is not specified', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);

      const recentQueries = monitor.getRecentQueries();
      expect(recentQueries).toHaveLength(2);
    });
  });

  describe('getSlowQueries', () => {
    it('should return slow queries above threshold', () => {
      const slowMonitor = new SqlPerformanceMonitor({
        enabled: true,
        slowQueryThreshold: 50 // Very low threshold for testing
      });
      
      // Fast query
      slowMonitor.recordQuery('SELECT * FROM users', [], 30, true);
      
      // Slow query
      slowMonitor.recordQuery('SELECT * FROM posts', [], 100, true);

      const slowQueries = slowMonitor.getSlowQueries();
      expect(slowQueries).toHaveLength(1);
      expect(slowQueries[0].sql).toBe('SELECT * FROM posts');
      expect(slowQueries[0].executionTime).toBe(100);
    });

    it('should use custom threshold', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);

      const slowQueries = monitor.getSlowQueries(150);
      expect(slowQueries).toHaveLength(1);
      expect(slowQueries[0].sql).toBe('SELECT * FROM posts');
    });
  });

  describe('getQueriesByTimeRange', () => {
    it('should return queries within time range', async () => {
      const startTime = Date.now();
      
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 50));
      const middleTime = Date.now();
      
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);
      
      const endTime = Date.now();

      const queriesInRange = monitor.getQueriesByTimeRange(startTime, middleTime);
      // The first query should be in range, the second should not
      expect(queriesInRange.length).toBeGreaterThanOrEqual(1);
      expect(queriesInRange[0].sql).toBe('SELECT * FROM users');
      
      // Verify the second query is not in range
      const allQueries = monitor.getRecentQueries();
      const secondQuery = allQueries.find(q => q.sql === 'SELECT * FROM posts');
      expect(secondQuery!.timestamp).toBeGreaterThanOrEqual(middleTime);
    });
  });

  describe('getErrorQueries', () => {
    it('should return only error queries', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM invalid_table', [], 50, false, 'Table not found');
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);
      monitor.recordQuery('INVALID SQL', [], 10, false, 'Syntax error');

      const errorQueries = monitor.getErrorQueries();
      expect(errorQueries).toHaveLength(2);
      expect(errorQueries[0].error).toBe('Table not found');
      expect(errorQueries[1].error).toBe('Syntax error');
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      
      expect(monitor.getMetrics().queryCount).toBe(1);
      
      monitor.resetMetrics();
      
      const metrics = monitor.getMetrics();
      expect(metrics.queryCount).toBe(0);
      expect(metrics.totalExecutionTime).toBe(0);
      expect(metrics.averageExecutionTime).toBe(0);
      expect(metrics.errorCount).toBe(0);
    });

    it('should clear queries array', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      
      expect(monitor.getRecentQueries()).toHaveLength(1);
      
      monitor.resetMetrics();
      
      expect(monitor.getRecentQueries()).toHaveLength(0);
    });
  });

  describe('exportData', () => {
    it('should export performance data', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);

      const exportedData = monitor.exportData();
      
      expect(exportedData.metrics).toBeDefined();
      expect(exportedData.queries).toBeDefined();
      expect(exportedData.config).toBeDefined();
      expect(exportedData.startTime).toBeDefined();
      expect(exportedData.queries).toHaveLength(1);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = { slowQueryThreshold: 500 };
      
      monitor.updateConfig(newConfig);
      
      // Record a query that should now be considered slow
      monitor.recordQuery('SELECT * FROM users', [], 600, true);
      
      const slowQueries = monitor.getSlowQueries();
      expect(slowQueries).toHaveLength(1);
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return performance summary', async () => {
      // Wait a bit to ensure uptime is greater than 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);
      monitor.recordQuery('SELECT * FROM invalid_table', [], 50, false, 'Error');

      const summary = monitor.getPerformanceSummary();
      
      expect(summary.uptime).toBeGreaterThan(0);
      expect(summary.queriesPerSecond).toBeGreaterThan(0);
      expect(summary.errorRate).toBeCloseTo(33.33, 1); // 1 out of 3 queries failed
      expect(summary.averageResponseTime).toBeCloseTo(116.67, 1); // (100 + 200 + 50) / 3
      expect(summary.slowQueryPercentage).toBe(0); // No queries above 1000ms threshold
    });

    it('should handle empty metrics', async () => {
      // Wait a bit to ensure uptime is greater than 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const summary = monitor.getPerformanceSummary();
      
      expect(summary.uptime).toBeGreaterThan(0);
      expect(summary.queriesPerSecond).toBe(0);
      expect(summary.errorRate).toBe(0);
      expect(summary.averageResponseTime).toBe(0);
      expect(summary.slowQueryPercentage).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate performance report', () => {
      monitor.recordQuery('SELECT * FROM users', [], 100, true);
      monitor.recordQuery('SELECT * FROM posts', [], 200, true);
      monitor.recordQuery('SELECT * FROM invalid_table', [], 50, false, 'Table not found');

      const report = monitor.generateReport();
      
      expect(report).toContain('=== SQL Performance Report ===');
      expect(report).toContain('Total Queries: 3');
      expect(report).toContain('Error Rate: 33.33%');
      expect(report).toContain('Recent Errors');
      expect(report).toContain('Table not found');
    });
  });

  describe('maxQueriesToTrack limit', () => {
    it('should limit the number of tracked queries', () => {
      const limitedMonitor = new SqlPerformanceMonitor({
        enabled: true,
        maxQueriesToTrack: 2
      });

      // Add 3 queries
      limitedMonitor.recordQuery('SELECT * FROM users', [], 100, true);
      limitedMonitor.recordQuery('SELECT * FROM posts', [], 200, true);
      limitedMonitor.recordQuery('SELECT * FROM comments', [], 300, true);

      const queries = limitedMonitor.getRecentQueries();
      expect(queries).toHaveLength(2);
      // Should keep the latest queries
      expect(queries[0].sql).toBe('SELECT * FROM comments');
      expect(queries[1].sql).toBe('SELECT * FROM posts');
    });
  });

  describe('events', () => {
    it('should emit queryExecuted event', (done) => {
      monitor.on('queryExecuted', (queryData: QueryPerformanceData) => {
        expect(queryData.sql).toBe('SELECT * FROM users');
        expect(queryData.executionTime).toBe(100);
        expect(queryData.success).toBe(true);
        done();
      });

      monitor.recordQuery('SELECT * FROM users', [], 100, true);
    });

    it('should emit queryError event for failed queries', (done) => {
      monitor.on('queryError', (queryData: QueryPerformanceData) => {
        expect(queryData.sql).toBe('SELECT * FROM invalid_table');
        expect(queryData.success).toBe(false);
        expect(queryData.error).toBe('Table not found');
        done();
      });

      monitor.recordQuery('SELECT * FROM invalid_table', [], 50, false, 'Table not found');
    });

    it('should emit slowQuery event for slow queries', (done) => {
      const slowMonitor = new SqlPerformanceMonitor({
        enabled: true,
        slowQueryThreshold: 50
      });

      slowMonitor.on('slowQuery', (queryData: QueryPerformanceData) => {
        expect(queryData.sql).toBe('SELECT * FROM posts');
        expect(queryData.executionTime).toBe(100);
        done();
      });

      slowMonitor.recordQuery('SELECT * FROM posts', [], 100, true);
    });
  });
});

describe('trackPerformance decorator', () => {
  let monitor: SqlPerformanceMonitor;
  let testClass: any;

  beforeEach(() => {
    monitor = new SqlPerformanceMonitor();
    
    class TestClass {
      @trackPerformance(monitor)
      async testMethod(arg: string): Promise<string> {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 10));
        return `Hello ${arg}`;
      }

      @trackPerformance(monitor)
      async failingMethod(): Promise<void> {
        // Simulate some work before failing
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Test error');
      }
    }

    testClass = new TestClass();
  });

  it('should track method execution', async () => {
    await testClass.testMethod('World');

    const metrics = monitor.getMetrics();
    expect(metrics.queryCount).toBe(1);
    expect(metrics.averageExecutionTime).toBeGreaterThan(0);
  });

  it('should track method errors', async () => {
    await expect(testClass.failingMethod()).rejects.toThrow('Test error');

    const metrics = monitor.getMetrics();
    expect(metrics.queryCount).toBe(1);
    expect(metrics.errorCount).toBe(1);
  });
});
