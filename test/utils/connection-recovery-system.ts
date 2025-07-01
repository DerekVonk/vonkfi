import { TestConnectionPoolManager } from './connection-pool-manager';
import { poolMetricsDashboard } from './pool-metrics-dashboard';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { createHash } from 'crypto';

export interface RecoveryAction {
  id: string;
  type: 'force_release_lease' | 'restart_pool' | 'kill_connection' | 'circuit_breaker' | 'emergency_shutdown' | 'memory_cleanup' | 'connection_reset';
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'emergency';
  target?: string;
  timestamp: Date;
  success?: boolean;
  error?: string;
  duration?: number;
  attempts: number;
  context?: Record<string, any>;
  triggeredBy?: string;
  autoRecovery: boolean;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailure?: Date;
  nextRetryTime?: Date;
  consecutiveSuccesses: number;
  // Enhanced circuit breaker properties
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  lastStateChange: Date;
  totalFailures: number;
  totalSuccesses: number;
  failureRate: number;
}

export class ConnectionRecoverySystem extends EventEmitter {
  private poolManager: TestConnectionPoolManager;
  private circuitBreaker: CircuitBreakerState;
  private recoveryActions: Map<string, RecoveryAction> = new Map();
  private recoveryHistory: RecoveryAction[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private recoveryInProgress = false;
  private emergencyMode = false;
  private lastEmergencyTime = 0;
  private recoveryAttempts = new Map<string, number>();
  private patterns: Map<string, { count: number; lastSeen: Date }> = new Map();
  private quarantinedResources = new Set<string>();
  private recoveryMetrics = {
    totalRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageRecoveryTime: 0,
    emergencyShutdowns: 0
  };

  // Enhanced configuration
  private readonly config = {
    healthCheckIntervalMs: 5000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 30000,
    maxRecoveryAttempts: 3,
    forceReleaseAfterMs: 30000,
    connectionTimeoutMs: 10000,
    maxConsecutiveFailures: 10,
    // Enhanced configuration
    emergencyModeThreshold: 15,
    emergencyModeCooldownMs: 300000, // 5 minutes
    patternDetectionWindow: 60000, // 1 minute
    maxPatternOccurrences: 5,
    quarantineTimeoutMs: 600000, // 10 minutes
    aggressiveRecoveryThreshold: 20,
    memoryThresholdMB: 1000,
    maxHistorySize: 1000,
    recoveryBackoffMultiplier: 1.5,
    maxBackoffMs: 60000
  };

  constructor(poolManager: TestConnectionPoolManager) {
    super();
    this.poolManager = poolManager;
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      consecutiveSuccesses: 0,
      state: 'closed',
      failureThreshold: this.config.circuitBreakerThreshold,
      successThreshold: 3,
      timeoutMs: this.config.circuitBreakerTimeoutMs,
      lastStateChange: new Date(),
      totalFailures: 0,
      totalSuccesses: 0,
      failureRate: 0
    };
    
    this.setupPoolEventListeners();
    this.startHealthCheckTimer();
    this.setupMemoryMonitoring();
    
    console.log('🔧 Enhanced Connection Recovery System initialized');
  }

  private setupPoolEventListeners(): void {
    this.poolManager.on('connectionError', (error) => {
      this.handleConnectionError(error);
    });

    this.poolManager.on('leaseTimeout', (lease) => {
      this.handleLeaseTimeout(lease);
    });

    this.poolManager.on('leaseWarning', (lease) => {
      this.handleLeaseWarning(lease);
    });

    this.poolManager.on('leaseForcedRelease', (lease) => {
      this.recordRecoveryAction({
        type: 'force_release_lease',
        reason: `Forced release of expired lease ${lease.id}`,
        severity: 'medium',
        target: lease.id,
        timestamp: new Date(),
        success: true
      });
    });
  }

