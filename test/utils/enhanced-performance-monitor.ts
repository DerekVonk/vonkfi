import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface PerformanceMetrics {
  timestamp: Date;
  testFile?: string;
  groupId?: string;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  resourceUtilization: ResourceUtilization;
  systemLoad: SystemLoad;
  bottlenecks: PerformanceBottleneck[];
  trends: PerformanceTrend[];
}

export interface ResourceUtilization {
  cpu: number; // 0-1
  memory: number; // 0-1
  disk: number; // 0-1
  network: number; // 0-1
  parallelWorkers: number;
  databaseConnections: number;
}

export interface SystemLoad {
  loadAverage: number[];
  activeConnections: number;
  queueDepth: number;
  errorRate: number;
  throughput: number; // tests per second
}

export interface PerformanceBottleneck {
  type: 'memory' | 'cpu' | 'disk' | 'network' | 'database' | 'synchronization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: number; // 0-1 score
  detectedAt: Date;
  frequency: number; // how often this occurs
  suggestedFix: string;
  context: Record<string, any>;
}

export interface PerformanceTrend {
  metric: string;
  direction: 'improving' | 'degrading' | 'stable' | 'volatile';
  rate: number; // rate of change
  confidence: number; // 0-1
  prediction: {
    shortTerm: number; // next 5 minutes
    mediumTerm: number; // next hour
    longTerm: number; // next day
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: PerformanceMetrics) => boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  threshold: number;
  enabled: boolean;
  cooldownMs: number;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'throttle' | 'fallback';
  config: Record<string, any>;
}

export interface PerformanceAlert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metrics: PerformanceMetrics;
  triggeredAt: Date;
  resolvedAt?: Date;
  isActive: boolean;
  context: Record<string, any>;
}

export interface PerformanceReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalTests: number;
    totalDuration: number;
    averageDuration: number;
    successRate: number;
    parallelizationEfficiency: number;
    resourceEfficiency: number;
  };
  trends: PerformanceTrend[];
  bottlenecks: PerformanceBottleneck[];
  alerts: PerformanceAlert[];
  recommendations: PerformanceRecommendation[];
  comparison: {
    previousPeriod?: PerformanceReport['summary'];
    percentageChange: Record<string, number>;
  };
}

export interface PerformanceRecommendation {
  type: 'optimization' | 'scaling' | 'configuration' | 'infrastructure';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImprovement: string;
  implementationEffort: 'low' | 'medium' | 'high';
  estimatedCost: string;
  confidence: number; // 0-1
}

export class EnhancedPerformanceMonitor extends EventEmitter {
  private metricsHistory: PerformanceMetrics[] = [];
  private activeAlerts = new Map<string, PerformanceAlert>();
  private alertRules = new Map<string, AlertRule>();
  private lastAlertTimes = new Map<string, Date>();
  private bottleneckHistory = new Map<string, PerformanceBottleneck[]>();
  private trendAnalyzer: TrendAnalyzer;
  private anomalyDetector: AnomalyDetector;
  private resourceTracker: ResourceTracker;
  private dataDirectory: string;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private metricsCollectionInterval = 5000; // 5 seconds
  private maxHistorySize = 10000;
  private predictionEngine: PredictionEngine;

  constructor(options: {
    dataDirectory?: string;
    metricsCollectionInterval?: number;
    maxHistorySize?: number;
    enablePredictions?: boolean;
  } = {}) {
    super();
    
    this.dataDirectory = options.dataDirectory || join(process.cwd(), 'performance-data');
    this.metricsCollectionInterval = options.metricsCollectionInterval || 5000;
    this.maxHistorySize = options.maxHistorySize || 10000;
    
    this.initializeDataDirectory();
    this.trendAnalyzer = new TrendAnalyzer();
    this.anomalyDetector = new AnomalyDetector();
    this.resourceTracker = new ResourceTracker();
    this.predictionEngine = new PredictionEngine(options.enablePredictions ?? true);
    
    this.initializeDefaultAlertRules();
    this.loadHistoricalData();
    
    console.log('📊 Enhanced Performance Monitor initialized');
  }

  private initializeDataDirectory(): void {
    if (!existsSync(this.dataDirectory)) {
      mkdirSync(this.dataDirectory, { recursive: true });
    }
  }

