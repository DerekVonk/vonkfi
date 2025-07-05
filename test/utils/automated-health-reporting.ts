import { ComprehensiveHealthCheck, HealthCheckResult } from './comprehensive-health-check';
import { TestConnectionPoolManager } from './connection-pool-manager';
import { getRecoverySystem } from './connection-recovery-system';
import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface HealthReport {
  id: string;
  timestamp: string;
  environment: string;
  overall_status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  components: {
    database: ComponentHealth;
    connection_pool: ComponentHealth;
    recovery_system: ComponentHealth;
    containers: ComponentHealth;
    performance: ComponentHealth;
  };
  metrics: {
    response_times: ResponseTimeMetrics;
    resource_usage: ResourceUsageMetrics;
    error_rates: ErrorRateMetrics;
    availability: AvailabilityMetrics;
  };
  alerts: Alert[];
  recommendations: Recommendation[];
  trends: TrendAnalysis;
  summary: string;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number; // 0-100
  response_time: number;
  last_error?: string;
  uptime: number;
  details: Record<string, any>;
}

export interface ResponseTimeMetrics {
  database_connection: number;
  health_check: number;
  test_execution: number;
  container_startup: number;
}

export interface ResourceUsageMetrics {
  memory_usage_percent: number;
  cpu_usage_percent: number;
  disk_usage_percent: number;
  connection_pool_utilization: number;
}

export interface ErrorRateMetrics {
  connection_errors: number;
  test_failures: number;
  timeout_errors: number;
  recovery_actions: number;
}

export interface AvailabilityMetrics {
  uptime_percent: number;
  database_availability: number;
  container_availability: number;
  service_availability: number;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  component: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_reason?: string;
  details?: Record<string, any>;
  count?: number; // For aggregated alerts
  first_occurrence?: string;
  last_occurrence?: string;
}

export interface Recommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'performance' | 'reliability' | 'security' | 'maintenance';
  action: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface TrendAnalysis {
  performance_trend: 'improving' | 'stable' | 'degrading';
  reliability_trend: 'improving' | 'stable' | 'degrading';
  error_trend: 'improving' | 'stable' | 'degrading';
  capacity_trend: 'improving' | 'stable' | 'degrading';
}

export class AutomatedHealthReportingSystem extends EventEmitter {
  private healthCheck: ComprehensiveHealthCheck;
  private poolManager?: TestConnectionPoolManager;
  private reportHistory: HealthReport[] = [];
  private alerts: Map<string, Alert> = new Map();
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private config: HealthReportingConfig;
  private metricsHistory: any[] = [];
  private readonly reportsDir = './logs/health-reports';

  constructor(config: HealthReportingConfig) {
    super();
    this.config = {
      interval: 30000, // 30 seconds
      retentionDays: 7,
      enableTrends: true,
      enableAlerts: true,
      alertThresholds: {
        criticalMemoryUsage: 90,
        criticalErrorRate: 10,
        warningResponseTime: 2000,
        criticalResponseTime: 5000
      },
      ...config
    };

    this.healthCheck = new ComprehensiveHealthCheck({
      dbConfig: config.dbConfig,
      timeoutMs: 10000,
      includeRedis: config.includeRedis || false
    });

    // Ensure reports directory exists
    if (!existsSync(this.reportsDir)) {
      mkdirSync(this.reportsDir, { recursive: true });
    }

    this.loadHistoricalData();
  }

  setPoolManager(poolManager: TestConnectionPoolManager): void {
    this.poolManager = poolManager;
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('Health monitoring already running');
      return;
    }

    console.log(`🏥 Starting automated health monitoring (interval: ${this.config.interval}ms)`);
    
    this.isMonitoring = true;
    
    // Initial health check
    await this.performHealthCheck();
    