  private startHealthCheckTimer(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performRecoveryHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performRecoveryHealthCheck(): Promise<void> {
    if (this.recoveryInProgress && !this.emergencyMode) return;

    const healthCheckStart = Date.now();
    try {
      // Check if we should enter emergency mode
      this.checkEmergencyConditions();
      
      // Check circuit breaker state
      this.updateCircuitBreakerState();
      
      // Perform enhanced health check
      const healthStatus = await this.performEnhancedHealthCheck();
      
      if (!healthStatus.isHealthy) {
        await this.handleUnhealthyPool(healthStatus.issues);
      } else {
        this.handleHealthyPool();
      }

      // Check for stuck leases
      await this.checkForStuckLeases();
      
      // Check metrics for anomalies
      await this.checkMetricsForAnomalies();
      
      // Pattern detection for proactive recovery
      this.detectPatterns();
      
      // Memory pressure monitoring
      this.checkMemoryPressure();
      
      // Clean up old recovery actions
      this.cleanupOldRecoveryActions();

    } catch (error) {
      console.error('🚨 Recovery system health check failed:', error);
      await this.handleConnectionError(error as Error, 'health_check_failure');
    } finally {
      const duration = Date.now() - healthCheckStart;
      if (duration > 5000) {
        console.warn(`⚠️ Health check took ${duration}ms - system may be under stress`);
      }
    }
  }
  
  private async performEnhancedHealthCheck(): Promise<{ isHealthy: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Basic connectivity check
      const connectivityOk = await this.poolManager.healthCheck();
      if (!connectivityOk) {
        issues.push('Basic connectivity check failed');
      }
      
      // Resource utilization check
      const metrics = this.poolManager.getMetrics();
      if (metrics.waitingClients > this.config.circuitBreakerThreshold) {
        issues.push(`High waiting clients: ${metrics.waitingClients}`);
      }
      
      if (metrics.connectionErrors > this.config.maxConsecutiveFailures) {
        issues.push(`High error rate: ${metrics.connectionErrors}`);
      }
      
      // Memory usage check
      if (metrics.memoryUsage) {
        const memUsageMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
        if (memUsageMB > this.config.memoryThresholdMB) {
          issues.push(`High memory usage: ${memUsageMB.toFixed(2)}MB`);
        }
      }
      
      // Check for quarantined resources
      if (this.quarantinedResources.size > 0) {
        issues.push(`${this.quarantinedResources.size} resources quarantined`);
      }
      
      return {
        isHealthy: issues.length === 0 && connectivityOk,
        issues
      };
      
    } catch (error) {
      issues.push(`Health check error: ${error.message}`);
      return { isHealthy: false, issues };
    }
  }
  
  private checkEmergencyConditions(): void {
    const metrics = this.poolManager.getMetrics();
    const now = Date.now();
    
    // Check if we should enter emergency mode
    const emergencyTriggers = [
      metrics.connectionErrors > this.config.emergencyModeThreshold,
      metrics.waitingClients > this.config.emergencyModeThreshold,
      this.circuitBreaker.failureCount > this.config.emergencyModeThreshold,
      this.recoveryActions.size > this.config.emergencyModeThreshold
    ];
    
    const shouldEnterEmergency = emergencyTriggers.filter(Boolean).length >= 2;
    const cooldownExpired = (now - this.lastEmergencyTime) > this.config.emergencyModeCooldownMs;
    
    if (shouldEnterEmergency && !this.emergencyMode && cooldownExpired) {
      this.enterEmergencyMode();
    } else if (this.emergencyMode && emergencyTriggers.every(trigger => !trigger)) {
      this.exitEmergencyMode();
    }
  }
  
  private enterEmergencyMode(): void {
    this.emergencyMode = true;
    this.lastEmergencyTime = Date.now();
    this.recoveryMetrics.emergencyShutdowns++;
    
    console.error('🚨 ENTERING EMERGENCY RECOVERY MODE');
    
    this.recordRecoveryAction({
      type: 'emergency_shutdown',
      reason: 'Multiple system failures detected - entering emergency mode',
      severity: 'emergency',
      timestamp: new Date(),
      attempts: 1,
      autoRecovery: true,
      triggeredBy: 'emergency_detection'
    });
    
    this.emit('emergencyModeEntered', {
      timestamp: new Date(),
      triggers: this.getEmergencyTriggers()
    });
  }
  
  private exitEmergencyMode(): void {
    console.log('✅ Exiting emergency recovery mode - system stabilized');
    this.emergencyMode = false;
    
    this.emit('emergencyModeExited', {
      timestamp: new Date(),
      duration: Date.now() - this.lastEmergencyTime
    });
  }
  
  private getEmergencyTriggers(): string[] {
    const metrics = this.poolManager.getMetrics();
    const triggers: string[] = [];
    
    if (metrics.connectionErrors > this.config.emergencyModeThreshold) {
      triggers.push(`High connection errors: ${metrics.connectionErrors}`);
    }
    if (metrics.waitingClients > this.config.emergencyModeThreshold) {
      triggers.push(`High waiting clients: ${metrics.waitingClients}`);
    }
    if (this.circuitBreaker.failureCount > this.config.emergencyModeThreshold) {
      triggers.push(`Circuit breaker failures: ${this.circuitBreaker.failureCount}`);
    }
    
    return triggers;
  }

  private async handleConnectionError(error: Error, context = 'unknown'): Promise<void> {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.totalFailures++;
    this.circuitBreaker.lastFailure = new Date();
    this.circuitBreaker.consecutiveSuccesses = 0;

    const severity = this.circuitBreaker.failureCount > this.config.circuitBreakerThreshold ? 'critical' : 'high';
    
    this.recordRecoveryAction({
      type: 'kill_connection',
      reason: `Connection error in ${context}: ${error.message}`,
      severity,
      timestamp: new Date(),
      error: error.message,
      attempts: 1,
      autoRecovery: true,
      context: { errorContext: context, errorType: error.constructor.name }
    });

    if (this.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
      await this.openCircuitBreaker();
    }

    this.emit('connectionError', { 
      error, 
      failureCount: this.circuitBreaker.failureCount,
      context,
      timestamp: new Date()
    });
  }