  private initializeDefaultAlertRules(): void {
    // Memory usage alert
    this.addAlertRule({
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      condition: (metrics) => metrics.resourceUtilization.memory > 0.8,
      severity: 'warning',
      description: 'Memory usage above 80%',
      threshold: 0.8,
      enabled: true,
      cooldownMs: 60000, // 1 minute
      actions: [
        { type: 'log', config: { level: 'warn' } },
        { type: 'throttle', config: { action: 'reduce_parallelism' } }
      ]
    });

    // CPU usage alert
    this.addAlertRule({
      id: 'high_cpu_usage',
      name: 'High CPU Usage',
      condition: (metrics) => metrics.resourceUtilization.cpu > 0.9,
      severity: 'warning',
      description: 'CPU usage above 90%',
      threshold: 0.9,
      enabled: true,
      cooldownMs: 30000,
      actions: [
        { type: 'log', config: { level: 'warn' } },
        { type: 'throttle', config: { action: 'reduce_workers' } }
      ]
    });

    // Critical memory alert
    this.addAlertRule({
      id: 'critical_memory_usage',
      name: 'Critical Memory Usage',
      condition: (metrics) => metrics.resourceUtilization.memory > 0.95,
      severity: 'critical',
      description: 'Memory usage above 95% - system at risk',
      threshold: 0.95,
      enabled: true,
      cooldownMs: 15000,
      actions: [
        { type: 'log', config: { level: 'error' } },
        { type: 'fallback', config: { action: 'emergency_stop' } }
      ]
    });

    // Performance degradation alert
    this.addAlertRule({
      id: 'performance_degradation',
      name: 'Performance Degradation',
      condition: (metrics) => {
        const recentMetrics = this.metricsHistory.slice(-10);
        if (recentMetrics.length < 5) return false;
        
        const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
        const baselineDuration = this.getBaselineDuration();
        
        return avgDuration > baselineDuration * 1.5; // 50% slower than baseline
      },
      severity: 'warning',
      description: 'Test execution times are 50% slower than baseline',
      threshold: 1.5,
      enabled: true,
      cooldownMs: 120000, // 2 minutes
      actions: [
        { type: 'log', config: { level: 'warn' } }
      ]
    });

    // Error rate alert
    this.addAlertRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: (metrics) => metrics.systemLoad.errorRate > 0.1,
      severity: 'error',
      description: 'Error rate above 10%',
      threshold: 0.1,
      enabled: true,
      cooldownMs: 60000,
      actions: [
        { type: 'log', config: { level: 'error' } },
        { type: 'fallback', config: { action: 'sequential_mode' } }
      ]
    });
  }

  private getBaselineDuration(): number {
    if (this.metricsHistory.length < 50) return 5000; // Default 5 seconds
    
    // Use median of first 50% of historical data as baseline
    const baselineData = this.metricsHistory.slice(0, Math.floor(this.metricsHistory.length * 0.5));
    const durations = baselineData.map(m => m.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    
    return median || 5000;
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.metricsCollectionInterval);
    
    console.log(`📈 Performance monitoring started (interval: ${this.metricsCollectionInterval}ms)`);
    this.emit('monitoringStarted');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    console.log('📈 Performance monitoring stopped');
    this.saveHistoricalData();
    this.emit('monitoringStopped');
  }

  private async collectMetrics(testFile?: string, groupId?: string): Promise<PerformanceMetrics> {
    const timestamp = new Date();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const resourceUtilization = await this.resourceTracker.getCurrentUtilization();
    const systemLoad = await this.calculateSystemLoad();
    
    const metrics: PerformanceMetrics = {
      timestamp,
      testFile,
      groupId,
      duration: 0, // Will be set by caller if applicable
      memoryUsage,
      cpuUsage,
      resourceUtilization,
      systemLoad,
      bottlenecks: [],
      trends: []
    };

    // Detect bottlenecks
    metrics.bottlenecks = this.detectBottlenecks(metrics);
    
    // Analyze trends
    metrics.trends = this.trendAnalyzer.analyzeTrends(this.metricsHistory, metrics);
    
    // Check for anomalies
    const anomalies = this.anomalyDetector.detectAnomalies(metrics, this.metricsHistory);
    if (anomalies.length > 0) {
      console.warn(`🚨 Performance anomalies detected: ${anomalies.length} issues`);
      this.emit('anomaliesDetected', anomalies);
    }

    // Store metrics
    this.metricsHistory.push(metrics);
    
    // Maintain history size limit
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }

    // Check alert rules
    this.checkAlertRules(metrics);
    
    // Update predictions
    this.predictionEngine.updatePredictions(metrics);

    this.emit('metricsCollected', metrics);
    return metrics;
  }

  private async calculateSystemLoad(): Promise<SystemLoad> {
    const os = require('os');
    
    return {
      loadAverage: os.loadavg(),
      activeConnections: this.resourceTracker.getActiveConnections(),
      queueDepth: this.resourceTracker.getQueueDepth(),
      errorRate: this.calculateErrorRate(),
      throughput: this.calculateThroughput()
    };
  }

  private calculateErrorRate(): number {
    const recentMetrics = this.metricsHistory.slice(-20); // Last 20 data points
    if (recentMetrics.length === 0) return 0;
    
    const errorCount = recentMetrics.filter(m => 
      m.bottlenecks.some(b => b.severity === 'high' || b.severity === 'critical')
    ).length;
    
    return errorCount / recentMetrics.length;
  }

  private calculateThroughput(): number {
    const timeWindow = 60000; // 1 minute
    const cutoff = Date.now() - timeWindow;
    
    const recentMetrics = this.metricsHistory.filter(m => 
      m.timestamp.getTime() > cutoff
    );
    
    return recentMetrics.length / (timeWindow / 1000); // per second
  }

  private detectBottlenecks(metrics: PerformanceMetrics): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = [];
    
    // Memory bottleneck
    if (metrics.resourceUtilization.memory > 0.8) {
      bottlenecks.push({
        type: 'memory',
        severity: metrics.resourceUtilization.memory > 0.95 ? 'critical' : 'high',
        description: `High memory usage: ${(metrics.resourceUtilization.memory * 100).toFixed(1)}%`,
        impact: metrics.resourceUtilization.memory,
        detectedAt: metrics.timestamp,
        frequency: this.getBottleneckFrequency('memory'),
        suggestedFix: 'Reduce parallelism, optimize memory usage, or increase available memory',
        context: {
          heapUsed: metrics.memoryUsage.heapUsed,
          heapTotal: metrics.memoryUsage.heapTotal,
          external: metrics.memoryUsage.external
        }
      });
    }

    // CPU bottleneck
    if (metrics.resourceUtilization.cpu > 0.85) {
      bottlenecks.push({
        type: 'cpu',
        severity: metrics.resourceUtilization.cpu > 0.95 ? 'critical' : 'high',
        description: `High CPU usage: ${(metrics.resourceUtilization.cpu * 100).toFixed(1)}%`,
        impact: metrics.resourceUtilization.cpu,
        detectedAt: metrics.timestamp,
        frequency: this.getBottleneckFrequency('cpu'),
        suggestedFix: 'Optimize CPU-intensive operations or reduce parallel worker count',
        context: {
          user: metrics.cpuUsage.user,
          system: metrics.cpuUsage.system
        }
      });
    }

    // Database connection bottleneck
    if (metrics.resourceUtilization.databaseConnections > 10) {
      bottlenecks.push({
        type: 'database',
        severity: metrics.resourceUtilization.databaseConnections > 20 ? 'high' : 'medium',
        description: `High database connection usage: ${metrics.resourceUtilization.databaseConnections} connections`,
        impact: Math.min(metrics.resourceUtilization.databaseConnections / 25, 1),
        detectedAt: metrics.timestamp,
        frequency: this.getBottleneckFrequency('database'),
        suggestedFix: 'Optimize database queries, implement connection pooling, or reduce concurrent database operations',
        context: {
          connections: metrics.resourceUtilization.databaseConnections
        }
      });
    }

    // System load bottleneck
    const loadAvg = metrics.systemLoad.loadAverage[0];
    const cpuCount = require('os').cpus().length;
    if (loadAvg > cpuCount * 0.8) {
      bottlenecks.push({
        type: 'cpu',
        severity: loadAvg > cpuCount ? 'high' : 'medium',
        description: `High system load: ${loadAvg.toFixed(2)} (CPU count: ${cpuCount})`,
        impact: Math.min(loadAvg / cpuCount, 1),
        detectedAt: metrics.timestamp,
        frequency: this.getBottleneckFrequency('system_load'),
        suggestedFix: 'Reduce overall system load or increase CPU capacity',
        context: {
          loadAverage: metrics.systemLoad.loadAverage,
          cpuCount
        }
      });
    }

    // Store bottleneck history for frequency analysis
    for (const bottleneck of bottlenecks) {
      const key = `${bottleneck.type}_${bottleneck.severity}`;
      if (!this.bottleneckHistory.has(key)) {
        this.bottleneckHistory.set(key, []);
      }
      this.bottleneckHistory.get(key)!.push(bottleneck);
      
      // Keep only recent history
      const history = this.bottleneckHistory.get(key)!;
      if (history.length > 100) {
        this.bottleneckHistory.set(key, history.slice(-100));
      }
    }

    return bottlenecks;
  }

  private getBottleneckFrequency(type: string): number {
    const timeWindow = 300000; // 5 minutes
    const cutoff = Date.now() - timeWindow;
    
    let count = 0;
    for (const [key, history] of this.bottleneckHistory) {
      if (key.startsWith(type)) {
        count += history.filter(b => b.detectedAt.getTime() > cutoff).length;
      }
    }
    
    return count / (timeWindow / 60000); // per minute
  }

  private checkAlertRules(metrics: PerformanceMetrics): void {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastAlert = this.lastAlertTimes.get(ruleId);
      if (lastAlert && Date.now() - lastAlert.getTime() < rule.cooldownMs) {
        continue;
      }
      
      if (rule.condition(metrics)) {
        this.triggerAlert(rule, metrics);
      }
    }
  }

  private triggerAlert(rule: AlertRule, metrics: PerformanceMetrics): void {
    const alertId = `${rule.id}_${Date.now()}`;
    
    const alert: PerformanceAlert = {
      id: alertId,
      ruleId: rule.id,
      severity: rule.severity,
      message: `${rule.name}: ${rule.description}`,
      metrics,
      triggeredAt: new Date(),
      isActive: true,
      context: {
        threshold: rule.threshold,
        actualValue: this.extractMetricValue(metrics, rule.id)
      }
    };

    this.activeAlerts.set(alertId, alert);
    this.lastAlertTimes.set(rule.id, new Date());

    // Execute alert actions
    for (const action of rule.actions) {
      this.executeAlertAction(action, alert);
    }

    console.warn(`🚨 Performance Alert: ${alert.message}`);
    this.emit('alertTriggered', alert);
  }

  private extractMetricValue(metrics: PerformanceMetrics, ruleId: string): number {
    switch (ruleId) {
      case 'high_memory_usage':
      case 'critical_memory_usage':
        return metrics.resourceUtilization.memory;
      case 'high_cpu_usage':
        return metrics.resourceUtilization.cpu;
      case 'high_error_rate':
        return metrics.systemLoad.errorRate;
      default:
        return 0;
    }
  }

  private executeAlertAction(action: AlertAction, alert: PerformanceAlert): void {
    switch (action.type) {
      case 'log':
        const level = action.config.level || 'info';
        console[level as keyof Console](`🚨 Alert Action [${level}]: ${alert.message}`);
        break;
        
      case 'throttle':
        console.warn(`🐌 Throttling action triggered: ${action.config.action}`);
        this.emit('throttleRequested', action.config);
        break;
        
      case 'fallback':
        console.error(`🔄 Fallback action triggered: ${action.config.action}`);
        this.emit('fallbackRequested', action.config);
        break;
        
      case 'webhook':
        this.sendWebhook(action.config.url, alert);
        break;
        
      default:
        console.warn(`Unknown alert action type: ${action.type}`);
    }
  }

  private async sendWebhook(url: string, alert: PerformanceAlert): Promise<void> {
    try {
      // In a real implementation, you would make an HTTP request
      console.log(`📡 Webhook would be sent to: ${url}`, {
        alert: alert.message,
        severity: alert.severity,
        timestamp: alert.triggeredAt
      });
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    console.log(`📋 Alert rule added: ${rule.name}`);
  }

  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    console.log(`📋 Alert rule removed: ${ruleId}`);
  }

  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.isActive = false;
      alert.resolvedAt = new Date();
      this.emit('alertResolved', alert);
      console.log(`✅ Alert resolved: ${alert.message}`);
    }
  }

  generateReport(periodHours: number = 24): PerformanceReport {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);
    
    const periodMetrics = this.metricsHistory.filter(m => 
      m.timestamp >= startTime && m.timestamp <= endTime
    );

    const totalTests = periodMetrics.length;
    const totalDuration = periodMetrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    
    // Calculate success rate based on absence of critical bottlenecks
    const successfulTests = periodMetrics.filter(m => 
      !m.bottlenecks.some(b => b.severity === 'critical')
    ).length;
    const successRate = totalTests > 0 ? successfulTests / totalTests : 1;

    // Calculate parallelization efficiency
    const parallelizationEfficiency = this.calculateParallelizationEfficiency(periodMetrics);
    
    // Calculate resource efficiency
    const resourceEfficiency = this.calculateResourceEfficiency(periodMetrics);

    const summary = {
      totalTests,
      totalDuration,
      averageDuration,
      successRate,
      parallelizationEfficiency,
      resourceEfficiency
    };

    // Get trends for the period
    const trends = this.trendAnalyzer.analyzePeriodTrends(periodMetrics);
    
    // Get bottlenecks for the period
    const bottlenecks = this.aggregateBottlenecks(periodMetrics);
    
    // Get alerts for the period
    const alerts = Array.from(this.activeAlerts.values()).filter(a => 
      a.triggeredAt >= startTime && a.triggeredAt <= endTime
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, bottlenecks, trends);

    // Compare with previous period
    const comparison = this.generateComparison(summary, periodHours);

    return {
      period: { start: startTime, end: endTime },
      summary,
      trends,
      bottlenecks,
      alerts,
      recommendations,
      comparison
    };
  }

  private calculateParallelizationEfficiency(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    
    const avgWorkers = metrics.reduce((sum, m) => sum + m.resourceUtilization.parallelWorkers, 0) / metrics.length;
    const idealWorkers = require('os').cpus().length;
    
    return Math.min(avgWorkers / idealWorkers, 1);
  }

  private calculateResourceEfficiency(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    
    const avgCpu = metrics.reduce((sum, m) => sum + m.resourceUtilization.cpu, 0) / metrics.length;
    const avgMemory = metrics.reduce((sum, m) => sum + m.resourceUtilization.memory, 0) / metrics.length;
    
    // Efficiency is inverse of resource usage (lower usage = higher efficiency for idle resources)
    // But we want some usage to indicate productive work
    const optimalCpu = 0.7; // 70% CPU usage is optimal
    const optimalMemory = 0.6; // 60% memory usage is optimal
    
    const cpuEfficiency = 1 - Math.abs(avgCpu - optimalCpu);
    const memoryEfficiency = 1 - Math.abs(avgMemory - optimalMemory);
    
    return (cpuEfficiency + memoryEfficiency) / 2;
  }

  private aggregateBottlenecks(metrics: PerformanceMetrics[]): PerformanceBottleneck[] {
    const bottleneckMap = new Map<string, PerformanceBottleneck>();
    
    for (const metric of metrics) {
      for (const bottleneck of metric.bottlenecks) {
        const key = `${bottleneck.type}_${bottleneck.severity}`;
        
        if (bottleneckMap.has(key)) {
          const existing = bottleneckMap.get(key)!;
          existing.frequency += 1;
          existing.impact = Math.max(existing.impact, bottleneck.impact);
        } else {
          bottleneckMap.set(key, { ...bottleneck, frequency: 1 });
        }
      }
    }
    
    return Array.from(bottleneckMap.values())
      .sort((a, b) => b.impact * b.frequency - a.impact * a.frequency)
      .slice(0, 10); // Top 10 bottlenecks
  }

  private generateRecommendations(
    summary: PerformanceReport['summary'],
    bottlenecks: PerformanceBottleneck[],
    trends: PerformanceTrend[]
  ): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    // Performance recommendations based on summary
    if (summary.successRate < 0.9) {
      recommendations.push({
        type: 'optimization',
        priority: 'high',
        title: 'Improve Test Reliability',
        description: `Test success rate is ${(summary.successRate * 100).toFixed(1)}%. Consider reducing parallelism and improving error handling.`,
        expectedImprovement: 'Increase success rate to >95%',
        implementationEffort: 'medium',
        estimatedCost: 'Low - configuration changes',
        confidence: 0.8
      });
    }

    if (summary.parallelizationEfficiency < 0.5) {
      recommendations.push({
        type: 'scaling',
        priority: 'medium',
        title: 'Optimize Parallelization',
        description: `Parallelization efficiency is ${(summary.parallelizationEfficiency * 100).toFixed(1)}%. Consider adjusting worker counts and test groupings.`,
        expectedImprovement: 'Improve efficiency by 20-30%',
        implementationEffort: 'low',
        estimatedCost: 'Low - configuration tuning',
        confidence: 0.7
      });
    }

    // Bottleneck-based recommendations
    for (const bottleneck of bottlenecks.slice(0, 3)) { // Top 3 bottlenecks
      if (bottleneck.severity === 'high' || bottleneck.severity === 'critical') {
        recommendations.push({
          type: 'infrastructure',
          priority: bottleneck.severity === 'critical' ? 'critical' : 'high',
          title: `Address ${bottleneck.type.charAt(0).toUpperCase() + bottleneck.type.slice(1)} Bottleneck`,
          description: bottleneck.description,
          expectedImprovement: bottleneck.suggestedFix,
          implementationEffort: bottleneck.type === 'memory' ? 'high' : 'medium',
          estimatedCost: bottleneck.type === 'memory' ? 'Medium - hardware upgrade' : 'Low - configuration',
          confidence: 0.8
        });
      }
    }

    // Trend-based recommendations
    const degradingTrends = trends.filter(t => t.direction === 'degrading');
    if (degradingTrends.length > 2) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Address Performance Degradation',
        description: `Multiple metrics showing degrading trends: ${degradingTrends.map(t => t.metric).join(', ')}`,
        expectedImprovement: 'Stabilize performance trends',
        implementationEffort: 'medium',
        estimatedCost: 'Medium - investigation and optimization',
        confidence: 0.6
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private generateComparison(
    currentSummary: PerformanceReport['summary'],
    periodHours: number
  ): PerformanceReport['comparison'] {
    // Get previous period data
    const previousEndTime = new Date(Date.now() - periodHours * 60 * 60 * 1000);
    const previousStartTime = new Date(previousEndTime.getTime() - periodHours * 60 * 60 * 1000);
    
    const previousMetrics = this.metricsHistory.filter(m => 
      m.timestamp >= previousStartTime && m.timestamp <= previousEndTime
    );

    if (previousMetrics.length === 0) {
      return { percentageChange: {} };
    }

    const previousSummary = {
      totalTests: previousMetrics.length,
      totalDuration: previousMetrics.reduce((sum, m) => sum + m.duration, 0),
      averageDuration: 0,
      successRate: 0,
      parallelizationEfficiency: this.calculateParallelizationEfficiency(previousMetrics),
      resourceEfficiency: this.calculateResourceEfficiency(previousMetrics)
    };
    
    previousSummary.averageDuration = previousSummary.totalTests > 0 
      ? previousSummary.totalDuration / previousSummary.totalTests 
      : 0;

    const successfulTests = previousMetrics.filter(m => 
      !m.bottlenecks.some(b => b.severity === 'critical')
    ).length;
    previousSummary.successRate = previousSummary.totalTests > 0 
      ? successfulTests / previousSummary.totalTests 
      : 1;

    // Calculate percentage changes
    const percentageChange: Record<string, number> = {};
    
    for (const key of Object.keys(currentSummary) as Array<keyof typeof currentSummary>) {
      if (typeof currentSummary[key] === 'number' && typeof previousSummary[key] === 'number') {
        const current = currentSummary[key] as number;
        const previous = previousSummary[key] as number;
        
        if (previous !== 0) {
          percentageChange[key] = ((current - previous) / previous) * 100;
        }
      }
    }

    return {
      previousPeriod: previousSummary,
      percentageChange
    };
  }

  recordTestExecution(testFile: string, duration: number, groupId?: string): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      testFile,
      groupId,
      duration,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      resourceUtilization: this.resourceTracker.getCurrentUtilization(),
      systemLoad: {
        loadAverage: require('os').loadavg(),
        activeConnections: this.resourceTracker.getActiveConnections(),
        queueDepth: this.resourceTracker.getQueueDepth(),
        errorRate: this.calculateErrorRate(),
        throughput: this.calculateThroughput()
      },
      bottlenecks: [],
      trends: []
    };

    // Process metrics through the collection pipeline
    this.collectMetrics(testFile, groupId).then(processedMetrics => {
      processedMetrics.duration = duration;
    });

    return metrics;
  }

  getMetrics(timeRange?: { start: Date; end: Date }): PerformanceMetrics[] {
    if (!timeRange) {
      return [...this.metricsHistory];
    }
    
    return this.metricsHistory.filter(m => 
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values()).filter(a => a.isActive);
  }

  private saveHistoricalData(): void {
    try {
      const dataFile = join(this.dataDirectory, 'performance-metrics.json');
      const data = {
        metrics: this.metricsHistory.slice(-5000), // Keep last 5000 metrics
        alerts: Array.from(this.activeAlerts.values()),
        lastSaved: new Date()
      };
      
      writeFileSync(dataFile, JSON.stringify(data, null, 2));
      console.log(`💾 Performance data saved: ${data.metrics.length} metrics`);
    } catch (error) {
      console.error('Failed to save performance data:', error);
    }
  }

  private loadHistoricalData(): void {
    try {
      const dataFile = join(this.dataDirectory, 'performance-metrics.json');
      if (existsSync(dataFile)) {
        const content = readFileSync(dataFile, 'utf8');
        const data = JSON.parse(content);
        
        this.metricsHistory = data.metrics.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        
        if (data.alerts) {
          for (const alert of data.alerts) {
            this.activeAlerts.set(alert.id, {
              ...alert,
              triggeredAt: new Date(alert.triggeredAt),
              resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : undefined
            });
          }
        }
        
        console.log(`📁 Performance data loaded: ${this.metricsHistory.length} metrics`);
      }
    } catch (error) {
      console.warn('Failed to load performance data:', error);
    }
  }

  // Cleanup and shutdown
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Enhanced Performance Monitor...');
    
    this.stopMonitoring();
    this.saveHistoricalData();
    
    // Clear all data structures
    this.metricsHistory = [];
    this.activeAlerts.clear();
    this.alertRules.clear();
    this.lastAlertTimes.clear();
    this.bottleneckHistory.clear();
    
    this.removeAllListeners();
    
    console.log('✅ Enhanced Performance Monitor shutdown complete');
  }
}