    // Schedule periodic checks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error);
        this.emit('error', error);
      }
    }, this.config.interval);

    this.emit('monitoring_started');
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    console.log('🛑 Stopping health monitoring');
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Generate final report
    await this.generateComprehensiveReport();
    
    this.emit('monitoring_stopped');
  }

  async performHealthCheck(): Promise<HealthReport> {
    const startTime = Date.now();
    const reportId = this.generateReportId();
    
    console.log(`🔍 Performing health check: ${reportId}`);
    
    try {
      // Perform comprehensive health check
      const healthResult = await this.healthCheck.performHealthCheck();
      
      // Gather additional metrics
      const additionalMetrics = await this.gatherAdditionalMetrics();
      
      // Generate health report with enhanced error handling
      const report = await this.generateHealthReport(reportId, healthResult, additionalMetrics);
      
      // Store report with backup mechanism
      await this.storeReportSafely(report);
      
      // Check for alerts
      if (this.config.enableAlerts) {
        this.processAlerts(report);
      }
      
      // Emit events
      this.emit('health_check_completed', report);
      
      if (report.overall_status === 'critical' || report.overall_status === 'unhealthy') {
        this.emit('health_degraded', report);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ Health check completed in ${duration}ms - Status: ${report.overall_status}`);
      
      return report;
      
    } catch (error) {
      console.error('Health check failed:', error);
      
      // Generate error report
      const errorReport = this.generateErrorReport(reportId, error as Error);
      this.storeReport(errorReport);
      
      this.emit('health_check_failed', error);
      return errorReport;
    }
  }

  private async gatherAdditionalMetrics(): Promise<any> {
    const metrics: any = {
      system: await this.safeMetricsCall('system', () => this.getSystemMetrics()),
      containers: await this.safeMetricsCall('containers', () => this.getContainerMetrics()),
      performance: await this.safeMetricsCall('performance', () => this.getPerformanceMetrics()),
      network: await this.safeMetricsCall('network', () => this.getNetworkMetrics()),
      disk: await this.safeMetricsCall('disk', () => this.getDiskMetrics()),
      process: await this.safeMetricsCall('process', () => this.getProcessMetrics())
    };

    if (this.poolManager) {
      try {
        metrics.connectionPool = this.poolManager.getMetrics();
        metrics.poolStatistics = this.poolManager.getConnectionStatistics();
      } catch (error) {
        console.warn('Failed to get connection pool metrics:', error.message);
        metrics.connectionPool = { error: error.message, available: false };
      }
    } else {
      metrics.connectionPool = { error: 'Pool manager not available', available: false };
    }

    const recoverySystem = getRecoverySystem();
    if (recoverySystem) {
      try {
        metrics.recovery = recoverySystem.getRecoveryStatus();
      } catch (error) {
        console.warn('Failed to get recovery system status:', error.message);
        metrics.recovery = { error: error.message, available: false };
      }
    } else {
      metrics.recovery = { status: 'not_initialized', available: false };
    }

    return metrics;
  }

  private async safeMetricsCall<T>(metricName: string, fn: () => Promise<T>): Promise<T | { error: string; available: false }> {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Failed to gather ${metricName} metrics:`, error.message);
      return { error: error.message, available: false };
    }
  }

  private async getSystemMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        usage_percent: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  private async getContainerMetrics(): Promise<any> {
    try {
      // Check Docker container status
      const { execSync } = require('child_process');
      
      const containerStatus = execSync(
        'docker-compose -f docker-compose.test.yml ps --format json',
        { encoding: 'utf8', timeout: 5000 }
      );
      
      const containers = containerStatus.trim().split('\n').map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      return {
        total: containers.length,
        running: containers.filter(c => c.State === 'running').length,
        healthy: containers.filter(c => c.Health === 'healthy').length,
        containers: containers.map(c => ({
          name: c.Service,
          state: c.State,
          health: c.Health,
          ports: c.Ports
        }))
      };
    } catch (error) {
      return {
        error: 'Unable to get container metrics',
        details: error.message
      };
    }
  }

  private async getPerformanceMetrics(): Promise<any> {
    // Gather performance-related metrics
    return {
      event_loop_delay: await this.measureEventLoopDelay(),
      gc_stats: this.getGCStats(),
      active_handles: process._getActiveHandles().length,
      active_requests: process._getActiveRequests().length
    };
  }

  private async measureEventLoopDelay(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const delta = process.hrtime.bigint() - start;
        resolve(Number(delta) / 1000000); // Convert to milliseconds
      });
    });
  }

  private getGCStats(): any {
    try {
      const v8 = require('v8');
      const stats = v8.getHeapStatistics();
      return {
        total_heap_size: stats.total_heap_size,
        used_heap_size: stats.used_heap_size,
        heap_size_limit: stats.heap_size_limit,
        total_physical_size: stats.total_physical_size
      };
    } catch {
      return { error: 'GC stats unavailable' };
    }
  }

  private async generateHealthReport(
    id: string, 
    healthResult: HealthCheckResult, 
    additionalMetrics: any
  ): Promise<HealthReport> {
    const timestamp = new Date().toISOString();
    
    // Assess component health
    const components = this.assessComponentHealth(healthResult, additionalMetrics);
    
    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(components);
    
    // Generate metrics summary
    const metrics = this.generateMetricsSummary(healthResult, additionalMetrics);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(components, metrics);
    
    // Analyze trends
    const trends = this.analyzeTrends();
    
    const report: HealthReport = {
      id,
      timestamp,
      environment: process.env.NODE_ENV || 'unknown',
      overall_status: overallStatus,
      components,
      metrics,
      alerts: Array.from(this.alerts.values()).filter(alert => !alert.resolved),
      recommendations,
      trends,
      summary: this.generateSummary(overallStatus, components, metrics)
    };

    return report;
  }

  private assessComponentHealth(healthResult: HealthCheckResult, metrics: any): HealthReport['components'] {
    return {
      database: this.assessDatabaseHealth(healthResult, metrics),
      connection_pool: this.assessConnectionPoolHealth(metrics),
      recovery_system: this.assessRecoverySystemHealth(metrics),
      containers: this.assessContainerHealth(metrics),
      performance: this.assessPerformanceHealth(metrics)
    };
  }

  private assessDatabaseHealth(healthResult: HealthCheckResult, metrics: any): ComponentHealth {
    const dbCheck = healthResult.checks.database;
    const score = dbCheck.status === 'healthy' ? 100 : 
                  dbCheck.status === 'degraded' ? 60 : 0;
    
    return {
      status: dbCheck.status,
      score,
      response_time: dbCheck.responseTime,
      last_error: dbCheck.status !== 'healthy' ? dbCheck.details : undefined,
      uptime: metrics.system?.uptime || 0,
      details: {
        connectivity: dbCheck.status,
        response_time: dbCheck.responseTime,
        migrations: healthResult.checks.migrations.status,
        pool_connections: healthResult.checks.connectivity.poolConnections
      }
    };
  }

  private assessConnectionPoolHealth(metrics: any): ComponentHealth {
    const poolMetrics = metrics.connectionPool;
    if (!poolMetrics) {
      return {
        status: 'unhealthy',
        score: 0,
        response_time: 0,
        uptime: 0,
        details: { error: 'Pool metrics unavailable' }
      };
    }
    
    const utilization = poolMetrics.activeConnections / poolMetrics.totalConnections;
    const hasErrors = poolMetrics.connectionErrors > 0;
    
    let status: ComponentHealth['status'] = 'healthy';
    let score = 100;
    
    if (utilization > 0.9 || hasErrors) {
      status = 'degraded';
      score = 60;
    }
    
    if (utilization > 0.95 || poolMetrics.connectionErrors > 10) {
      status = 'unhealthy';
      score = 20;
    }
    
    return {
      status,
      score,
      response_time: poolMetrics.averageLeaseTime,
      uptime: poolMetrics.uptimeMs,
      details: {
        total_connections: poolMetrics.totalConnections,
        active_connections: poolMetrics.activeConnections,
        utilization: Math.round(utilization * 100),
        connection_errors: poolMetrics.connectionErrors,
        waiting_clients: poolMetrics.waitingClients
      }
    };
  }

  private assessRecoverySystemHealth(metrics: any): ComponentHealth {
    const recovery = metrics.recovery;
    if (!recovery) {
      return {
        status: 'healthy',
        score: 100,
        response_time: 0,
        uptime: 0,
        details: { status: 'not_initialized' }
      };
    }
    
    let status: ComponentHealth['status'] = 'healthy';
    let score = 100;
    
    if (recovery.emergencyMode) {
      status = 'critical';
      score = 10;
    } else if (recovery.healthStatus === 'degraded') {
      status = 'degraded';
      score = 60;
    } else if (recovery.healthStatus === 'circuit_breaker_open') {
      status = 'unhealthy';
      score = 30;
    }
    
    return {
      status,
      score,
      response_time: 0,
      uptime: 0,
      details: {
        health_status: recovery.healthStatus,
        emergency_mode: recovery.emergencyMode,
        circuit_breaker: recovery.circuitBreaker.state,
        recent_actions: recovery.recentActions.length,
        patterns_detected: recovery.patterns.length
      }
    };
  }

  private assessContainerHealth(metrics: any): ComponentHealth {
    const containers = metrics.containers;
    if (containers.error) {
      return {
        status: 'unhealthy',
        score: 0,
        response_time: 0,
        uptime: 0,
        details: { error: containers.error }
      };
    }
    
    const healthyRatio = containers.healthy / containers.total;
    const runningRatio = containers.running / containers.total;
    
    let status: ComponentHealth['status'] = 'healthy';
    let score = Math.round(healthyRatio * 100);
    
    if (runningRatio < 1.0) {
      status = 'degraded';
      score = Math.round(runningRatio * 80);
    }
    
    if (runningRatio < 0.5) {
      status = 'unhealthy';
      score = Math.round(runningRatio * 50);
    }
    
    return {
      status,
      score,
      response_time: 0,
      uptime: 0,
      details: {
        total: containers.total,
        running: containers.running,
        healthy: containers.healthy,
        containers: containers.containers
      }
    };
  }

  private assessPerformanceHealth(metrics: any): ComponentHealth {
    const system = metrics.system;
    const performance = metrics.performance;
    
    const memoryUsage = system.memory.usage_percent;
    const eventLoopDelay = performance.event_loop_delay;
    
    let status: ComponentHealth['status'] = 'healthy';
    let score = 100;
    
    if (memoryUsage > 80 || eventLoopDelay > 50) {
      status = 'degraded';
      score = 70;
    }
    
    if (memoryUsage > 90 || eventLoopDelay > 100) {
      status = 'unhealthy';
      score = 40;
    }
    
    return {
      status,
      score,
      response_time: eventLoopDelay,
      uptime: system.uptime,
      details: {
        memory_usage_percent: memoryUsage,
        event_loop_delay: eventLoopDelay,
        active_handles: performance.active_handles,
        active_requests: performance.active_requests,
        gc_stats: performance.gc_stats
      }
    };
  }

  private calculateOverallStatus(components: HealthReport['components']): HealthReport['overall_status'] {
    const statuses = Object.values(components).map(c => c.status);
    
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('unhealthy')) return 'unhealthy';
    if (statuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }

  private generateMetricsSummary(healthResult: HealthCheckResult, metrics: any): HealthReport['metrics'] {
    return {
      response_times: {
        database_connection: healthResult.checks.database.responseTime,
        health_check: healthResult.duration,
        test_execution: 0, // Would be populated from test metrics
        container_startup: 0 // Would be populated from container metrics
      },
      resource_usage: {
        memory_usage_percent: metrics.system.memory.usage_percent,
        cpu_usage_percent: 0, // Would need additional monitoring
        disk_usage_percent: 0, // Would need additional monitoring
        connection_pool_utilization: metrics.connectionPool ? 
          (metrics.connectionPool.activeConnections / metrics.connectionPool.totalConnections) * 100 : 0
      },
      error_rates: {
        connection_errors: metrics.connectionPool?.connectionErrors || 0,
        test_failures: 0, // Would be populated from test results
        timeout_errors: 0, // Would be tracked separately
        recovery_actions: metrics.recovery?.recentActions.length || 0
      },
      availability: {
        uptime_percent: 100, // Would be calculated from uptime tracking
        database_availability: healthResult.checks.database.status === 'healthy' ? 100 : 0,
        container_availability: metrics.containers.error ? 0 : 
          (metrics.containers.running / metrics.containers.total) * 100,
        service_availability: 100 // Would be calculated from service monitoring
      }
    };
  }

  private generateRecommendations(components: HealthReport['components'], metrics: HealthReport['metrics']): Recommendation[] {
    const recommendations: Recommendation[] = [];
    
    // Memory usage recommendations
    if (metrics.resource_usage.memory_usage_percent > 80) {
      recommendations.push({
        priority: metrics.resource_usage.memory_usage_percent > 90 ? 'critical' : 'high',
        category: 'performance',
        action: 'Optimize memory usage - consider reducing connection pool size or enabling garbage collection',
        impact: 'Prevent out-of-memory errors and improve test stability',
        effort: 'medium'
      });
    }
    
    // Connection pool recommendations
    if (metrics.resource_usage.connection_pool_utilization > 80) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        action: 'Increase connection pool size or optimize connection usage patterns',
        impact: 'Reduce connection wait times and improve test performance',
        effort: 'low'
      });
    }
    
    // Error rate recommendations
    if (metrics.error_rates.connection_errors > 5) {
      recommendations.push({
        priority: 'high',
        category: 'reliability',
        action: 'Investigate connection errors and improve error handling',
        impact: 'Reduce test failures and improve reliability',
        effort: 'medium'
      });
    }
    
    // Container health recommendations
    if (components.containers.status !== 'healthy') {
      recommendations.push({
        priority: 'high',
        category: 'reliability',
        action: 'Check container health and restart unhealthy containers',
        impact: 'Ensure all test infrastructure components are operational',
        effort: 'low'
      });
    }
    
    // Recovery system recommendations
    if (components.recovery_system.status === 'critical') {
      recommendations.push({
        priority: 'critical',
        category: 'reliability',
        action: 'Address emergency mode conditions and reset recovery system',
        impact: 'Restore normal test infrastructure operation',
        effort: 'high'
      });
    }
    
    return recommendations;
  }

  private analyzeTrends(): TrendAnalysis {
    if (this.reportHistory.length < 5) {
      return {
        performance_trend: 'stable',
        reliability_trend: 'stable',
        error_trend: 'stable',
        capacity_trend: 'stable'
      };
    }
    
    const recent = this.reportHistory.slice(-5);
    const earlier = this.reportHistory.slice(-10, -5);
    
    return {
      performance_trend: this.calculateTrend(
        recent.map(r => r.metrics.response_times.health_check),
        earlier.map(r => r.metrics.response_times.health_check)
      ),
      reliability_trend: this.calculateTrend(
        recent.map(r => Object.values(r.components).reduce((acc, c) => acc + c.score, 0)),
        earlier.map(r => Object.values(r.components).reduce((acc, c) => acc + c.score, 0))
      ),
      error_trend: this.calculateTrend(
        recent.map(r => r.metrics.error_rates.connection_errors),
        earlier.map(r => r.metrics.error_rates.connection_errors),
        true // Inverse trend for errors
      ),
      capacity_trend: this.calculateTrend(
        recent.map(r => r.metrics.resource_usage.memory_usage_percent),
        earlier.map(r => r.metrics.resource_usage.memory_usage_percent),
        true // Inverse trend for resource usage
      )
    };
  }

  private calculateTrend(recent: number[], earlier: number[], inverse = false): 'improving' | 'stable' | 'degrading' {
    if (recent.length === 0 || earlier.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    const change = (recentAvg - earlierAvg) / earlierAvg;
    const threshold = 0.1; // 10% change threshold
    
    if (inverse) {
      if (change > threshold) return 'degrading';
      if (change < -threshold) return 'improving';
    } else {
      if (change > threshold) return 'improving';
      if (change < -threshold) return 'degrading';
    }
    
    return 'stable';
  }

  private generateSummary(
    overallStatus: HealthReport['overall_status'], 
    components: HealthReport['components'], 
    metrics: HealthReport['metrics']
  ): string {
    const componentStatuses = Object.entries(components)
      .map(([name, component]) => `${name}: ${component.status}`)
      .join(', ');
    
    const memoryUsage = Math.round(metrics.resource_usage.memory_usage_percent);
    const poolUtilization = Math.round(metrics.resource_usage.connection_pool_utilization);
    
    return `Overall status: ${overallStatus.toUpperCase()}. Components: ${componentStatuses}. Memory usage: ${memoryUsage}%, Pool utilization: ${poolUtilization}%`;
  }

  private processAlerts(report: HealthReport): void {
    // Memory usage alerts
    if (report.metrics.resource_usage.memory_usage_percent > this.config.alertThresholds!.criticalMemoryUsage!) {
      this.createAlert('critical', 'performance', 
        `Critical memory usage: ${report.metrics.resource_usage.memory_usage_percent.toFixed(1)}%`,
        { memory_usage: report.metrics.resource_usage.memory_usage_percent }
      );
    }
    
    // Response time alerts
    if (report.metrics.response_times.health_check > this.config.alertThresholds!.criticalResponseTime!) {
      this.createAlert('critical', 'performance',
        `Critical response time: ${report.metrics.response_times.health_check}ms`,
        { response_time: report.metrics.response_times.health_check }
      );
    }
    
    // Error rate alerts
    if (report.metrics.error_rates.connection_errors > this.config.alertThresholds!.criticalErrorRate!) {
      this.createAlert('critical', 'reliability',
        `High error rate: ${report.metrics.error_rates.connection_errors} connection errors`,
        { error_count: report.metrics.error_rates.connection_errors }
      );
    }
    
    // Component health alerts
    Object.entries(report.components).forEach(([componentName, component]) => {
      if (component.status === 'critical' || component.status === 'unhealthy') {
        this.createAlert(
          component.status === 'critical' ? 'critical' : 'warning',
          'reliability',
          `${componentName} component ${component.status}: ${component.last_error || 'Health check failed'}`,
          { component: componentName, status: component.status, score: component.score }
        );
      }
    });
  }

  private createAlert(severity: Alert['severity'], component: string, message: string, details?: Record<string, any>): void {
    const alertId = this.generateAlertId(component, message);
    
    if (this.alerts.has(alertId)) {
      // Update existing alert
      const existing = this.alerts.get(alertId)!;
      existing.timestamp = new Date().toISOString();
      existing.details = { ...existing.details, ...details };
    } else {
      // Create new alert
      const alert: Alert = {
        id: alertId,
        severity,
        component,
        message,
        timestamp: new Date().toISOString(),
        resolved: false,
        details
      };
      
      this.alerts.set(alertId, alert);
      this.emit('alert_created', alert);
      
      console.warn(`🚨 ${severity.toUpperCase()} ALERT: ${message}`);
    }
  }

  private generateAlertId(component: string, message: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(`${component}:${message}`).digest('hex').substring(0, 8);
  }

  private generateReportId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `health_${timestamp}_${random}`;
  }

  private generateErrorReport(id: string, error: Error): HealthReport {
    return {
      id,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      overall_status: 'critical',
      components: {
        database: { status: 'unhealthy', score: 0, response_time: 0, uptime: 0, details: { error: error.message } },
        connection_pool: { status: 'unhealthy', score: 0, response_time: 0, uptime: 0, details: { error: 'Unable to assess' } },
        recovery_system: { status: 'unhealthy', score: 0, response_time: 0, uptime: 0, details: { error: 'Unable to assess' } },
        containers: { status: 'unhealthy', score: 0, response_time: 0, uptime: 0, details: { error: 'Unable to assess' } },
        performance: { status: 'unhealthy', score: 0, response_time: 0, uptime: 0, details: { error: 'Unable to assess' } }
      },
      metrics: {
        response_times: { database_connection: 0, health_check: 0, test_execution: 0, container_startup: 0 },
        resource_usage: { memory_usage_percent: 0, cpu_usage_percent: 0, disk_usage_percent: 0, connection_pool_utilization: 0 },
        error_rates: { connection_errors: 1, test_failures: 0, timeout_errors: 0, recovery_actions: 0 },
        availability: { uptime_percent: 0, database_availability: 0, container_availability: 0, service_availability: 0 }
      },
      alerts: [{
        id: this.generateAlertId('system', error.message),
        severity: 'critical',
        component: 'system',
        message: `Health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        resolved: false,
        details: { stack: error.stack }
      }],
      recommendations: [{
        priority: 'critical',
        category: 'reliability',
        action: 'Investigate health check failure and restore system functionality',
        impact: 'Critical - system health monitoring is not functional',
        effort: 'high'
      }],
      trends: {
        performance_trend: 'degrading',
        reliability_trend: 'degrading',
        error_trend: 'degrading',
        capacity_trend: 'stable'
      },
      summary: `CRITICAL: Health check failed with error: ${error.message}`
    };
  }

  private async storeReportSafely(report: HealthReport): Promise<void> {
    try {
      // Add to in-memory history
      this.reportHistory.push(report);
      
      // Maintain history size
      const maxHistory = 100;
      if (this.reportHistory.length > maxHistory) {
        this.reportHistory = this.reportHistory.slice(-maxHistory);
      }
      
      // Store to file with backup mechanism
      const filename = join(this.reportsDir, `health-report-${report.id}.json`);
      const tempFilename = `${filename}.tmp`;
      
      try {
        // Write to temporary file first
        writeFileSync(tempFilename, JSON.stringify(report, null, 2));
        
        // Verify the file was written correctly
        const written = JSON.parse(readFileSync(tempFilename, 'utf8'));
        if (written.id !== report.id) {
          throw new Error('File verification failed');
        }
        
        // Atomically move to final location
        const fs = require('fs');
        fs.renameSync(tempFilename, filename);
        
      } catch (error) {
        console.error('Failed to write health report to file:', error);
        
        // Clean up temp file if it exists
        try {
          const fs = require('fs');
          if (fs.existsSync(tempFilename)) {
            fs.unlinkSync(tempFilename);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
        
        // Continue with in-memory storage even if file write fails
      }
      
      // Store metrics for trend analysis
      this.metricsHistory.push({
        timestamp: report.timestamp,
        metrics: report.metrics,
        component_scores: Object.fromEntries(
          Object.entries(report.components).map(([name, comp]) => [name, comp.score])
        ),
        health_score: this.calculateOverallHealthScore(report.components)
      });
      
      // Maintain metrics history size
      const maxMetricsHistory = 1000;
      if (this.metricsHistory.length > maxMetricsHistory) {
        this.metricsHistory = this.metricsHistory.slice(-maxMetricsHistory);
      }
      
      // Cleanup old files asynchronously
      setImmediate(() => this.cleanupOldReports());
      
    } catch (error) {
      console.error('Critical error storing health report:', error);
      // Still emit event even if storage fails
      this.emit('storage_error', { error, report: report.id });
    }
  }
  
  private calculateOverallHealthScore(components: HealthReport['components']): number {
    const scores = Object.values(components).map(c => c.score);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
  
  private storeReport(report: HealthReport): void {
    // Legacy method - calls the safe version
    this.storeReportSafely(report).catch(error => {
      console.error('Failed to store report safely:', error);
    });
  }

  private cleanupOldReports(): void {
    try {
      const { readdirSync, statSync, unlinkSync } = require('fs');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
      
      const files = readdirSync(this.reportsDir);
      files.forEach(file => {
        if (file.startsWith('health-report-') && file.endsWith('.json')) {
          const filePath = join(this.reportsDir, file);
          const stats = statSync(filePath);
          if (stats.mtime < cutoffDate) {
            unlinkSync(filePath);
          }
        }
      });
    } catch (error) {
      console.warn('Failed to cleanup old reports:', error);
    }
  }

  private loadHistoricalData(): void {
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(this.reportsDir);
      
      const reportFiles = files
        .filter(file => file.startsWith('health-report-') && file.endsWith('.json'))
        .sort()
        .slice(-50); // Load last 50 reports
      
      reportFiles.forEach(file => {
        try {
          const filePath = join(this.reportsDir, file);
          const reportData = readFileSync(filePath, 'utf8');
          const report = JSON.parse(reportData) as HealthReport;
          this.reportHistory.push(report);
        } catch (error) {
          console.warn(`Failed to load report ${file}:`, error);
        }
      });
      
      console.log(`📊 Loaded ${this.reportHistory.length} historical health reports`);
    } catch (error) {
      console.warn('Failed to load historical data:', error);
    }
  }

  async generateComprehensiveReport(): Promise<string> {
    const latestReport = this.reportHistory[this.reportHistory.length - 1];
    if (!latestReport) {
      return 'No health reports available';
    }
    
    let report = '\n🏥 COMPREHENSIVE HEALTH REPORT\n';
    report += '═'.repeat(80) + '\n';
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Environment: ${latestReport.environment}\n`;
    report += `Overall Status: ${latestReport.overall_status.toUpperCase()}\n\n`;
    
    // Component health summary
    report += '📊 COMPONENT HEALTH\n';
    report += '-'.repeat(40) + '\n';
    Object.entries(latestReport.components).forEach(([name, component]) => {
      const emoji = this.getStatusEmoji(component.status);
      report += `${emoji} ${name.replace('_', ' ').toUpperCase()}: ${component.status} (${component.score}/100)\n`;
      if (component.last_error) {
        report += `   Error: ${component.last_error}\n`;
      }
    });
    report += '\n';
    
    // Key metrics
    report += '📈 KEY METRICS\n';
    report += '-'.repeat(40) + '\n';
    report += `Memory Usage: ${latestReport.metrics.resource_usage.memory_usage_percent.toFixed(1)}%\n`;
    report += `Pool Utilization: ${latestReport.metrics.resource_usage.connection_pool_utilization.toFixed(1)}%\n`;
    report += `Database Response: ${latestReport.metrics.response_times.database_connection}ms\n`;
    report += `Health Check Time: ${latestReport.metrics.response_times.health_check}ms\n`;
    report += `Connection Errors: ${latestReport.metrics.error_rates.connection_errors}\n`;
    report += `Recovery Actions: ${latestReport.metrics.error_rates.recovery_actions}\n\n`;
    
    // Trends
    report += '📊 TRENDS\n';
    report += '-'.repeat(40) + '\n';
    Object.entries(latestReport.trends).forEach(([metric, trend]) => {
      const emoji = trend === 'improving' ? '📈' : trend === 'degrading' ? '📉' : '➡️';
      report += `${emoji} ${metric.replace('_', ' ').toUpperCase()}: ${trend}\n`;
    });
    report += '\n';
    
    // Active alerts
    if (latestReport.alerts.length > 0) {
      report += '🚨 ACTIVE ALERTS\n';
      report += '-'.repeat(40) + '\n';
      latestReport.alerts.forEach(alert => {
        const emoji = this.getSeverityEmoji(alert.severity);
        report += `${emoji} ${alert.severity.toUpperCase()}: ${alert.message}\n`;
        report += `   Component: ${alert.component}, Time: ${new Date(alert.timestamp).toLocaleTimeString()}\n`;
      });
      report += '\n';
    }
    
    // Recommendations
    if (latestReport.recommendations.length > 0) {
      report += '💡 RECOMMENDATIONS\n';
      report += '-'.repeat(40) + '\n';
      latestReport.recommendations.forEach((rec, index) => {
        const priorityEmoji = rec.priority === 'critical' ? '🔥' : 
                             rec.priority === 'high' ? '⚠️' : 
                             rec.priority === 'medium' ? '💡' : '💭';
        report += `${priorityEmoji} ${rec.priority.toUpperCase()}: ${rec.action}\n`;
        report += `   Impact: ${rec.impact}\n`;
        report += `   Effort: ${rec.effort}\n`;
        if (index < latestReport.recommendations.length - 1) report += '\n';
      });
      report += '\n';
    }
    
    // Historical performance
    if (this.reportHistory.length > 5) {
      report += '📊 PERFORMANCE HISTORY (Last 10 Reports)\n';
      report += '-'.repeat(40) + '\n';
      const recentReports = this.reportHistory.slice(-10);
      
      report += 'Timestamp               | Status    | Memory% | Pool% | Errors\n';
      report += '-'.repeat(70) + '\n';
      
      recentReports.forEach(r => {
        const time = new Date(r.timestamp).toLocaleString().substring(0, 19);
        const status = r.overall_status.padEnd(9);
        const memory = r.metrics.resource_usage.memory_usage_percent.toFixed(1).padStart(6);
        const pool = r.metrics.resource_usage.connection_pool_utilization.toFixed(1).padStart(4);
        const errors = r.metrics.error_rates.connection_errors.toString().padStart(6);
        
        report += `${time} | ${status} | ${memory}% | ${pool}% | ${errors}\n`;
      });
    }
    
    report += '\n' + '═'.repeat(80) + '\n';
    
    // Store comprehensive report
    const filename = join(this.reportsDir, `comprehensive-report-${Date.now()}.txt`);
    writeFileSync(filename, report);
    
    return report;
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'healthy': return '🟢';
      case 'degraded': return '🟡';
      case 'unhealthy': return '🔴';
      case 'critical': return '🚨';
      default: return '❓';
    }
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
      case 'emergency': return '🔥';
      default: return '❓';
    }
  }

  getLatestReport(): HealthReport | null {
    return this.reportHistory[this.reportHistory.length - 1] || null;
  }

  getReportHistory(limit = 10): HealthReport[] {
    return this.reportHistory.slice(-limit);
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  async destroy(): Promise<void> {
    console.log('🏥 Destroying health reporting system...');
    
    await this.stopMonitoring();
    
    // Clear all data
    this.reportHistory = [];
    this.alerts.clear();
    this.metricsHistory = [];
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('✅ Health reporting system destroyed');
  }
}

export interface HealthReportingConfig {
  dbConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  interval?: number;
  retentionDays?: number;
  enableTrends?: boolean;
  enableAlerts?: boolean;
  includeRedis?: boolean;
  alertThresholds?: {
    criticalMemoryUsage?: number;
    criticalErrorRate?: number;
    warningResponseTime?: number;
    criticalResponseTime?: number;
  };
}

// Global health reporting system instance
let globalHealthReporting: AutomatedHealthReportingSystem | null = null;

export function initializeHealthReporting(config: HealthReportingConfig): AutomatedHealthReportingSystem {
  if (globalHealthReporting) {
    console.log('🔄 Destroying existing health reporting system...');
    globalHealthReporting.destroy();
  }
  
  globalHealthReporting = new AutomatedHealthReportingSystem(config);
  console.log('🏥 Health reporting system initialized');
  return globalHealthReporting;
}

export function getHealthReporting(): AutomatedHealthReportingSystem | null {
  return globalHealthReporting;
}

export function generateHealthReport(): Promise<string> {
  return globalHealthReporting ? 
    globalHealthReporting.generateComprehensiveReport() : 
    Promise.resolve('Health reporting system not initialized');
}

// Add new metric collection methods to the class (these should be added before the existing getLatestHealthStatus function)
private async getNetworkMetrics(): Promise<any> {
  try {
    const { execSync } = require('child_process');
    
    // Check network connectivity
    const connectivity = {
      localhost: await this.testConnection('localhost', 'TCP'),
      database_port: await this.testConnection('localhost:5434', 'TCP'),
      redis_port: await this.testConnection('localhost:6381', 'TCP')
    };
    
    // Get network interface stats (if available)
    let interfaces = {};
    try {
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      interfaces = Object.keys(networkInterfaces).reduce((acc: any, name: string) => {
        const iface = networkInterfaces[name]?.find((i: any) => !i.internal && i.family === 'IPv4');
        if (iface) {
          acc[name] = {
            address: iface.address,
            netmask: iface.netmask,
            mac: iface.mac
          };
        }
        return acc;
      }, {});
    } catch (error) {
      interfaces = { error: 'Network interfaces unavailable' };
    }
    
    return {
      connectivity,
      interfaces,
      dns_resolution: await this.testDNSResolution()
    };
  } catch (error) {
    return { error: error.message, available: false };
  }
}

private async testConnection(target: string, protocol: string = 'TCP'): Promise<boolean> {
  try {
    const net = require('net');
    const [host, port] = target.includes(':') ? target.split(':') : [target, '80'];
    
    return new Promise((resolve) => {
      const socket = net.createConnection({
        host,
        port: parseInt(port),
        timeout: 2000
      });
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch (error) {
    return false;
  }
}

private async testDNSResolution(): Promise<any> {
  try {
    const dns = require('dns').promises;
    const startTime = Date.now();
    await dns.lookup('localhost');
    return {
      status: 'working',
      response_time: Date.now() - startTime
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error.message
    };
  }
}

private async getDiskMetrics(): Promise<any> {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Get disk usage for current directory
    const stats = await fs.stat(process.cwd());
    
    let diskUsage = { total: 0, free: 0, used: 0, usage_percent: 0 };
    
    try {
      const { execSync } = require('child_process');
      if (process.platform !== 'win32') {
        const dfOutput = execSync('df -k .', { encoding: 'utf8' });
        const lines = dfOutput.trim().split('\n');
        if (lines.length > 1) {
          const data = lines[1].split(/\s+/);
          diskUsage = {
            total: parseInt(data[1]) * 1024, // Convert KB to bytes
            used: parseInt(data[2]) * 1024,
            free: parseInt(data[3]) * 1024,
            usage_percent: parseFloat(data[4].replace('%', ''))
          };
        }
      }
    } catch (error) {
      // Fallback method or Windows handling
      diskUsage = { total: 0, free: 0, used: 0, usage_percent: 0, error: 'Disk usage unavailable' };
    }
    
    // Check important directories
    const directoryInfo = await this.getDirectoryInfo([
      './logs',
      './test-results',
      './coverage',
      './node_modules',
      './dist'
    ]);
    
    return {
      usage: diskUsage,
      directories: directoryInfo,
      inodes: stats.ino,
      last_modified: stats.mtime
    };
  } catch (error) {
    return { error: error.message, available: false };
  }
}

private async getDirectoryInfo(paths: string[]): Promise<any> {
  const fs = require('fs').promises;
  const path = require('path');
  
  const results: any = {};
  
  for (const dirPath of paths) {
    try {
      const fullPath = path.resolve(dirPath);
      const stats = await fs.stat(fullPath).catch(() => null);
      
      if (stats) {
        // Get directory size (simplified)
        const files = await fs.readdir(fullPath).catch(() => []);
        results[dirPath] = {
          exists: true,
          size_estimate: stats.size,
          file_count: files.length,
          last_modified: stats.mtime,
          permissions: stats.mode
        };
      } else {
        results[dirPath] = {
          exists: false,
          size_estimate: 0,
          file_count: 0
        };
      }
    } catch (error) {
      results[dirPath] = {
        exists: false,
        error: error.message
      };
    }
  }
  
  return results;
}

private async getProcessMetrics(): Promise<any> {
  try {
    const process = require('process');
    
    // Get resource usage
    const resourceUsage = process.resourceUsage();
    
    // Get environment variables (filtered for security)
    const safeEnvVars = {
      NODE_ENV: process.env.NODE_ENV,
      NODE_VERSION: process.version,
      VITEST_POOL_ID: process.env.VITEST_POOL_ID,
      CI: process.env.CI,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS
    };
    
    // Get process arguments (filtered)
    const args = process.argv.filter(arg => 
      !arg.includes('password') && 
      !arg.includes('secret') && 
      !arg.includes('token')
    );
    
    return {
      pid: process.pid,
      ppid: process.ppid,
      resource_usage: {
        user_cpu_time: resourceUsage.userCPUTime,
        system_cpu_time: resourceUsage.systemCPUTime,
        max_rss: resourceUsage.maxRSS,
        shared_memory_size: resourceUsage.sharedMemorySize,
        unshared_data_size: resourceUsage.unsharedDataSize,
        unshared_stack_size: resourceUsage.unsharedStackSize,
        minor_page_fault: resourceUsage.minorPageFault,
        major_page_fault: resourceUsage.majorPageFault,
        swapped_out: resourceUsage.swappedOut,
        block_input_ops: resourceUsage.fsRead,
        block_output_ops: resourceUsage.fsWrite,
        ipc_sent: resourceUsage.ipcSent,
        ipc_received: resourceUsage.ipcReceived,
        signals_received: resourceUsage.signalsCount,
        voluntary_context_switches: resourceUsage.voluntaryContextSwitches,
        involuntary_context_switches: resourceUsage.involuntaryContextSwitches
      },
      environment: safeEnvVars,
      arguments: args,
      working_directory: process.cwd(),
      umask: process.umask(),
      groups: process.getgroups ? process.getgroups() : []
    };
  } catch (error) {
    return { error: error.message, available: false };
  }
}

export function getLatestHealthStatus(): HealthReport | null {
  return globalHealthReporting ? globalHealthReporting.getLatestReport() : null;
}