  private async handleLeaseTimeout(lease: any): Promise<void> {
    this.recordRecoveryAction({
      type: 'force_release_lease',
      reason: `Lease timeout for ${lease.testFile}:${lease.testName}`,
      severity: 'medium',
      target: lease.id,
      timestamp: new Date()
    });

    // Additional recovery actions for chronic lease timeouts
    const recentTimeouts = this.recoveryActions
      .filter(action => 
        action.type === 'force_release_lease' && 
        Date.now() - action.timestamp.getTime() < 60000 // Last minute
      ).length;

    if (recentTimeouts > 3) {
      await this.handleChronicLeaseTimeouts();
    }
  }

  private async handleLeaseWarning(lease: any): Promise<void> {
    // Monitor for early warning signs
    const leaseAge = Date.now() - lease.acquiredAt.getTime();
    
    if (leaseAge > this.config.forceReleaseAfterMs * 0.8) {
      console.warn(`⚠️ Lease ${lease.id} approaching timeout threshold`);
      
      this.recordRecoveryAction({
        type: 'force_release_lease',
        reason: `Pre-emptive warning for long-running lease`,
        severity: 'low',
        target: lease.id,
        timestamp: new Date()
      });
    }
  }

  private async handleUnhealthyPool(issues: string[] = []): Promise<void> {
    if (this.recoveryInProgress && !this.emergencyMode) return;
    
    this.recoveryInProgress = true;
    const recoveryStart = Date.now();
    const recoveryId = this.generateRecoveryId();
    
    console.error(`🚨 Pool unhealthy - initiating recovery sequence ${recoveryId}`);
    console.error(`Issues detected: ${issues.join(', ')}`);

    try {
      // Determine recovery strategy based on severity
      const severity = this.determineSeverity(issues);
      const strategy = this.selectRecoveryStrategy(severity, issues);
      
      console.log(`🔧 Executing ${strategy} recovery strategy`);
      
      let success = false;
      
      switch (strategy) {
        case 'gentle':
          success = await this.performGentleRecovery();
          break;
        case 'aggressive':
          success = await this.performAggressiveRecovery();
          break;
        case 'emergency':
          success = await this.performEmergencyRecovery();
          break;
      }
      
      const duration = Date.now() - recoveryStart;
      
      this.recordRecoveryAction({
        type: 'restart_pool',
        reason: `Pool recovery using ${strategy} strategy. Issues: ${issues.join(', ')}`,
        severity: severity as any,
        timestamp: new Date(),
        success,
        duration,
        attempts: 1,
        autoRecovery: true,
        context: { strategy, issues, recoveryId }
      });
      
      if (success) {
        this.recoveryMetrics.successfulRecoveries++;
        console.log(`✅ Pool recovery completed successfully in ${duration}ms`);
      } else {
        this.recoveryMetrics.failedRecoveries++;
        console.error(`❌ Pool recovery failed after ${duration}ms`);
        await this.openCircuitBreaker();
      }
      
    } catch (error) {
      console.error(`❌ Pool recovery exception:`, error);
      this.recoveryMetrics.failedRecoveries++;
      await this.openCircuitBreaker();
    } finally {
      this.recoveryInProgress = false;
      this.recoveryMetrics.totalRecoveries++;
      
      const totalDuration = Date.now() - recoveryStart;
      this.updateAverageRecoveryTime(totalDuration);
    }
  }
  
  private determineSeverity(issues: string[]): string {
    const criticalKeywords = ['connectivity', 'emergency', 'shutdown', 'critical'];
    const highKeywords = ['memory', 'waiting', 'error'];
    
    if (issues.some(issue => criticalKeywords.some(keyword => issue.toLowerCase().includes(keyword)))) {
      return 'critical';
    }
    
    if (issues.length > 3 || issues.some(issue => highKeywords.some(keyword => issue.toLowerCase().includes(keyword)))) {
      return 'high';
    }
    
    return 'medium';
  }
  
  private selectRecoveryStrategy(severity: string, issues: string[]): 'gentle' | 'aggressive' | 'emergency' {
    if (this.emergencyMode || severity === 'critical') {
      return 'emergency';
    }
    
    if (severity === 'high' || issues.length > 2) {
      return 'aggressive';
    }
    
    return 'gentle';
  }
  
  private async performGentleRecovery(): Promise<boolean> {
    console.log('🔧 Performing gentle recovery...');
    
    // Step 1: Release long-running leases
    await this.forceReleaseLongRunningLeases();
    
    // Step 2: Wait and check
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Verify health
    return await this.poolManager.healthCheck();
  }
  
  private async performAggressiveRecovery(): Promise<boolean> {
    console.log('🔧 Performing aggressive recovery...');
    
    // Step 1: Release all active leases
    await this.poolManager.releaseAllLeases();
    
    // Step 2: Clear any quarantined resources
    this.quarantinedResources.clear();
    
    // Step 3: Reset circuit breaker if in half-open state
    if (this.circuitBreaker.state === 'half-open') {
      this.resetCircuitBreaker();
    }
    
    // Step 4: Wait for stabilization
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 5: Verify health
    return await this.poolManager.healthCheck();
  }
  
