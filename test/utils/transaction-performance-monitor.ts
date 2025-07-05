import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  transactionId: string;
  startTime: Date;
  cpuTime: number;
  memoryUsage: number;
  ioOperations: number;
  queryCount: number;
  averageQueryTime: number;
  slowQueries: number;
  lockWaitTime: number;
  dataRead: number;
  dataWritten: number;
}

export interface PerformanceAlert {
  transactionId: string;
  alertType: 'slow_query' | 'high_memory' | 'excessive_locks' | 'long_running';
  threshold: number;
  currentValue: number;
  timestamp: Date;
  suggestion: string;
}

export class TransactionPerformanceMonitor extends EventEmitter {
  private activeMonitors = new Map<string, PerformanceMetrics>();
  private performanceHistory: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  
  private thresholds = {
    slowQueryMs: 1000,
    highMemoryMB: 100,
    maxLockWaitMs: 5000,
    longRunningMs: 30000,
    maxConcurrentQueries: 100
  };
  
  private aggregateMetrics = {
    totalTransactions: 0,
    averageTransactionTime: 0,
    slowTransactions: 0,
    memoryPeakMB: 0,
    totalQueries: 0,
    averageQueryTime: 0
  };
  
  constructor() {
    super();
    this.startMonitoring();
  }
  
  startTransaction(transactionId: string): void {
    const metrics: PerformanceMetrics = {
      transactionId,
      startTime: new Date(),
      cpuTime: 0,
      memoryUsage: 0,
      ioOperations: 0,
      queryCount: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      lockWaitTime: 0,
      dataRead: 0,
      dataWritten: 0
    };
    
    this.activeMonitors.set(transactionId, metrics);
  }
  
