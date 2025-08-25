import { EventEmitter } from 'events';

/**
 * Performance metrics for SQL operations
 */
export interface SqlPerformanceMetrics {
  queryCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  slowestQuery: string;
  slowestQueryTime: number;
  fastestQuery: string;
  fastestQueryTime: number;
  errorCount: number;
  lastQueryTime: number;
}

/**
 * Individual query performance data
 */
export interface QueryPerformanceData {
  sql: string;
  params: any[];
  executionTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  rowsAffected?: number;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceConfig {
  enabled: boolean;
  slowQueryThreshold: number; // milliseconds
  maxQueriesToTrack: number;
  enableQueryLogging: boolean;
  enableMetricsCollection: boolean;
}

/**
 * SQL Performance Monitor for tracking query performance
 */
export class SqlPerformanceMonitor extends EventEmitter {
  private _metrics: SqlPerformanceMetrics;
  private _queries: QueryPerformanceData[] = [];
  private _config: PerformanceConfig;
  private _startTime: number;

  constructor(config: Partial<PerformanceConfig> = {}) {
    super();
    
    this._config = {
      enabled: true,
      slowQueryThreshold: 1000, // 1 second
      maxQueriesToTrack: 1000,
      enableQueryLogging: true,
      enableMetricsCollection: true,
      ...config
    };

    this._startTime = Date.now();
    this._resetMetrics();
  }

  /**
   * Records a query execution
   */
  recordQuery(sql: string, params: any[], executionTime: number, success: boolean, error?: string, rowsAffected?: number): void {
    if (!this._config.enabled) {
      return;
    }

    const queryData: QueryPerformanceData = {
      sql,
      params,
      executionTime,
      timestamp: Date.now(),
      success,
      error,
      rowsAffected
    };

    // Add to queries array
    this._queries.push(queryData);
    
    // Limit the number of queries tracked
    if (this._queries.length > this._config.maxQueriesToTrack) {
      this._queries.shift();
    }

    // Update metrics
    this._updateMetrics(queryData);

    // Emit events
    this._emitQueryEvents(queryData);

    // Log slow queries
    if (executionTime > this._config.slowQueryThreshold) {
      this._logSlowQuery(queryData);
    }
  }

  /**
   * Gets current performance metrics
   */
  getMetrics(): SqlPerformanceMetrics {
    return { ...this._metrics };
  }

  /**
   * Gets recent queries
   */
  getRecentQueries(limit: number = 100): QueryPerformanceData[] {
    return this._queries.slice(-limit).reverse();
  }

  /**
   * Gets slow queries above threshold
   */
  getSlowQueries(threshold?: number): QueryPerformanceData[] {
    const minThreshold = threshold || this._config.slowQueryThreshold;
    return this._queries.filter(q => q.executionTime > minThreshold);
  }

  /**
   * Gets queries by time range
   */
  getQueriesByTimeRange(startTime: number, endTime: number): QueryPerformanceData[] {
    return this._queries.filter(q => q.timestamp >= startTime && q.timestamp <= endTime);
  }

  /**
   * Gets error queries
   */
  getErrorQueries(): QueryPerformanceData[] {
    return this._queries.filter(q => !q.success);
  }

  /**
   * Resets performance metrics
   */
  resetMetrics(): void {
    this._resetMetrics();
    this._queries = [];
    this._startTime = Date.now();
    this.emit('metricsReset');
  }

  /**
   * Exports performance data
   */
  exportData(): {
    metrics: SqlPerformanceMetrics;
    queries: QueryPerformanceData[];
    config: PerformanceConfig;
    startTime: number;
  } {
    return {
      metrics: this.getMetrics(),
      queries: [...this._queries],
      config: { ...this._config },
      startTime: this._startTime
    };
  }

  /**
   * Updates performance configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this._config = { ...this._config, ...config };
    this.emit('configUpdated', this._config);
  }

  /**
   * Gets performance summary
   */
  getPerformanceSummary(): {
    uptime: number;
    queriesPerSecond: number;
    errorRate: number;
    averageResponseTime: number;
    slowQueryPercentage: number;
  } {
    const uptime = Date.now() - this._startTime;
    const uptimeSeconds = uptime / 1000;
    
    return {
      uptime,
      queriesPerSecond: uptimeSeconds > 0 ? this._metrics.queryCount / uptimeSeconds : 0,
      errorRate: this._metrics.queryCount > 0 ? (this._metrics.errorCount / this._metrics.queryCount) * 100 : 0,
      averageResponseTime: this._metrics.averageExecutionTime,
      slowQueryPercentage: this._metrics.queryCount > 0 ? 
        (this.getSlowQueries().length / this._metrics.queryCount) * 100 : 0
    };
  }