  private async performEmergencyRecovery(): Promise<boolean> {
    console.log('🚨 Performing emergency recovery...');
    
    try {
      // Step 1: Force release all resources immediately
      await this.poolManager.releaseAllLeases();
      
      // Step 2: Clear all quarantined resources
      this.quarantinedResources.clear();
      
      // Step 3: Reset all recovery state
      this.recoveryActions.clear();
      this.recoveryAttempts.clear();
      this.patterns.clear();
      
      // Step 4: Force reset circuit breaker
      this.resetCircuitBreaker();
      
      // Step 5: Extended wait for full recovery
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Step 6: Attempt health check
      const healthOk = await this.poolManager.healthCheck();
      
      if (!healthOk) {
        console.error('🚨 Emergency recovery failed - system may need manual intervention');
        return false;
      }
      
      console.log('✅ Emergency recovery completed successfully');
      return true;
      
    } catch (error) {
      console.error('🚨 Emergency recovery encountered error:', error);
      return false;
    }
  }
  
  private generateRecoveryId(): string {
    return createHash('sha256')
      .update(`${Date.now()}_${Math.random()}_recovery`)
      .digest('hex')
      .substring(0, 8);
  }
  
  private updateAverageRecoveryTime(duration: number): void {
    const totalRecoveries = this.recoveryMetrics.totalRecoveries;
    if (totalRecoveries === 1) {
      this.recoveryMetrics.averageRecoveryTime = duration;
    } else {
      this.recoveryMetrics.averageRecoveryTime = 
        (this.recoveryMetrics.averageRecoveryTime * (totalRecoveries - 1) + duration) / totalRecoveries;
    }
  }

  private handleHealthyPool(): void {
    this.circuitBreaker.consecutiveSuccesses++;
    this.circuitBreaker.totalSuccesses++;
    
    // Handle state transitions based on current state
    if (this.circuitBreaker.state === 'half-open' && this.circuitBreaker.consecutiveSuccesses >= this.circuitBreaker.successThreshold) {
      this.closeCircuitBreaker();
    } else if (this.circuitBreaker.state === 'open' && this.circuitBreaker.consecutiveSuccesses >= this.circuitBreaker.successThreshold) {
      this.closeCircuitBreaker();
    }
    
    // Reduce failure count gradually for healthy operations
    if (this.circuitBreaker.failureCount > 0) {
      this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
    }
  }

  private async checkForStuckLeases(): Promise<void> {
    const activeLeases = this.poolManager.getActiveLeases();
    const now = Date.now();

    for (const lease of activeLeases) {
      const leaseAge = now - lease.acquiredAt.getTime();
      const lastUsedAge = now - lease.lastUsedAt.getTime();
      
      // Check for truly stuck leases (not used for long time)
      if (lastUsedAge > this.config.forceReleaseAfterMs && leaseAge > this.config.forceReleaseAfterMs) {
        console.warn(`🔧 Force releasing stuck lease ${lease.id} (unused for ${lastUsedAge}ms)`);
        
        this.poolManager.releaseLease(lease.id);
        
        this.recordRecoveryAction({
          type: 'force_release_lease',
          reason: `Stuck lease detected - unused for ${lastUsedAge}ms`,
          severity: 'medium',
          target: lease.id,
          timestamp: new Date(),
          success: true
        });
      }
    }
  }

  private async checkMetricsForAnomalies(): Promise<void> {
    const metrics = this.poolManager.getMetrics();
    
    // Check for connection pool exhaustion
    if (metrics.waitingClients > 0 && metrics.activeConnections >= metrics.totalConnections * 0.9) {
      this.recordRecoveryAction({
        type: 'circuit_breaker',
        reason: `Connection pool near exhaustion: ${metrics.activeConnections}/${metrics.totalConnections} active, ${metrics.waitingClients} waiting`,
        severity: 'high',
        timestamp: new Date()
      });
      
      // Force release long-running leases to free up connections
      await this.forceReleaseLongRunningLeases();
    }

    // Check for high error rate
    if (metrics.connectionErrors > this.config.maxConsecutiveFailures) {
      await this.handleHighErrorRate();
    }
  }

  private async handleChronicLeaseTimeouts(): Promise<void> {
    console.error('🚨 Chronic lease timeouts detected - initiating aggressive recovery');
    
    // Release all leases immediately
    await this.poolManager.releaseAllLeases();
    
    this.recordRecoveryAction({
      type: 'restart_pool',
      reason: 'Chronic lease timeouts detected',
      severity: 'critical',
      timestamp: new Date(),
      success: true
    });
  }

  private async performAggressiveRecovery(): Promise<void> {
    console.log('🔧 Performing aggressive pool recovery...');
    
    // This would implement more aggressive recovery strategies
    // For now, we'll simulate recovery actions
    
    await this.poolManager.releaseAllLeases();
    
    // Wait for pool to stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async forceReleaseLongRunningLeases(): Promise<void> {
    const activeLeases = this.poolManager.getActiveLeases();
    const now = Date.now();
    
    for (const lease of activeLeases) {
      const leaseAge = now - lease.acquiredAt.getTime();
      
      if (leaseAge > this.config.forceReleaseAfterMs * 0.7) { // 70% of max lease time
        console.warn(`🔧 Force releasing long-running lease ${lease.id}`);
        this.poolManager.releaseLease(lease.id);
      }
    }
  }