// Supporting classes
class TrendAnalyzer {
  analyzeTrends(history: PerformanceMetrics[], current: PerformanceMetrics): PerformanceTrend[] {
    if (history.length < 10) return [];
    
    const trends: PerformanceTrend[] = [];
    const recentHistory = history.slice(-20); // Last 20 data points
    
    // Analyze duration trend
    const durations = recentHistory.map(m => m.duration);
    trends.push(this.analyzeSingleMetricTrend('duration', durations));
    
    // Analyze memory trend
    const memoryUsage = recentHistory.map(m => m.resourceUtilization.memory);
    trends.push(this.analyzeSingleMetricTrend('memory_usage', memoryUsage));
    
    // Analyze CPU trend
    const cpuUsage = recentHistory.map(m => m.resourceUtilization.cpu);
    trends.push(this.analyzeSingleMetricTrend('cpu_usage', cpuUsage));
    
    return trends.filter(t => t.confidence > 0.5); // Only return confident trends
  }

  analyzePeriodTrends(metrics: PerformanceMetrics[]): PerformanceTrend[] {
    if (metrics.length < 10) return [];
    
    const trends: PerformanceTrend[] = [];
    
    // Split into time windows and analyze
    const windowSize = Math.max(5, Math.floor(metrics.length / 4));
    const windows = [];
    
    for (let i = 0; i < metrics.length; i += windowSize) {
      windows.push(metrics.slice(i, i + windowSize));
    }
    
    if (windows.length >= 3) {
      // Analyze trends across windows
      const durations = windows.map(w => 
        w.reduce((sum, m) => sum + m.duration, 0) / w.length
      );
      trends.push(this.analyzeSingleMetricTrend('duration', durations));
    }
    
    return trends;
  }