  /**
   * Creates a performance report
   */
  generateReport(): string {
    const summary = this.getPerformanceSummary();
    const slowQueries = this.getSlowQueries();
    const errorQueries = this.getErrorQueries();

    let report = '=== SQL Performance Report ===\n\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Uptime: ${Math.round(summary.uptime / 1000)}s\n\n`;
    
    report += '=== Summary ===\n';
    report += `Total Queries: ${this._metrics.queryCount}\n`;
    report += `Queries/Second: ${summary.queriesPerSecond.toFixed(2)}\n`;
    report += `Average Response Time: ${summary.averageResponseTime.toFixed(2)}ms\n`;
    report += `Error Rate: ${summary.errorRate.toFixed(2)}%\n`;
    report += `Slow Query Percentage: ${summary.slowQueryPercentage.toFixed(2)}%\n\n`;

    if (slowQueries.length > 0) {
      report += '=== Slow Queries ===\n';
      slowQueries.slice(0, 10).forEach((query, index) => {
        report += `${index + 1}. ${query.executionTime}ms - ${query.sql.substring(0, 100)}...\n`;
      });
      report += '\n';
    }

    if (errorQueries.length > 0) {
      report += '=== Recent Errors ===\n';
      errorQueries.slice(-5).forEach((query, index) => {
        report += `${index + 1}. ${query.error} - ${query.sql.substring(0, 100)}...\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * Resets performance metrics
   */
  private _resetMetrics(): void {
    this._metrics = {
      queryCount: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      slowestQuery: '',
      slowestQueryTime: 0,
      fastestQuery: '',
      fastestQueryTime: Infinity,
      errorCount: 0,
      lastQueryTime: 0
    };
  }

  /**
   * Updates metrics with new query data
   */
  private _updateMetrics(queryData: QueryPerformanceData): void {
    const { executionTime, success, sql } = queryData;

    this._metrics.queryCount++;
    this._metrics.totalExecutionTime += executionTime;
    this._metrics.averageExecutionTime = this._metrics.totalExecutionTime / this._metrics.queryCount;
    this._metrics.lastQueryTime = queryData.timestamp;

    if (!success) {
      this._metrics.errorCount++;
    }

    // Update slowest query
    if (executionTime > this._metrics.slowestQueryTime) {
      this._metrics.slowestQuery = sql;
      this._metrics.slowestQueryTime = executionTime;
    }

    // Update fastest query
    if (executionTime < this._metrics.fastestQueryTime) {
      this._metrics.fastestQuery = sql;
      this._metrics.fastestQueryTime = executionTime;
    }
  }

  /**
   * Emits query-related events
   */
  private _emitQueryEvents(queryData: QueryPerformanceData): void {
    this.emit('queryExecuted', queryData);
    
    if (!queryData.success) {
      this.emit('queryError', queryData);
    }
    
    if (queryData.executionTime > this._config.slowQueryThreshold) {
      this.emit('slowQuery', queryData);
    }
  }

  /**
   * Logs slow query information
   */
  private _logSlowQuery(queryData: QueryPerformanceData): void {
    if (this._config.enableQueryLogging) {
      console.warn(`[SQL Performance] Slow query detected: ${queryData.executionTime}ms`);
      console.warn(`SQL: ${queryData.sql}`);
      if (queryData.params.length > 0) {
        console.warn(`Params: ${JSON.stringify(queryData.params)}`);
      }
    }
  }

  /**
   * Creates a performance monitor instance
   */
  static create(config?: Partial<PerformanceConfig>): SqlPerformanceMonitor {
    return new SqlPerformanceMonitor(config);
  }
}

/**
 * Performance decorator for methods
 */
export function trackPerformance(monitor: SqlPerformanceMonitor) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      let error: string | undefined;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const executionTime = Date.now() - startTime;
        monitor.recordQuery(
          `${target.constructor.name}.${propertyName}`,
          args,
          executionTime,
          success,
          error
        );
      }
    };

    return descriptor;
  };
}