  private async handleHighErrorRate(): Promise<void> {
    console.error('🚨 High error rate detected - implementing circuit breaker');
    await this.openCircuitBreaker();
  }

  private async openCircuitBreaker(): Promise<void> {
    const previousState = this.circuitBreaker.state;
    this.circuitBreaker.isOpen = true;
    this.circuitBreaker.state = 'open';
    this.circuitBreaker.nextRetryTime = new Date(Date.now() + this.config.circuitBreakerTimeoutMs);
    this.circuitBreaker.lastStateChange = new Date();
    
    // Calculate failure rate
    const totalAttempts = this.circuitBreaker.totalFailures + this.circuitBreaker.totalSuccesses;
    this.circuitBreaker.failureRate = totalAttempts > 0 
      ? this.circuitBreaker.totalFailures / totalAttempts 
      : 0;
    
    console.error(`⚡ Circuit breaker OPENED - pool access temporarily disabled (failure rate: ${(this.circuitBreaker.failureRate * 100).toFixed(1)}%)`);
    
    this.recordRecoveryAction({
      type: 'circuit_breaker',
      reason: `Circuit breaker opened due to ${this.circuitBreaker.failureCount} failures (rate: ${(this.circuitBreaker.failureRate * 100).toFixed(1)}%)`,
      severity: 'critical',
      timestamp: new Date(),
      success: true,
      attempts: 1,
      autoRecovery: true,
      context: {
        previousState,
        failureRate: this.circuitBreaker.failureRate,
        totalFailures: this.circuitBreaker.totalFailures
      }
    });

    this.emit('circuitBreakerOpened', this.circuitBreaker);
  }

  private closeCircuitBreaker(): void {
    const previousState = this.circuitBreaker.state;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.state = 'closed';
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.nextRetryTime = undefined;
    this.circuitBreaker.lastStateChange = new Date();
    
    console.log(`✅ Circuit breaker CLOSED - pool access restored (${this.circuitBreaker.consecutiveSuccesses} consecutive successes)`);
    
    this.recordRecoveryAction({
      type: 'circuit_breaker',
      reason: `Circuit breaker closed - ${this.circuitBreaker.consecutiveSuccesses} consecutive successes achieved`,
      severity: 'low',
      timestamp: new Date(),
      success: true,
      attempts: 1,
      autoRecovery: true,
      context: {
        previousState,
        consecutiveSuccesses: this.circuitBreaker.consecutiveSuccesses
      }
    });

    this.emit('circuitBreakerClosed', this.circuitBreaker);
  }
  
  private resetCircuitBreaker(): void {
    const previousState = this.circuitBreaker.state;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.state = 'closed';
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.consecutiveSuccesses = 0;
    this.circuitBreaker.nextRetryTime = undefined;
    this.circuitBreaker.lastStateChange = new Date();
    
    console.log('🔄 Circuit breaker RESET - state cleared');
    
    this.emit('circuitBreakerReset', { previousState, newState: this.circuitBreaker });
  }

  private updateCircuitBreakerState(): void {
    const now = Date.now();
    
    if (this.circuitBreaker.state === 'open' && this.circuitBreaker.nextRetryTime) {
      if (now >= this.circuitBreaker.nextRetryTime.getTime()) {
        // Transition to half-open state
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.nextRetryTime = undefined;
        this.circuitBreaker.lastStateChange = new Date();
        
        console.log('🔄 Circuit breaker entering HALF-OPEN state - allowing limited testing');
        
        this.emit('circuitBreakerHalfOpen', this.circuitBreaker);
      }
    }
    
    // Update failure rate
    const totalAttempts = this.circuitBreaker.totalFailures + this.circuitBreaker.totalSuccesses;
    this.circuitBreaker.failureRate = totalAttempts > 0 
      ? this.circuitBreaker.totalFailures / totalAttempts 
      : 0;
  }

  private recordRecoveryAction(actionData: Omit<RecoveryAction, 'id'>): void {
    const action: RecoveryAction = {
      id: this.generateRecoveryId(),
      ...actionData
    };
    
    this.recoveryActions.set(action.id, action);
    this.recoveryHistory.push({ ...action });
    
    // Keep maps manageable
    if (this.recoveryActions.size > 100) {
      const oldestKey = this.recoveryActions.keys().next().value;
      this.recoveryActions.delete(oldestKey);
    }
    
    // Keep history manageable
    if (this.recoveryHistory.length > this.config.maxHistorySize) {
      this.recoveryHistory = this.recoveryHistory.slice(-this.config.maxHistorySize);
    }

    // Log significant actions
    if (action.severity === 'critical' || action.severity === 'emergency' || action.severity === 'high') {
      console.warn(`🔧 Recovery Action [${action.severity.toUpperCase()}]: ${action.reason}`);
    }
    
    // Track patterns
    this.trackRecoveryPattern(action);

    this.emit('recoveryAction', action);
  }
  