  private analyzeSingleMetricTrend(metric: string, values: number[]): PerformanceTrend {
    if (values.length < 3) {
      return {
        metric,
        direction: 'stable',
        rate: 0,
        confidence: 0,
        prediction: { shortTerm: 0, mediumTerm: 0, longTerm: 0 }
      };
    }
    
    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
    
    // Determine direction
    let direction: PerformanceTrend['direction'] = 'stable';
    const avgValue = yMean;
    const relativeSlope = Math.abs(slope) / avgValue;
    
    if (relativeSlope > 0.05) { // 5% change per step
      direction = slope > 0 ? 'improving' : 'degrading';
      
      // Check for volatility
      const variance = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / yMean;
      
      if (coefficientOfVariation > 0.2) { // High variability
        direction = 'volatile';
      }
    }
    
    // Generate predictions
    const lastValue = y[y.length - 1];
    const predictions = {
      shortTerm: slope * (n + 2) + intercept, // 2 steps ahead
      mediumTerm: slope * (n + 10) + intercept, // 10 steps ahead
      longTerm: slope * (n + 50) + intercept // 50 steps ahead
    };
    
    return {
      metric,
      direction,
      rate: slope,
      confidence: Math.max(0, rSquared),
      prediction: predictions
    };
  }
}

class AnomalyDetector {
  detectAnomalies(current: PerformanceMetrics, history: PerformanceMetrics[]): string[] {
    if (history.length < 20) return [];
    
    const anomalies: string[] = [];
    const recentHistory = history.slice(-50); // Last 50 data points
    
    // Memory usage anomaly
    const memoryValues = recentHistory.map(m => m.resourceUtilization.memory);
    if (this.isAnomaly(current.resourceUtilization.memory, memoryValues)) {
      anomalies.push('memory_usage');
    }
    
    // Duration anomaly
    const durationValues = recentHistory.map(m => m.duration);
    if (this.isAnomaly(current.duration, durationValues)) {
      anomalies.push('duration');
    }
    
    // CPU usage anomaly
    const cpuValues = recentHistory.map(m => m.resourceUtilization.cpu);
    if (this.isAnomaly(current.resourceUtilization.cpu, cpuValues)) {
      anomalies.push('cpu_usage');
    }
    
    return anomalies;
  }

