import { PoolMetrics, ConnectionLease } from './connection-pool-manager';
import { TestDatabaseHelpers } from './test-db-helpers';
import { EventEmitter } from 'events';
import { promisify } from 'util';

export interface MetricsAlert {
  id: string;
  level: 'warning' | 'error' | 'info' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  frequency: number;
  firstOccurred: Date;
}

export interface MetricsThresholds {
  maxActiveConnections: number;
  maxWaitingClients: number;
  maxAverageLeaseTime: number;
  maxConnectionErrors: number;
  maxLeaseCount: number;
  // Enhanced thresholds
  maxSlowQueries: number;
  maxMemoryUsageMB: number;
  maxQueryExecutionTime: number;
  maxDeadlocks: number;
  maxTransactionTimeouts: number;
  maxSecurityViolations: number;
  minIdleConnections: number;
}

export class PoolMetricsDashboard extends EventEmitter {
  private alerts: Map<string, MetricsAlert> = new Map();
  private thresholds: MetricsThresholds;
  private metricsHistory: PoolMetrics[] = [];
  private alertHistory: MetricsAlert[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private lastReportTime = 0;
  private reportCache?: string;
  private reportCacheTimeout = 5000; // 5 second cache
  private maxHistorySize = 1000;
  private maxAlertHistorySize = 500;

  constructor(thresholds?: Partial<MetricsThresholds>) {
    super();
    
    this.thresholds = {
      maxActiveConnections: 15,
      maxWaitingClients: 5,
      maxAverageLeaseTime: 25000, // 25 seconds
      maxConnectionErrors: 3,
      maxLeaseCount: 20,
      // Enhanced default thresholds
      maxSlowQueries: 10,
      maxMemoryUsageMB: 500,
      maxQueryExecutionTime: 5000,
      maxDeadlocks: 2,
      maxTransactionTimeouts: 5,
      maxSecurityViolations: 1,
      minIdleConnections: 1,
      ...thresholds
    };
    
    // Set up periodic monitoring
    this.startMonitoring();
  }

  generateReport(includeDetails = true): string {
    // Use cached report if recent enough
    if (this.reportCache && (Date.now() - this.lastReportTime) < this.reportCacheTimeout) {
      return this.reportCache;
    }
    
    const metrics = TestDatabaseHelpers.getPoolMetrics();
    const activeLeases = TestDatabaseHelpers.getActiveLeases();
    
    if (!metrics) {
      const errorReport = '❌ Database metrics not available - tests may be running in mock mode\n';
      this.reportCache = errorReport;
      this.lastReportTime = Date.now();
      return errorReport;
    }

    this.checkThresholds(metrics);
    this.storeMetrics(metrics);

    let report = '\n📊 DATABASE CONNECTION POOL METRICS DASHBOARD\n';
    report += '═'.repeat(70) + '\n';
    report += `Generated: ${new Date().toLocaleString()} | Uptime: ${this.formatDuration(metrics.uptimeMs)}\n\n`;

    // Health Summary
    const healthStatus = this.getOverallHealthStatus(metrics);
    report += `📊 OVERALL HEALTH: ${healthStatus.status} ${healthStatus.indicator}\n`;
    if (healthStatus.issues.length > 0) {
      report += `Issues: ${healthStatus.issues.join(', ')}\n`;
    }
    report += '\n';

    // Connection Pool Status
    report += '🔗 CONNECTION POOL STATUS\n';
    report += `  Total Connections: ${metrics.totalConnections}\n`;
    report += `  Active Connections: ${metrics.activeConnections}/${this.thresholds.maxActiveConnections} ${this.getStatusIndicator(metrics.activeConnections, this.thresholds.maxActiveConnections)}\n`;
    report += `  Idle Connections: ${metrics.idleConnections} ${this.getIdleStatus(metrics.idleConnections)}\n`;
    report += `  Waiting Clients: ${metrics.waitingClients} ${this.getStatusIndicator(metrics.waitingClients, this.thresholds.maxWaitingClients)}\n`;
    report += `  Peak Connections: ${metrics.peakConnections}\n\n`;

    // Lease Management
    report += '📝 LEASE MANAGEMENT\n';
    report += `  Acquired Leases: ${metrics.acquiredLeases}/${this.thresholds.maxLeaseCount} ${this.getStatusIndicator(metrics.acquiredLeases, this.thresholds.maxLeaseCount)}\n`;
    report += `  Total Leases Created: ${metrics.totalLeases}\n`;
    report += `  Average Lease Time: ${(metrics.averageLeaseTime / 1000).toFixed(2)}s ${this.getStatusIndicator(metrics.averageLeaseTime, this.thresholds.maxAverageLeaseTime)}\n`;
    report += `  Connection Turnover: ${metrics.connectionTurnover || 0}\n\n`;

    // Enhanced Query Performance
    report += '🚀 QUERY PERFORMANCE\n';
    report += `  Total Queries: ${metrics.totalQueriesExecuted}\n`;
    report += `  Average Query Time: ${(metrics.averageQueryTime || 0).toFixed(2)}ms\n`;
    report += `  Slow Queries: ${metrics.slowQueries || 0}/${this.thresholds.maxSlowQueries} ${this.getStatusIndicator(metrics.slowQueries || 0, this.thresholds.maxSlowQueries)}\n`;
    report += `  Deadlocks: ${metrics.deadlockCount || 0}/${this.thresholds.maxDeadlocks} ${this.getStatusIndicator(metrics.deadlockCount || 0, this.thresholds.maxDeadlocks)}\n`;
    report += `  Transaction Timeouts: ${metrics.transactionTimeouts || 0}/${this.thresholds.maxTransactionTimeouts} ${this.getStatusIndicator(metrics.transactionTimeouts || 0, this.thresholds.maxTransactionTimeouts)}\n\n`;

    // Error Tracking
    report += '🚨 ERROR TRACKING\n';
    report += `  Connection Errors: ${metrics.connectionErrors}/${this.thresholds.maxConnectionErrors} ${this.getStatusIndicator(metrics.connectionErrors, this.thresholds.maxConnectionErrors)}\n`;
    report += `  Failed Connection Attempts: ${metrics.failedConnectionAttempts || 0}\n`;
    report += `  Security Violations: ${metrics.securityViolations || 0}/${this.thresholds.maxSecurityViolations} ${this.getStatusIndicator(metrics.securityViolations || 0, this.thresholds.maxSecurityViolations)}\n`;
    report += `  Resource Leaks: ${metrics.resourceLeaks || 0}\n`;
    if (metrics.lastError) {
      report += `  Last Error: ${metrics.lastError.message}\n`;
    }
    report += '\n';

    // Memory Usage
    if (metrics.memoryUsage) {
      const heapUsedMB = (metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
      const heapTotalMB = (metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
      report += '💾 MEMORY USAGE\n';
      report += `  Heap Used: ${heapUsedMB}MB/${this.thresholds.maxMemoryUsageMB}MB ${this.getStatusIndicator(parseFloat(heapUsedMB), this.thresholds.maxMemoryUsageMB)}\n`;
      report += `  Heap Total: ${heapTotalMB}MB\n`;
      report += `  External: ${(metrics.memoryUsage.external / 1024 / 1024).toFixed(2)}MB\n\n`;
    }

    if (includeDetails) {
      // Active Leases Details (limited to prevent report bloat)
      if (activeLeases.length > 0) {
        report += `📋 ACTIVE LEASES (${activeLeases.length})\n`;
        const displayLeases = activeLeases.slice(0, 10); // Limit to 10 most recent
        displayLeases.forEach((lease, index) => {
          const age = (Date.now() - lease.acquiredAt.getTime()) / 1000;
          const lastUsed = (Date.now() - lease.lastUsedAt.getTime()) / 1000;
          const warningFlag = lease.warningCount > 0 ? ' ⚠️' : '';
          const transactionFlag = lease.hasActiveTransaction ? ' 🔄' : '';
          report += `  ${index + 1}. ${lease.testFile}:${lease.testName}${warningFlag}${transactionFlag}\n`;
          report += `     ID: ${lease.id.substring(0, 12)}... | Age: ${age.toFixed(1)}s | Queries: ${lease.queryCount}\n`;
        });
        if (activeLeases.length > 10) {
          report += `     ... and ${activeLeases.length - 10} more\n`;
        }
        report += '\n';
      }

      // Active Alerts
      const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
      if (activeAlerts.length > 0) {
        report += `🚨 ACTIVE ALERTS (${activeAlerts.length})\n`;
        const sortedAlerts = activeAlerts.sort((a, b) => {
          const severityOrder = { critical: 4, error: 3, warning: 2, info: 1 };
          return severityOrder[b.level] - severityOrder[a.level];
        });
        
        sortedAlerts.slice(0, 5).forEach((alert) => {
          const emoji = this.getAlertEmoji(alert.level);
          const duration = this.formatDuration(Date.now() - alert.firstOccurred.getTime());
          report += `  ${emoji} [${alert.level.toUpperCase()}] ${alert.message}\n`;
          report += `     Metric: ${alert.metric} | Value: ${alert.value} | Threshold: ${alert.threshold}\n`;
          report += `     Duration: ${duration} | Frequency: ${alert.frequency}\n`;
        });
        report += '\n';
      }

      // Performance Trends
      const trends = this.calculateTrends();
      if (trends) {
        report += '📈 PERFORMANCE TRENDS (Last 20 measurements)\n';
        report += `  Connection Usage: ${trends.connectionTrend}\n`;
        report += `  Lease Duration: ${trends.leaseTrend}\n`;
        report += `  Query Performance: ${trends.queryTrend}\n`;
        report += `  Error Rate: ${trends.errorTrend}\n`;
        report += `  Memory Usage: ${trends.memoryTrend}\n\n`;
      }
    }

    report += '═'.repeat(70) + '\n';
    
    // Cache the report
    this.reportCache = report;
    this.lastReportTime = Date.now();
    
    return report;
  }
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  private getOverallHealthStatus(metrics: PoolMetrics): {
    status: string;
    indicator: string;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (metrics.connectionErrors >= this.thresholds.maxConnectionErrors) {
      issues.push('High connection errors');
    }
    if (metrics.waitingClients > this.thresholds.maxWaitingClients) {
      issues.push('Clients waiting');
    }
    if (metrics.activeConnections >= this.thresholds.maxActiveConnections) {
      issues.push('High connection usage');
    }
    if (metrics.slowQueries && metrics.slowQueries >= this.thresholds.maxSlowQueries) {
      issues.push('Many slow queries');
    }
    if (metrics.securityViolations && metrics.securityViolations > 0) {
      issues.push('Security violations');
    }
    
    if (issues.length === 0) {
      return { status: 'HEALTHY', indicator: '🟢', issues: [] };
    } else if (issues.length <= 2) {
      return { status: 'DEGRADED', indicator: '🟡', issues };
    } else {
      return { status: 'CRITICAL', indicator: '🔴', issues };
    }
  }
  
  private getIdleStatus(idleConnections: number): string {
    if (idleConnections < this.thresholds.minIdleConnections) {
      return '⚠️';
    }
    return '✅';
  }
  
  private getAlertEmoji(level: string): string {
    switch (level) {
      case 'critical': return '🔥';
      case 'error': return '🚨';
      case 'warning': return '⚠️';
      case 'info': return '💡';
      default: return '📊';
    }
  }

  private getStatusIndicator(value: number, threshold: number): string {
    if (value >= threshold) return '🚨';
    if (value >= threshold * 0.8) return '⚠️';
    return '✅';
  }

  private checkThresholds(metrics: PoolMetrics): void {
    const checks = [
      {
        metric: 'activeConnections',
        value: metrics.activeConnections,
        threshold: this.thresholds.maxActiveConnections,
        message: 'High number of active connections',
        critical: true
      },
      {
        metric: 'waitingClients',
        value: metrics.waitingClients,
        threshold: this.thresholds.maxWaitingClients,
        message: 'Clients waiting for connections',
        critical: true
      },
      {
        metric: 'averageLeaseTime',
        value: metrics.averageLeaseTime,
        threshold: this.thresholds.maxAverageLeaseTime,
        message: 'Long average lease time detected',
        critical: false
      },
      {
        metric: 'connectionErrors',
        value: metrics.connectionErrors,
        threshold: this.thresholds.maxConnectionErrors,
        message: 'High connection error rate',
        critical: true
      },
      {
        metric: 'acquiredLeases',
        value: metrics.acquiredLeases,
        threshold: this.thresholds.maxLeaseCount,
        message: 'High number of active leases',
        critical: false
      },
      // Enhanced threshold checks
      {
        metric: 'slowQueries',
        value: metrics.slowQueries || 0,
        threshold: this.thresholds.maxSlowQueries,
        message: 'Too many slow queries detected',
        critical: false
      },
      {
        metric: 'deadlockCount',
        value: metrics.deadlockCount || 0,
        threshold: this.thresholds.maxDeadlocks,
        message: 'Database deadlocks detected',
        critical: true
      },
      {
        metric: 'transactionTimeouts',
        value: metrics.transactionTimeouts || 0,
        threshold: this.thresholds.maxTransactionTimeouts,
        message: 'Transaction timeouts detected',
        critical: false
      },
      {
        metric: 'securityViolations',
        value: metrics.securityViolations || 0,
        threshold: this.thresholds.maxSecurityViolations,
        message: 'Security violations detected',
        critical: true
      }
    ];

    // Check memory usage if available
    if (metrics.memoryUsage) {
      const heapUsedMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
      checks.push({
        metric: 'memoryUsage',
        value: heapUsedMB,
        threshold: this.thresholds.maxMemoryUsageMB,
        message: 'High memory usage detected',
        critical: false
      });
    }

    // Check idle connections (reverse threshold)
    if (metrics.idleConnections < this.thresholds.minIdleConnections) {
      this.addAlert('warning', 'Low idle connection count', 'idleConnections', metrics.idleConnections, this.thresholds.minIdleConnections);
    }

    for (const check of checks) {
      if (check.value >= check.threshold) {
        const level = check.critical ? 'critical' : 'error';
        this.addAlert(level, check.message, check.metric, check.value, check.threshold);
      } else if (check.value >= check.threshold * 0.8) {
        this.addAlert('warning', check.message, check.metric, check.value, check.threshold);
      } else if (check.value >= check.threshold * 0.6) {
        this.addAlert('info', `Approaching threshold: ${check.message}`, check.metric, check.value, check.threshold);
      }
    }
  }

  private addAlert(level: 'warning' | 'error' | 'info' | 'critical', message: string, metric: string, value: number, threshold: number): void {
    const alertKey = `${metric}_${level}`;
    const now = new Date();
    
    // Check if this alert already exists
    if (this.alerts.has(alertKey)) {
      const existingAlert = this.alerts.get(alertKey)!;
      existingAlert.frequency++;
      existingAlert.value = value;
      existingAlert.timestamp = now;
    } else {
      const alert: MetricsAlert = {
        id: this.generateAlertId(),
        level,
        message,
        metric,
        value,
        threshold,
        timestamp: now,
        acknowledged: false,
        frequency: 1,
        firstOccurred: now
      };

      this.alerts.set(alertKey, alert);
      
      // Add to history
      this.alertHistory.push({ ...alert });
      
      // Emit alert event
      this.emit('alert', alert);
    }
    
    // Keep alert history manageable
    if (this.alertHistory.length > this.maxAlertHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxAlertHistorySize);
    }

    // Log critical alerts immediately
    const alert = this.alerts.get(alertKey)!;
    if (level === 'critical') {
      console.error(`🔥 CRITICAL POOL ALERT: ${message} (${metric}: ${value}/${threshold}) [Frequency: ${alert.frequency}]`);
    } else if (level === 'error') {
      console.error(`🚨 POOL ERROR: ${message} (${metric}: ${value}/${threshold}) [Frequency: ${alert.frequency}]`);
    } else if (level === 'warning') {
      console.warn(`⚠️ POOL WARNING: ${message} (${metric}: ${value}/${threshold}) [Frequency: ${alert.frequency}]`);
    }
  }
  
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private storeMetrics(metrics: PoolMetrics): void {
    // Add timestamp to metrics
    const timestampedMetrics = {
      ...metrics,
      timestamp: Date.now()
    };
    
    this.metricsHistory.push(timestampedMetrics);
    
    // Keep configurable history size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
    
    // Emit metrics event for external monitoring
    this.emit('metricsUpdate', timestampedMetrics);
  }

  private getRecentAlerts(count: number): MetricsAlert[] {
    return this.alertHistory
      .slice(-count)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private calculateTrends(): {
    connectionTrend: string;
    leaseTrend: string;
    errorTrend: string;
    queryTrend: string;
    memoryTrend: string;
  } | null {
    if (this.metricsHistory.length < 4) return null;

    const recent = this.metricsHistory.slice(-20); // Use more data points for better trends
    const mid = Math.floor(recent.length / 2);
    const first = recent.slice(0, mid);
    const second = recent.slice(mid);

    const avgConnections1 = first.reduce((sum, m) => sum + m.activeConnections, 0) / first.length;
    const avgConnections2 = second.reduce((sum, m) => sum + m.activeConnections, 0) / second.length;
    
    const avgLease1 = first.reduce((sum, m) => sum + m.averageLeaseTime, 0) / first.length;
    const avgLease2 = second.reduce((sum, m) => sum + m.averageLeaseTime, 0) / second.length;
    
    const avgErrors1 = first.reduce((sum, m) => sum + m.connectionErrors, 0) / first.length;
    const avgErrors2 = second.reduce((sum, m) => sum + m.connectionErrors, 0) / second.length;
    
    const avgQuery1 = first.reduce((sum, m) => sum + (m.averageQueryTime || 0), 0) / first.length;
    const avgQuery2 = second.reduce((sum, m) => sum + (m.averageQueryTime || 0), 0) / second.length;
    
    const avgMemory1 = first.reduce((sum, m) => sum + (m.memoryUsage?.heapUsed || 0), 0) / first.length;
    const avgMemory2 = second.reduce((sum, m) => sum + (m.memoryUsage?.heapUsed || 0), 0) / second.length;

    return {
      connectionTrend: this.getTrendIndicator(avgConnections1, avgConnections2),
      leaseTrend: this.getTrendIndicator(avgLease1, avgLease2),
      errorTrend: this.getTrendIndicator(avgErrors1, avgErrors2),
      queryTrend: this.getTrendIndicator(avgQuery1, avgQuery2),
      memoryTrend: this.getTrendIndicator(avgMemory1, avgMemory2)
    };
  }

  private getTrendIndicator(before: number, after: number): string {
    if (before === 0 && after === 0) {
      return '➡️ Stable (0)';
    }
    
    const change = after - before;
    const percentChange = before > 0 ? (change / before) * 100 : (after > 0 ? 100 : 0);

    if (Math.abs(percentChange) < 5) {
      return '➡️ Stable';
    } else if (change > 0) {
      const emoji = percentChange > 20 ? '🚀' : '📈';
      return `${emoji} Increasing (+${percentChange.toFixed(1)}%)`;
    } else {
      const emoji = percentChange < -20 ? '📉' : '📉';
      return `${emoji} Decreasing (${percentChange.toFixed(1)}%)`;
    }
  }

  getAlerts(): MetricsAlert[] {
    return Array.from(this.alerts.values());
  }
  
  getAlertHistory(): MetricsAlert[] {
    return [...this.alertHistory];
  }
  
  acknowledgeAlert(alertId: string): boolean {
    for (const alert of this.alerts.values()) {
      if (alert.id === alertId) {
        alert.acknowledged = true;
        alert.resolvedAt = new Date();
        this.emit('alertAcknowledged', alert);
        return true;
      }
    }
    return false;
  }
  
  clearResolvedAlerts(): number {
    const initialSize = this.alerts.size;
    const unresolvedAlerts = new Map();
    
    for (const [key, alert] of this.alerts) {
      if (!alert.acknowledged) {
        unresolvedAlerts.set(key, alert);
      }
    }
    
    this.alerts = unresolvedAlerts;
    const clearedCount = initialSize - this.alerts.size;
    
    if (clearedCount > 0) {
      this.emit('alertsCleared', clearedCount);
    }
    
    return clearedCount;
  }

  clearAlerts(): void {
    const clearedCount = this.alerts.size;
    this.alerts.clear();
    
    if (clearedCount > 0) {
      this.emit('alertsCleared', clearedCount);
    }
  }

  exportMetrics(): {
    current: PoolMetrics | null;
    history: PoolMetrics[];
    alerts: MetricsAlert[];
    alertHistory: MetricsAlert[];
    thresholds: MetricsThresholds;
    summary: {
      totalAlerts: number;
      criticalAlerts: number;
      acknowledgedAlerts: number;
      uptimeHours: number;
    };
  } {
    const current = TestDatabaseHelpers.getPoolMetrics();
    const alerts = Array.from(this.alerts.values());
    
    return {
      current,
      history: [...this.metricsHistory],
      alerts,
      alertHistory: [...this.alertHistory],
      thresholds: { ...this.thresholds },
      summary: {
        totalAlerts: this.alertHistory.length,
        criticalAlerts: alerts.filter(a => a.level === 'critical').length,
        acknowledgedAlerts: alerts.filter(a => a.acknowledged).length,
        uptimeHours: current ? current.uptimeMs / (1000 * 60 * 60) : 0
      }
    };
  }

  async logPerformanceReport(includeDetails = true): Promise<void> {
    try {
      const report = this.generateReport(includeDetails);
      console.log(report);

      // Check if health check passes
      const healthOk = await TestDatabaseHelpers.performHealthCheck();
      if (!healthOk) {
        console.error('🚨 Database health check failed!');
        this.addAlert('critical', 'Database health check failed', 'healthCheck', 0, 1);
      }
      
      // Auto-clear old resolved alerts
      const clearedCount = this.clearResolvedAlerts();
      if (clearedCount > 0) {
        console.log(`🧹 Cleared ${clearedCount} resolved alerts`);
      }
      
    } catch (error) {
      console.error('Error generating performance report:', error);
      this.addAlert('error', 'Failed to generate performance report', 'reporting', 1, 0);
    }
  }
  
  startMonitoring(intervalMs = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }
    
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = TestDatabaseHelpers.getPoolMetrics();
        if (metrics) {
          this.checkThresholds(metrics);
          this.storeMetrics(metrics);
        }
      } catch (error) {
        console.error('Error during periodic monitoring:', error);
      }
    }, intervalMs);
    