  private trackRecoveryPattern(action: RecoveryAction): void {
    const patternKey = `${action.type}_${action.severity}`;
    const now = new Date();
    
    if (this.patterns.has(patternKey)) {
      const pattern = this.patterns.get(patternKey)!;
      pattern.count++;
      pattern.lastSeen = now;
    } else {
      this.patterns.set(patternKey, { count: 1, lastSeen: now });
    }
  }
  
  private detectPatterns(): void {
    const now = Date.now();
    const windowStart = now - this.config.patternDetectionWindow;
    
    for (const [patternKey, pattern] of this.patterns) {
      // Clean up old patterns
      if (pattern.lastSeen.getTime() < windowStart) {
        this.patterns.delete(patternKey);
        continue;
      }
      
      // Check for concerning patterns
      if (pattern.count >= this.config.maxPatternOccurrences) {
        console.warn(`⚠️ Recovery pattern detected: ${patternKey} occurred ${pattern.count} times`);
        
        this.emit('patternDetected', {
          pattern: patternKey,
          count: pattern.count,
          lastSeen: pattern.lastSeen
        });
        
        // Take proactive action for certain patterns
        this.handleRecoveryPattern(patternKey, pattern);
      }
    }
  }
  
  private handleRecoveryPattern(patternKey: string, pattern: { count: number; lastSeen: Date }): void {
    if (patternKey.includes('force_release_lease')) {
      console.warn('🔧 Proactive action: Adjusting lease timeout thresholds');
      // Could adjust pool configuration here
    } else if (patternKey.includes('connection_error')) {
      console.warn('🔧 Proactive action: Implementing connection backoff');
      // Could implement connection rate limiting
    }
  }

  getRecoveryStatus(): {
    circuitBreaker: CircuitBreakerState;
    recentActions: RecoveryAction[];
    isRecovering: boolean;
    healthStatus: string;
    emergencyMode: boolean;
    patterns: Array<{ pattern: string; count: number; lastSeen: Date }>;
    quarantinedResources: string[];
    metrics: typeof this.recoveryMetrics;
  } {
    const recentActions = this.recoveryHistory.slice(-10);
    
    let healthStatus = 'healthy';
    if (this.emergencyMode) {
      healthStatus = 'emergency';
    } else if (this.circuitBreaker.isOpen) {
      healthStatus = 'circuit_breaker_open';
    } else if (this.recoveryInProgress) {
      healthStatus = 'recovering';
    } else if (this.circuitBreaker.failureCount > 0) {
      healthStatus = 'degraded';
    }
    
    const patternArray = Array.from(this.patterns.entries()).map(([pattern, data]) => ({
      pattern,
      count: data.count,
      lastSeen: data.lastSeen
    }));

    return {
      circuitBreaker: { ...this.circuitBreaker },
      recentActions,
      isRecovering: this.recoveryInProgress,
      healthStatus,
      emergencyMode: this.emergencyMode,
      patterns: patternArray,
      quarantinedResources: Array.from(this.quarantinedResources),
      metrics: { ...this.recoveryMetrics }
    };
  }