  private isAnomaly(value: number, historicalValues: number[]): boolean {
    if (historicalValues.length < 10) return false;
    
    const mean = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
    const variance = historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Z-score method: anomaly if more than 2 standard deviations from mean
    const zScore = Math.abs(value - mean) / stdDev;
    return zScore > 2;
  }
}

class ResourceTracker {
  private connectionCount = 0;
  private queueDepth = 0;
  
  getCurrentUtilization(): ResourceUtilization {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Calculate memory utilization
    const memoryUtilization = memUsage.heapUsed / memUsage.heapTotal;
    
    // Estimate CPU utilization (simplified)
    const cpuUtilization = Math.min((cpuUsage.user + cpuUsage.system) / 1000000, 1);
    
    return {
      cpu: cpuUtilization,
      memory: memoryUtilization,
      disk: 0.5, // Placeholder
      network: 0.3, // Placeholder
      parallelWorkers: this.getActiveWorkerCount(),
      databaseConnections: this.connectionCount
    };
  }

  getActiveConnections(): number {
    return this.connectionCount;
  }

  getQueueDepth(): number {
    return this.queueDepth;
  }

  private getActiveWorkerCount(): number {
    // In practice, this would track actual worker usage
    return Math.ceil(Math.random() * 8); // Placeholder
  }