    console.log(`🔍 Started pool monitoring (interval: ${intervalMs}ms)`);
  }
  
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('🚫 Stopped pool monitoring');
    }
  }
  
  destroy(): void {
    this.stopMonitoring();
    this.clearAlerts();
    this.metricsHistory.length = 0;
    this.alertHistory.length = 0;
    this.removeAllListeners();
  }
}

// Global dashboard instance
export const poolMetricsDashboard = new PoolMetricsDashboard();

// Enhanced convenience functions
export function logPoolMetrics(includeDetails = true): void {
  poolMetricsDashboard.logPerformanceReport(includeDetails);
}

export function getQuickHealthCheck(): {
  status: 'healthy' | 'degraded' | 'critical';
  activeAlerts: number;
  connectionUsage: string;
} {
  const metrics = TestDatabaseHelpers.getPoolMetrics();
  const alerts = poolMetricsDashboard.getAlerts().filter(a => !a.acknowledged);
  
  if (!metrics) {
    return {
      status: 'critical',
      activeAlerts: 0,
      connectionUsage: 'Unknown'
    };
  }
  
  const criticalAlerts = alerts.filter(a => a.level === 'critical').length;
  const errorAlerts = alerts.filter(a => a.level === 'error').length;
  
  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (criticalAlerts > 0) {
    status = 'critical';
  } else if (errorAlerts > 0 || alerts.length > 3) {
    status = 'degraded';
  }
  
  return {
    status,
    activeAlerts: alerts.length,
    connectionUsage: `${metrics.activeConnections}/${metrics.totalConnections}`
  };
}

// Function to setup periodic metrics logging during tests
export function setupPeriodicMetricsLogging(intervalMs: number = 30000): () => void {
  poolMetricsDashboard.startMonitoring(intervalMs);
  
  const reportInterval = setInterval(() => {
    poolMetricsDashboard.logPerformanceReport(false); // Brief reports during monitoring
  }, intervalMs * 2); // Less frequent detailed reports

  return () => {
    poolMetricsDashboard.stopMonitoring();
    clearInterval(reportInterval);
  };
}

// Enhanced monitoring setup for test environments
export function setupTestMonitoring(): {
  dashboard: PoolMetricsDashboard;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  getReport: (detailed?: boolean) => string;
  getHealthStatus: () => string;
} {
  return {
    dashboard: poolMetricsDashboard,
    startMonitoring: () => poolMetricsDashboard.startMonitoring(15000), // More frequent for tests
    stopMonitoring: () => poolMetricsDashboard.stopMonitoring(),
    getReport: (detailed = false) => poolMetricsDashboard.generateReport(detailed),
    getHealthStatus: () => {
      const health = getQuickHealthCheck();
      return `${health.status.toUpperCase()} (${health.activeAlerts} alerts, ${health.connectionUsage} connections)`;
    }
  };
}