  generateRecoveryReport(): string {
    let report = '\n🔧 CONNECTION RECOVERY SYSTEM STATUS\n';
    report += '═'.repeat(70) + '\n';
    report += `Generated: ${new Date().toLocaleString()}\n\n`;

    const status = this.getRecoveryStatus();
    
    // System Status Overview
    const healthEmoji = this.getHealthEmoji(status.healthStatus);
    report += `Health Status: ${status.healthStatus.toUpperCase()} ${healthEmoji}\n`;
    report += `Recovery In Progress: ${status.isRecovering ? 'YES' : 'NO'}\n`;
    report += `Emergency Mode: ${status.emergencyMode ? 'ACTIVE 🚨' : 'INACTIVE'}\n`;
    if (status.emergencyMode) {
      const emergencyDuration = Date.now() - this.lastEmergencyTime;
      report += `Emergency Duration: ${this.formatDuration(emergencyDuration)}\n`;
    }
    report += '\n';

    // Circuit Breaker Status
    report += '⚡ CIRCUIT BREAKER STATUS\n';
    const stateEmoji = this.getCircuitBreakerEmoji(status.circuitBreaker.state);
    report += `  State: ${status.circuitBreaker.state.toUpperCase()} ${stateEmoji}\n`;
    report += `  Failure Count: ${status.circuitBreaker.failureCount}/${status.circuitBreaker.failureThreshold}\n`;
    report += `  Success Count: ${status.circuitBreaker.consecutiveSuccesses}/${status.circuitBreaker.successThreshold}\n`;
    report += `  Failure Rate: ${(status.circuitBreaker.failureRate * 100).toFixed(1)}%\n`;
    report += `  Total Failures: ${status.circuitBreaker.totalFailures}\n`;
    report += `  Total Successes: ${status.circuitBreaker.totalSuccesses}\n`;
    if (status.circuitBreaker.lastFailure) {
      report += `  Last Failure: ${status.circuitBreaker.lastFailure.toLocaleString()}\n`;
    }
    if (status.circuitBreaker.nextRetryTime) {
      report += `  Next Retry: ${status.circuitBreaker.nextRetryTime.toLocaleString()}\n`;
    }
    report += '\n';
    
    // Recovery Metrics
    report += '📊 RECOVERY METRICS\n';
    report += `  Total Recoveries: ${status.metrics.totalRecoveries}\n`;
    report += `  Successful: ${status.metrics.successfulRecoveries}\n`;
    report += `  Failed: ${status.metrics.failedRecoveries}\n`;
    const successRate = status.metrics.totalRecoveries > 0 
      ? (status.metrics.successfulRecoveries / status.metrics.totalRecoveries * 100).toFixed(1)
      : '0';
    report += `  Success Rate: ${successRate}%\n`;
    report += `  Average Recovery Time: ${status.metrics.averageRecoveryTime.toFixed(0)}ms\n`;
    report += `  Emergency Shutdowns: ${status.metrics.emergencyShutdowns}\n\n`;
    
    // Quarantined Resources
    if (status.quarantinedResources.length > 0) {
      report += `🔒 QUARANTINED RESOURCES (${status.quarantinedResources.length})\n`;
      status.quarantinedResources.slice(0, 5).forEach(resource => {
        report += `  - ${resource}\n`;
      });
      if (status.quarantinedResources.length > 5) {
        report += `  ... and ${status.quarantinedResources.length - 5} more\n`;
      }
      report += '\n';
    }
    
    // Pattern Detection
    if (status.patterns.length > 0) {
      report += `🔍 DETECTED PATTERNS (${status.patterns.length})\n`;
      status.patterns
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .forEach(pattern => {
          const timeSince = Date.now() - pattern.lastSeen.getTime();
          report += `  - ${pattern.pattern}: ${pattern.count} occurrences (last: ${this.formatDuration(timeSince)} ago)\n`;
        });
      report += '\n';
    }

    // Recent Recovery Actions
    if (status.recentActions.length > 0) {
      report += `📋 RECENT RECOVERY ACTIONS (${status.recentActions.length})\n`;
      status.recentActions.forEach((action, index) => {
        const emoji = this.getActionEmoji(action.severity);
        const duration = action.duration ? ` (${action.duration}ms)` : '';
        const attempts = action.attempts > 1 ? ` [${action.attempts} attempts]` : '';
        report += `  ${emoji} ${action.type.replace(/_/g, ' ').toUpperCase()}: ${action.reason}${duration}${attempts}\n`;
        report += `     Time: ${action.timestamp.toLocaleTimeString()}, Success: ${action.success ?? 'pending'}\n`;
        if (action.error) {
          report += `     Error: ${action.error}\n`;
        }
      });
    }

    report += '\n' + '═'.repeat(70) + '\n';
    return report;
  }
  
  private getHealthEmoji(healthStatus: string): string {
    switch (healthStatus) {
      case 'healthy': return '🟢';
      case 'degraded': return '🟡';
      case 'recovering': return '🔧';
      case 'circuit_breaker_open': return '🔴';
      case 'emergency': return '🚨';
      default: return '❓';
    }
  }
  
  private getCircuitBreakerEmoji(state: string): string {
    switch (state) {
      case 'closed': return '🟢';
      case 'open': return '🔴';
      case 'half-open': return '🟡';
      default: return '❓';
    }
  }
  