  updateConnectionCount(delta: number): void {
    this.connectionCount = Math.max(0, this.connectionCount + delta);
  }

  updateQueueDepth(depth: number): void {
    this.queueDepth = Math.max(0, depth);
  }
}

class PredictionEngine {
  private enabled: boolean;
  private predictions: Map<string, number[]> = new Map();
  
  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  updatePredictions(metrics: PerformanceMetrics): void {
    if (!this.enabled) return;
    
    // Simple prediction logic - in practice, this could use ML models
    const memoryTrend = this.predictions.get('memory') || [];
    memoryTrend.push(metrics.resourceUtilization.memory);
    
    if (memoryTrend.length > 20) {
      memoryTrend.shift(); // Keep only recent data
    }
    
    this.predictions.set('memory', memoryTrend);
    
    // Predict next value using simple moving average
    if (memoryTrend.length >= 5) {
      const recentAvg = memoryTrend.slice(-5).reduce((sum, v) => sum + v, 0) / 5;
      const overallAvg = memoryTrend.reduce((sum, v) => sum + v, 0) / memoryTrend.length;
      
      // If recent average is significantly higher, predict continued increase
      const predictedMemory = recentAvg + (recentAvg - overallAvg) * 0.5;
      
      if (predictedMemory > 0.9) {
        console.warn('🔮 Prediction: Memory usage may exceed 90% soon');
      }
    }
  }
}

export default EnhancedPerformanceMonitor;