  recordQuery(transactionId: string, queryTime: number, dataSize: number = 0): void {
    const metrics = this.activeMonitors.get(transactionId);
    if (!metrics) return;
    
    metrics.queryCount++;
    metrics.averageQueryTime = ((metrics.averageQueryTime * (metrics.queryCount - 1)) + queryTime) / metrics.queryCount;\n    \n    if (queryTime > this.thresholds.slowQueryMs) {\n      metrics.slowQueries++;\n      this.emitAlert(transactionId, 'slow_query', this.thresholds.slowQueryMs, queryTime, \n        'Consider optimizing query or adding appropriate indexes');\n    }\n    \n    metrics.dataRead += dataSize;\n    this.updateMemoryUsage(transactionId);\n  }\n  \n  recordLockWait(transactionId: string, waitTime: number): void {\n    const metrics = this.activeMonitors.get(transactionId);\n    if (!metrics) return;\n    \n    metrics.lockWaitTime += waitTime;\n    \n    if (waitTime > this.thresholds.maxLockWaitMs) {\n      this.emitAlert(transactionId, 'excessive_locks', this.thresholds.maxLockWaitMs, waitTime,\n        'Consider reviewing transaction isolation level or reducing transaction scope');\n    }\n  }\n  \n  private updateMemoryUsage(transactionId: string): void {\n    const memUsage = process.memoryUsage();\n    const memUsageMB = memUsage.heapUsed / 1024 / 1024;\n    \n    const metrics = this.activeMonitors.get(transactionId);\n    if (!metrics) return;\n    \n    metrics.memoryUsage = Math.max(metrics.memoryUsage, memUsageMB);\n    \n    if (memUsageMB > this.thresholds.highMemoryMB) {\n      this.emitAlert(transactionId, 'high_memory', this.thresholds.highMemoryMB, memUsageMB,\n        'Consider reducing data set size or implementing streaming/pagination');\n    }\n    \n    this.aggregateMetrics.memoryPeakMB = Math.max(this.aggregateMetrics.memoryPeakMB, memUsageMB);\n  }\n  \n  private startMonitoring(): void {\n    this.monitoringInterval = setInterval(() => {\n      this.checkLongRunningTransactions();\n      this.updateAggregateMetrics();\n    }, 10000); // Check every 10 seconds\n  }\n  \n  private checkLongRunningTransactions(): void {\n    const now = Date.now();\n    \n    for (const [transactionId, metrics] of this.activeMonitors) {\n      const runtime = now - metrics.startTime.getTime();\n      \n      if (runtime > this.thresholds.longRunningMs) {\n        this.emitAlert(transactionId, 'long_running', this.thresholds.longRunningMs, runtime,\n          'Consider breaking down transaction into smaller units or adding explicit commits');\n      }\n    }\n  }\n  \n  private emitAlert(transactionId: string, alertType: PerformanceAlert['alertType'], \n                   threshold: number, currentValue: number, suggestion: string): void {\n    const alert: PerformanceAlert = {\n      transactionId,\n      alertType,\n      threshold,\n      currentValue,\n      timestamp: new Date(),\n      suggestion\n    };\n    \n    this.alerts.push(alert);\n    \n    // Keep only last 100 alerts\n    if (this.alerts.length > 100) {\n      this.alerts = this.alerts.slice(-100);\n    }\n    \n    console.warn(`⚠️ Performance Alert [${alertType}]: Transaction ${transactionId} - ${suggestion}`);\n    this.emit('performanceAlert', alert);\n  }\n  \n  private updateAggregateMetrics(): void {\n    // Update aggregate metrics based on current active transactions\n    const activeMetrics = Array.from(this.activeMonitors.values());\n    \n    if (activeMetrics.length > 0) {\n      const totalQueries = activeMetrics.reduce((sum, m) => sum + m.queryCount, 0);\n      const totalQueryTime = activeMetrics.reduce((sum, m) => sum + (m.averageQueryTime * m.queryCount), 0);\n      \n      this.aggregateMetrics.totalQueries += totalQueries;\n      if (totalQueries > 0) {\n        this.aggregateMetrics.averageQueryTime = totalQueryTime / totalQueries;\n      }\n    }\n  }\n  \n  getMetrics(transactionId: string): PerformanceMetrics | undefined {\n    return this.activeMonitors.get(transactionId);\n  }\n  \n  finishTransaction(transactionId: string): PerformanceMetrics | undefined {\n    const metrics = this.activeMonitors.get(transactionId);\n    if (!metrics) return undefined;\n    \n    // Calculate final metrics\n    const runtime = Date.now() - metrics.startTime.getTime();\n    \n    // Add to history\n    this.performanceHistory.push({ ...metrics });\n    \n    // Update aggregate metrics\n    this.aggregateMetrics.totalTransactions++;\n    this.aggregateMetrics.averageTransactionTime = \n      ((this.aggregateMetrics.averageTransactionTime * (this.aggregateMetrics.totalTransactions - 1)) + runtime) / \n      this.aggregateMetrics.totalTransactions;\n    \n    if (runtime > this.thresholds.longRunningMs) {\n      this.aggregateMetrics.slowTransactions++;\n    }\n    \n    // Cleanup\n    this.activeMonitors.delete(transactionId);\n    \n    // Keep history manageable\n    if (this.performanceHistory.length > 1000) {\n      this.performanceHistory = this.performanceHistory.slice(-1000);\n    }\n    \n    return metrics;\n  }\n  \n  cleanup(transactionId: string): void {\n    this.activeMonitors.delete(transactionId);\n  }\n  \n  getReport(): {\n    aggregateMetrics: typeof this.aggregateMetrics;\n    activeTransactions: number;\n    recentAlerts: PerformanceAlert[];\n    topSlowQueries: Array<{transactionId: string, averageQueryTime: number}>;\n    memoryTrend: number[];\n  } {\n    const now = Date.now();\n    const recentAlerts = this.alerts\n      .filter(a => now - a.timestamp.getTime() < 3600000) // Last hour\n      .slice(-20); // Last 20 alerts\n    \n    const topSlowQueries = this.performanceHistory\n      .filter(m => m.averageQueryTime > 0)\n      .sort((a, b) => b.averageQueryTime - a.averageQueryTime)\n      .slice(0, 10)\n      .map(m => ({ transactionId: m.transactionId, averageQueryTime: m.averageQueryTime }));\n    \n    // Simple memory trend (last 10 data points)\n    const memoryTrend = this.performanceHistory\n      .slice(-10)\n      .map(m => m.memoryUsage);\n    \n    return {\n      aggregateMetrics: { ...this.aggregateMetrics },\n      activeTransactions: this.activeMonitors.size,\n      recentAlerts,\n      topSlowQueries,\n      memoryTrend\n    };\n  }\n  \n  destroy(): void {\n    if (this.monitoringInterval) {\n      clearInterval(this.monitoringInterval);\n    }\n    this.removeAllListeners();\n  }\n}