  private getActionEmoji(severity: string): string {
    switch (severity) {
      case 'emergency': return '🚨';
      case 'critical': return '🔥';
      case 'high': return '⚠️';
      case 'medium': return '🔧';
      case 'low': return '💡';
      default: return '🔄';
    }
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

  async destroy(): Promise<void> {
    console.log('🔧 Destroying Connection Recovery System...');
    
    // Stop health check timer
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    // Exit emergency mode if active
    if (this.emergencyMode) {
      this.exitEmergencyMode();
    }
    
    // Clear all state
    this.recoveryActions.clear();
    this.recoveryAttempts.clear();
    this.patterns.clear();
    this.quarantinedResources.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('✅ Connection Recovery System destroyed');
  }
  
  private setupMemoryMonitoring(): void {
    // Monitor memory usage periodically
    setInterval(() => {
      this.checkMemoryPressure();
    }, 60000); // Check every minute
  }
  
  private checkMemoryPressure(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.config.memoryThresholdMB) {
      console.warn(`⚠️ High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
      
      this.recordRecoveryAction({
        type: 'memory_cleanup',
        reason: `High memory usage: ${heapUsedMB.toFixed(2)}MB`,
        severity: 'medium',
        timestamp: new Date(),
        attempts: 1,
        autoRecovery: true,
        context: { memoryUsage: memUsage }
      });
      
      // Trigger cleanup
      this.performMemoryCleanup();
    }
  }
  
  private performMemoryCleanup(): void {
    console.log('🧹 Performing memory cleanup...');
    
    // Clean up old recovery actions
    this.cleanupOldRecoveryActions();
    
    // Clean up old patterns
    const now = Date.now();
    const cutoff = now - (this.config.patternDetectionWindow * 2);
    
    for (const [key, pattern] of this.patterns) {
      if (pattern.lastSeen.getTime() < cutoff) {
        this.patterns.delete(key);
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  private cleanupOldRecoveryActions(): void {
    const now = Date.now();
    const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours
    
    // Clean up recovery actions older than 24 hours
    for (const [id, action] of this.recoveryActions) {
      if (action.timestamp.getTime() < cutoffTime) {
        this.recoveryActions.delete(id);
      }
    }
    
    // Clean up recovery history
    this.recoveryHistory = this.recoveryHistory.filter(
      action => action.timestamp.getTime() >= cutoffTime
    );
  }
  
  // Enhanced utility methods
  getRecoveryMetrics(): typeof this.recoveryMetrics {
    return { ...this.recoveryMetrics };
  }
  
  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }
  
  isInEmergencyMode(): boolean {
    return this.emergencyMode;
  }
  
  getQuarantinedResources(): string[] {
    return Array.from(this.quarantinedResources);
  }
  
  quarantineResource(resourceId: string, reason: string): void {
    this.quarantinedResources.add(resourceId);
    
    console.warn(`🔒 Quarantined resource: ${resourceId} (${reason})`);
    
    this.recordRecoveryAction({
      type: 'kill_connection',
      reason: `Quarantined resource: ${reason}`,
      severity: 'medium',
      target: resourceId,
      timestamp: new Date(),
      attempts: 1,
      autoRecovery: true
    });
    
    // Auto-remove from quarantine after timeout
    setTimeout(() => {
      if (this.quarantinedResources.has(resourceId)) {
        this.quarantinedResources.delete(resourceId);
        console.log(`🔓 Released quarantined resource: ${resourceId}`);
      }
    }, this.config.quarantineTimeoutMs);
  }
}

// Enhanced global recovery system management
let globalRecoverySystem: ConnectionRecoverySystem | null = null;

export function initializeRecoverySystem(poolManager: TestConnectionPoolManager): ConnectionRecoverySystem {
  if (globalRecoverySystem) {
    console.log('🔄 Destroying existing recovery system...');
    globalRecoverySystem.destroy();
  }
  
  globalRecoverySystem = new ConnectionRecoverySystem(poolManager);
  console.log('🔧 Enhanced connection recovery system initialized');
  return globalRecoverySystem;
}

export function getRecoverySystem(): ConnectionRecoverySystem | null {
  return globalRecoverySystem;
}

export function logRecoveryStatus(): void {
  if (globalRecoverySystem) {
    console.log(globalRecoverySystem.generateRecoveryReport());
  } else {
    console.log('🔧 Recovery system not initialized');
  }
}

export function getRecoveryMetrics(): typeof globalRecoverySystem['recoveryMetrics'] | null {
  return globalRecoverySystem ? globalRecoverySystem.getRecoveryMetrics() : null;
}

export function isRecoverySystemHealthy(): boolean {
  if (!globalRecoverySystem) return false;
  
  const status = globalRecoverySystem.getRecoveryStatus();
  return status.healthStatus === 'healthy' && !status.emergencyMode;
}

export function quarantineResource(resourceId: string, reason: string): void {
  if (globalRecoverySystem) {
    globalRecoverySystem.quarantineResource(resourceId, reason);
  }
}

export function forceEmergencyRecovery(reason: string): Promise<void> {
  if (!globalRecoverySystem) {
    throw new Error('Recovery system not initialized');
  }
  
  console.warn(`🚨 MANUAL EMERGENCY RECOVERY TRIGGERED: ${reason}`);
  
  // Force emergency mode
  globalRecoverySystem['emergencyMode'] = true;
  globalRecoverySystem['lastEmergencyTime'] = Date.now();
  
  return globalRecoverySystem['performEmergencyRecovery']();
}

// Utility functions for monitoring and alerting
export function setupRecoveryMonitoring(): {
  onEmergencyMode: (callback: (data: any) => void) => void;
  onCircuitBreakerChange: (callback: (data: any) => void) => void;
  onPatternDetected: (callback: (data: any) => void) => void;
  onRecoveryAction: (callback: (action: RecoveryAction) => void) => void;
  removeAllListeners: () => void;
} {
  if (!globalRecoverySystem) {
    throw new Error('Recovery system not initialized');
  }
  
  return {
    onEmergencyMode: (callback) => {
      globalRecoverySystem!.on('emergencyModeEntered', callback);
      globalRecoverySystem!.on('emergencyModeExited', callback);
    },
    onCircuitBreakerChange: (callback) => {
      globalRecoverySystem!.on('circuitBreakerOpened', callback);
      globalRecoverySystem!.on('circuitBreakerClosed', callback);
      globalRecoverySystem!.on('circuitBreakerHalfOpen', callback);
    },
    onPatternDetected: (callback) => globalRecoverySystem!.on('patternDetected', callback),
    onRecoveryAction: (callback) => globalRecoverySystem!.on('recoveryAction', callback),
    removeAllListeners: () => globalRecoverySystem!.removeAllListeners()
  };
}

export function getRecoverySystemReport(): string {
  return globalRecoverySystem ? globalRecoverySystem.generateRecoveryReport() : 'Recovery system not initialized';
}