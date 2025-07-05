import pg from 'pg';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { createHash } from 'crypto';

// Enhanced error types for better error handling
export class ConnectionPoolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly isRetryable: boolean = false,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ConnectionPoolError';
  }
}

export class LeaseError extends ConnectionPoolError {
  constructor(message: string, public readonly leaseId?: string, context?: Record<string, any>) {
    super(message, 'LEASE_ERROR', false, context);
    this.name = 'LeaseError';
  }
}

export class PoolExhaustionError extends ConnectionPoolError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'POOL_EXHAUSTION', true, context);
    this.name = 'PoolExhaustionError';
  }
}

export interface ConnectionLease {
  id: string;
  testFile: string;
  testName: string;
  acquiredAt: Date;
  lastUsedAt: Date;
  client: pg.PoolClient;
  isReleased: boolean;
  queryCount: number;
  tags: string[];
  priority: 'low' | 'normal' | 'high';
  timeoutHandle?: NodeJS.Timeout;
  // Enhanced fields for better tracking
  processId?: number;
  stackTrace?: string;
  expectedReleaseTime?: Date;
  warningCount: number;
  hasActiveTransaction: boolean;
}

export interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  acquiredLeases: number;
  totalLeases: number;
  averageLeaseTime: number;
  connectionErrors: number;
  lastError?: Error;
  // Enhanced metrics
  peakConnections: number;
  totalQueriesExecuted: number;
  averageQueryTime: number;
  slowQueries: number;
  lastHealthCheck: Date;
  uptimeMs: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  // Additional security and performance metrics
  failedConnectionAttempts: number;
  securityViolations: number;
  resourceLeaks: number;
  transactionTimeouts: number;
  deadlockCount: number;
  queueWaitTime: number;
  connectionTurnover: number;
}

export interface ConnectionPoolOptions extends pg.PoolConfig {
  maxLeaseTime?: number;
  healthCheckInterval?: number;
  leaseTimeoutAlert?: number;
  enableMetrics?: boolean;
  // Enhanced configuration options
  enableQueryLogging?: boolean;
  slowQueryThreshold?: number;
  maxConcurrentQueries?: number;
  connectionRetryAttempts?: number;
  connectionRetryDelay?: number;
  enablePoolWarmup?: boolean;
  warmupConnectionCount?: number;
  enableGracefulShutdown?: boolean;
  shutdownTimeoutMs?: number;
  enableResourceMonitoring?: boolean;
}

export class TestConnectionPoolManager extends EventEmitter {
  private pool: pg.Pool;
  private leases: Map<string, ConnectionLease> = new Map();
  private metrics: PoolMetrics;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsHistory: PoolMetrics[] = [];
  private options: Required<ConnectionPoolOptions>;
  private readonly startTime: Date;
  private isDestroyed: boolean = false;
  private shutdownPromise?: Promise<void>;
  private queryTimeHistory: number[] = [];
  private slowQueryCount: number = 0;
  private peakConnectionCount: number = 0;
  // Enhanced state management
  private readonly maxHistorySize = 1000;
  private readonly maxQueryHistorySize = 10000;
  private shutdownInProgress = false;
  private connectionMutex = new Map<string, Promise<any>>();
  private securityViolations: string[] = [];
  private resourceLeakTracker = new Map<string, number>();
  private transactionRegistry = new Map<string, { startTime: Date; query: string }>();
  private deadlockCounter = 0;
  private failedConnectionAttempts = 0;

  constructor(options: ConnectionPoolOptions) {
    super();
    
    this.options = {
      maxLeaseTime: 30000,
      healthCheckInterval: 5000,
      leaseTimeoutAlert: 20000,
      enableMetrics: true,
      enableQueryLogging: false,
      slowQueryThreshold: 1000, // 1 second
      maxConcurrentQueries: 100,
      connectionRetryAttempts: 3,
      connectionRetryDelay: 1000,
      enablePoolWarmup: true,
      warmupConnectionCount: 2,
      enableGracefulShutdown: true,
      shutdownTimeoutMs: 10000,
      enableResourceMonitoring: true,
      ...options
    };

    this.startTime = new Date();

    this.pool = new pg.Pool(this.options);
    this.metrics = this.initializeMetrics();
    
    this.setupPoolEventHandlers();
    if (this.options.enableMetrics) {
      this.startHealthCheckTimer();
    }
    
    // Initialize pool warmup if enabled
    if (this.options.enablePoolWarmup) {
      this.warmupPool().catch(err => {
        console.warn('Pool warmup failed:', err.message);
      });
    }
  }

  private initializeMetrics(): PoolMetrics {
    return {
      totalConnections: 0,
      idleConnections: 0,
      activeConnections: 0,
      waitingClients: 0,
      acquiredLeases: 0,
      totalLeases: 0,
      averageLeaseTime: 0,
      connectionErrors: 0,
      peakConnections: 0,
      totalQueriesExecuted: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      lastHealthCheck: new Date(),
      uptimeMs: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0
      },
      // Initialize new security and performance metrics
      failedConnectionAttempts: 0,
      securityViolations: 0,
      resourceLeaks: 0,
      transactionTimeouts: 0,
      deadlockCount: 0,
      queueWaitTime: 0,
      connectionTurnover: 0
    };
  }

  private setupPoolEventHandlers(): void {
    this.pool.on('error', (err) => {
      this.metrics.connectionErrors++;
      this.metrics.lastError = err;
      this.emit('connectionError', err);
    });

    this.pool.on('connect', () => {
      this.updatePoolMetrics();
      this.emit('connectionEstablished');
    });

    this.pool.on('remove', () => {
      this.updatePoolMetrics();
      this.emit('connectionRemoved');
    });
  }

  private generateLeaseId(): string {
    // Use crypto for better security and uniqueness
    const timestamp = Date.now().toString();
    const randomBytes = createHash('sha256')
      .update(`${timestamp}_${Math.random()}_${process.pid}`)
      .digest('hex')
      .substring(0, 12);
    return `lease_${timestamp}_${randomBytes}`;
  }

  private sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    // Remove potentially dangerous characters and limit length
    return input.replace(/[<>"'&]/g, '').substring(0, 255);
  }

  private validateLeaseRequest(testFile: string, testName: string): void {
    if (!testFile || !testName) {
      this.recordSecurityViolation('Empty testFile or testName provided');
      throw new LeaseError('testFile and testName are required');
    }
    
    if (testFile.length > 255 || testName.length > 255) {
      this.recordSecurityViolation('Oversized testFile or testName');
      throw new LeaseError('testFile and testName must be under 255 characters');
    }
  }

  private recordSecurityViolation(violation: string): void {
    this.securityViolations.push(`${new Date().toISOString()}: ${violation}`);
    this.metrics.securityViolations++;
    
    // Keep only last 100 violations to prevent memory bloat
    if (this.securityViolations.length > 100) {
      this.securityViolations = this.securityViolations.slice(-100);
    }
    
    console.warn(`🔒 Security violation detected: ${violation}`);
    this.emit('securityViolation', violation);
  }

  private updatePoolMetrics(): void {
    if (this.isDestroyed) return;
    
    this.metrics.totalConnections = this.pool.totalCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.activeConnections = this.pool.totalCount - this.pool.idleCount;
    this.metrics.waitingClients = this.pool.waitingCount;
    this.metrics.acquiredLeases = this.leases.size;
    
    // Track peak connections
    this.peakConnectionCount = Math.max(this.peakConnectionCount, this.metrics.totalConnections);
    this.metrics.peakConnections = this.peakConnectionCount;
    
    // Calculate average lease time
    const activeLeaseTimes = Array.from(this.leases.values())
      .filter(lease => !lease.isReleased)
      .map(lease => Date.now() - lease.acquiredAt.getTime());
    
    this.metrics.averageLeaseTime = activeLeaseTimes.length > 0 
      ? activeLeaseTimes.reduce((a, b) => a + b, 0) / activeLeaseTimes.length 
      : 0;
    
    // Calculate average query time
    this.metrics.averageQueryTime = this.queryTimeHistory.length > 0
      ? this.queryTimeHistory.reduce((a, b) => a + b, 0) / this.queryTimeHistory.length
      : 0;
    
    this.metrics.slowQueries = this.slowQueryCount;
    this.metrics.lastHealthCheck = new Date();
    this.metrics.uptimeMs = Date.now() - this.startTime.getTime();
    
    // Memory usage monitoring
    if (this.options.enableResourceMonitoring) {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage = {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      };
    }
  }

  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  private performHealthCheck(): void {
    this.updatePoolMetrics();
    this.checkLeaseTimeouts();
    this.storeMetricsSnapshot();
    this.emit('healthCheck', this.metrics);
  }

  private checkLeaseTimeouts(): void {
    const now = Date.now();
    const expiredLeases: ConnectionLease[] = [];
    const longRunningLeases: ConnectionLease[] = [];

    for (const lease of this.leases.values()) {
      if (lease.isReleased) continue;

      const leaseAge = now - lease.acquiredAt.getTime();
      
      if (leaseAge > this.options.maxLeaseTime) {
        expiredLeases.push(lease);
      } else if (leaseAge > this.options.leaseTimeoutAlert) {
        longRunningLeases.push(lease);
      }
    }

    // Handle expired leases
    for (const lease of expiredLeases) {
      console.warn(`🚨 Force releasing expired lease ${lease.id} from ${lease.testFile}:${lease.testName} (age: ${(now - lease.acquiredAt.getTime()) / 1000}s)`);
      this.forceReleaseLease(lease.id);
      this.emit('leaseTimeout', lease);
    }

    // Alert on long-running leases
    for (const lease of longRunningLeases) {
      console.warn(`⚠️ Long-running lease ${lease.id} from ${lease.testFile}:${lease.testName} (age: ${(now - lease.acquiredAt.getTime()) / 1000}s)`);
      this.emit('leaseWarning', lease);
    }
  }

  private storeMetricsSnapshot(): void {
    // Deep clone metrics to prevent reference issues
    const snapshot = {
      ...this.metrics,
      memoryUsage: { ...this.metrics.memoryUsage },
      timestamp: Date.now()
    };
    
    this.metricsHistory.push(snapshot);
    
    // Use configurable history size with memory pressure detection
    const maxSize = this.shouldReduceMemoryUsage() ? 50 : this.maxHistorySize;
    if (this.metricsHistory.length > maxSize) {
      this.metricsHistory = this.metricsHistory.slice(-maxSize);
    }
  }

  private shouldReduceMemoryUsage(): boolean {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    return heapUsedMB > 500; // Reduce history if using over 500MB
  }

  async acquireLease(
    testFile: string, 
    testName: string, 
    options: {
      priority?: 'low' | 'normal' | 'high';
      tags?: string[];
      timeout?: number;
      expectedDuration?: number;
    } = {}
  ): Promise<string> {
    if (this.isDestroyed || this.shutdownInProgress) {
      throw new LeaseError('Cannot acquire lease - pool is destroyed or shutting down');
    }

    // Enhanced input validation
    this.validateLeaseRequest(testFile, testName);
    const sanitizedTestFile = this.sanitizeInput(testFile);
    const sanitizedTestName = this.sanitizeInput(testName);

    const { priority = 'normal', tags = [], timeout, expectedDuration } = options;
    const acquisitionStart = Date.now();
    let retryCount = 0;
    const maxRetries = this.options.connectionRetryAttempts;
    const connectionKey = `${sanitizedTestFile}:${sanitizedTestName}`;

    // Prevent concurrent acquisition for same test to avoid race conditions
    if (this.connectionMutex.has(connectionKey)) {
      await this.connectionMutex.get(connectionKey);
    }

    const acquisitionPromise = this.performLeaseAcquisition(
      sanitizedTestFile, 
      sanitizedTestName, 
      priority, 
      tags, 
      timeout, 
      expectedDuration,
      maxRetries,
      acquisitionStart
    );

    this.connectionMutex.set(connectionKey, acquisitionPromise);
    
    try {
      const result = await acquisitionPromise;
      return result;
    } finally {
      this.connectionMutex.delete(connectionKey);
    }
  }

  private async performLeaseAcquisition(
    testFile: string,
    testName: string,
    priority: 'low' | 'normal' | 'high',
    tags: string[],
    timeout?: number,
    expectedDuration?: number,
    maxRetries: number = 3,
    acquisitionStart: number = Date.now()
  ): Promise<string> {
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        // Enhanced capacity checks
        await this.checkPoolCapacity();
        
        const client = await this.pool.connect();
        const leaseId = this.generateLeaseId();
        
        const lease: ConnectionLease = {
          id: leaseId,
          testFile,
          testName,
          acquiredAt: new Date(),
          lastUsedAt: new Date(),
          client: this.wrapClientWithMonitoring(client, leaseId),
          isReleased: false,
          queryCount: 0,
          tags: tags.map(tag => this.sanitizeInput(tag)),
          priority,
          processId: process.pid,
          stackTrace: this.options.enableQueryLogging ? new Error().stack : undefined,
          expectedReleaseTime: expectedDuration ? new Date(Date.now() + expectedDuration) : undefined,
          warningCount: 0,
          hasActiveTransaction: false
        };

        // Enhanced timeout management
        if (this.options.maxLeaseTime > 0) {
          const timeoutDuration = timeout || this.options.maxLeaseTime;
          lease.timeoutHandle = setTimeout(() => {
            if (!lease.isReleased) {
              lease.warningCount++;
              console.warn(`⏰ Auto-releasing expired lease ${leaseId} (warnings: ${lease.warningCount})`);
              this.forceReleaseLease(leaseId);
            }
          }, timeoutDuration);
        }

        this.leases.set(leaseId, lease);
        this.metrics.totalLeases++;
        this.metrics.queueWaitTime = Date.now() - acquisitionStart;
        this.updatePoolMetrics();

        if (this.options.enableQueryLogging) {
          console.log(`📝 Acquired connection lease ${leaseId} for ${testFile}:${testName} (priority: ${priority}, wait: ${this.metrics.queueWaitTime}ms)`);
        }
        this.emit('leaseAcquired', lease);

        return leaseId;
      } catch (error) {
        retryCount++;
        this.failedConnectionAttempts++;
        this.metrics.connectionErrors++;
        this.metrics.failedConnectionAttempts++;
        this.metrics.lastError = error as Error;
        
        if (retryCount > maxRetries || !this.isRetryableError(error as Error)) {
          const errorMessage = `Failed to acquire connection lease after ${retryCount} attempts: ${(error as Error).message}`;
          console.error(`❌ ${errorMessage}`);
          
          throw new LeaseError(
            errorMessage,
            undefined,
            { testFile, testName, retryCount, originalError: error, failureTime: new Date() }
          );
        }
        
        // Exponential backoff with jitter
        const baseDelay = this.options.connectionRetryDelay * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay + jitter, 10000); // Max 10 second delay
        
        console.warn(`⚠️ Connection attempt ${retryCount} failed, retrying in ${delay}ms: ${(error as Error).message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new LeaseError('Maximum retry attempts exceeded');
  }

  private async checkPoolCapacity(): Promise<void> {
    if (this.metrics.waitingClients > (this.options.max! * 2)) {
      throw new PoolExhaustionError(
        `Pool exhausted: ${this.metrics.waitingClients} clients waiting, ${this.metrics.activeConnections} active`,
        { 
          waitingClients: this.metrics.waitingClients, 
          maxConnections: this.options.max,
          activeConnections: this.metrics.activeConnections,
          timestamp: new Date()
        }
      );
    }

    // Check for resource leaks
    if (this.leases.size > (this.options.max! * 3)) {
      this.metrics.resourceLeaks++;
      console.warn(`⚠️ Potential resource leak detected: ${this.leases.size} leases active`);
      await this.performLeaseCleanup();
    }
  }

  private async performLeaseCleanup(): Promise<void> {
    const now = Date.now();
    const staleLeases = Array.from(this.leases.values())
      .filter(lease => {
        const age = now - lease.lastUsedAt.getTime();
        return !lease.isReleased && age > (this.options.maxLeaseTime * 2);
      });

    for (const lease of staleLeases) {
      console.warn(`🧹 Cleaning up stale lease ${lease.id}`);
      this.forceReleaseLease(lease.id);
    }
  }

  async leaseConnection(): Promise<{ id: string; client: pg.PoolClient }> {
    const leaseId = await this.acquireLease('test-smoke', 'leaseConnection');
    const client = this.getClient(leaseId);
    return { id: leaseId, client };
  }

  async releaseConnection(lease: { id: string; client: pg.PoolClient }): Promise<void> {
    this.releaseLease(lease.id);
  }

  getClient(leaseId: string): pg.PoolClient {
    if (!leaseId || typeof leaseId !== 'string') {
      this.recordSecurityViolation('Invalid lease ID format');
      throw new LeaseError('Invalid lease ID format');
    }

    const lease = this.leases.get(leaseId);
    if (!lease) {
      this.recordSecurityViolation(`Attempted access to non-existent lease: ${leaseId}`);
      throw new LeaseError(`Invalid lease ID: ${leaseId}`);
    }
    
    if (lease.isReleased) {
      throw new LeaseError(`Lease ${leaseId} has been released`);
    }

    if (this.isDestroyed || this.shutdownInProgress) {
      throw new LeaseError('Cannot access client - pool is destroyed or shutting down');
    }

    lease.lastUsedAt = new Date();
    
    // Track transaction state
    this.trackClientUsage(leaseId, lease);
    
    return lease.client;
  }

  private trackClientUsage(leaseId: string, lease: ConnectionLease): void {
    // Update resource leak tracker
    const currentUsage = this.resourceLeakTracker.get(leaseId) || 0;
    this.resourceLeakTracker.set(leaseId, currentUsage + 1);
    
    // Warn about excessive usage
    if (currentUsage > 100) {
      console.warn(`⚠️ Excessive client usage detected for lease ${leaseId}: ${currentUsage} accesses`);
      lease.warningCount++;
    }
  }

  releaseLease(leaseId: string): void {
    const lease = this.leases.get(leaseId);
    if (!lease) {
      console.warn(`Attempted to release unknown lease: ${leaseId}`);
      return;
    }

    if (lease.isReleased) {
      console.warn(`Lease ${leaseId} already released`);
      return;
    }

    lease.isReleased = true;
    lease.client.release();
    
    const leaseTime = Date.now() - lease.acquiredAt.getTime();
    console.log(`✅ Released connection lease ${leaseId} (held for ${leaseTime}ms)`);
    
    this.updatePoolMetrics();
    this.emit('leaseReleased', lease, leaseTime);

    // Clean up released lease after a short delay to allow for metrics
    setTimeout(() => this.leases.delete(leaseId), 1000);
  }

  private forceReleaseLease(leaseId: string): void {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.isReleased) return;

    console.error(`🚨 Force releasing stuck connection lease ${leaseId}`);
    
    try {
      lease.client.release(new Error('Lease timeout - forced release'));
    } catch (error) {
      console.error(`Error during force release: ${error.message}`);
    }
    
    lease.isReleased = true;
    this.leases.delete(leaseId);
    this.updatePoolMetrics();
    this.emit('leaseForcedRelease', lease);
  }

  async releaseAllLeases(testFile?: string): Promise<void> {
    const leasesToRelease = Array.from(this.leases.values())
      .filter(lease => !lease.isReleased && (!testFile || lease.testFile === testFile));

    console.log(`🧹 Releasing ${leasesToRelease.length} active leases${testFile ? ` for ${testFile}` : ''}`);

    for (const lease of leasesToRelease) {
      this.releaseLease(lease.id);
    }

    // Wait a bit for async releases to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  getMetrics(): PoolMetrics {
    this.updatePoolMetrics();
    return { ...this.metrics };
  }

  getMetricsHistory(): PoolMetrics[] {
    return [...this.metricsHistory];
  }

  getActiveLeases(): ConnectionLease[] {
    return Array.from(this.leases.values()).filter(lease => !lease.isReleased);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      this.metrics.connectionErrors++;
      this.metrics.lastError = error as Error;
      return false;
    }
  }

  async destroy(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    await this.releaseAllLeases();
    await this.pool.end();
    this.removeAllListeners();
    
    console.log('🔄 Connection pool manager destroyed');
  }

  // Static method to create pool per test file
  static createPerFilePool(testFile: string, baseOptions: ConnectionPoolOptions): TestConnectionPoolManager {
    const poolOptions: ConnectionPoolOptions = {
      ...baseOptions,
      max: Math.max(2, Math.floor((baseOptions.max || 10) / 4)), // Smaller pools per file
      database: `${baseOptions.database}_${testFile.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`
    };

    return new TestConnectionPoolManager(poolOptions);
  }

  // Helper methods for enhanced functionality
  private async warmupPool(): Promise<void> {
    console.log('🔥 Warming up connection pool...');
    const warmupPromises: Promise<void>[] = [];
    
    for (let i = 0; i < this.options.warmupConnectionCount; i++) {
      warmupPromises.push(
        this.pool.connect()
          .then(client => {
            // Perform a simple query to ensure connection is active
            return client.query('SELECT 1')
              .then(() => client.release())
              .catch(err => {
                console.warn('Warmup query failed:', err);
                client.release();
              });
          })
          .catch(err => {
            console.warn('Warmup connection failed:', err);
          })
      );
    }
    
    await Promise.allSettled(warmupPromises);
    console.log('✅ Pool warmup completed');
  }

  private wrapClientWithMonitoring(client: pg.PoolClient, leaseId: string): pg.PoolClient {
    if (!this.options.enableQueryLogging && !this.options.enableResourceMonitoring) {
      return client;
    }

    const originalQuery = client.query.bind(client);
    
    client.query = ((...args: any[]) => {
      const startTime = Date.now();
      const lease = this.leases.get(leaseId);
      
      if (lease) {
        lease.queryCount++;
        lease.lastUsedAt = new Date();
      }
      
      const result = originalQuery(...args);
      
      if (result && typeof result.then === 'function') {
        return result.then(
          (res: any) => {
            this.recordQueryMetrics(startTime, true, args[0]);
            return res;
          },
          (err: any) => {
            this.recordQueryMetrics(startTime, false, args[0], err);
            throw err;
          }
        );
      }
      
      this.recordQueryMetrics(startTime, true, args[0]);
      return result;
    }) as any;
    
    return client;
  }

  private recordQueryMetrics(startTime: number, success: boolean, query?: string, error?: Error): void {
    const duration = Date.now() - startTime;
    
    this.metrics.totalQueriesExecuted++;
    this.queryTimeHistory.push(duration);
    
    // Keep only last 1000 query times for memory efficiency
    if (this.queryTimeHistory.length > 1000) {
      this.queryTimeHistory = this.queryTimeHistory.slice(-1000);
    }
    
    if (duration > this.options.slowQueryThreshold) {
      this.slowQueryCount++;
      if (this.options.enableQueryLogging) {
        console.warn(`🐌 Slow query detected (${duration}ms): ${query?.toString().substring(0, 100)}...`);
      }
    }
    
    if (!success && error && this.options.enableQueryLogging) {
      console.error(`❌ Query failed (${duration}ms):`, error.message);
    }
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'connection terminated unexpectedly',
      'server closed the connection unexpectedly',
      'Connection terminated',
      'timeout expired',
      'connection timeout',
      'server is not accepting connections'
    ];
    
    const errorMessage = error.message.toLowerCase();
    const isRetryable = retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toLowerCase())
    );
    
    // Log non-retryable errors for debugging
    if (!isRetryable) {
      console.warn(`⚠️ Non-retryable error detected: ${error.message}`);
    }
    
    return isRetryable;
  }

  // Enhanced utility methods with better error handling and validation
  getLeaseById(leaseId: string): ConnectionLease | undefined {
    if (!leaseId || typeof leaseId !== 'string') {
      return undefined;
    }
    return this.leases.get(leaseId);
  }

  getLeasesByTestFile(testFile: string): ConnectionLease[] {
    if (!testFile || typeof testFile !== 'string') {
      return [];
    }
    return Array.from(this.leases.values())
      .filter(lease => lease.testFile === testFile);
  }

  getLeasesByTag(tag: string): ConnectionLease[] {
    if (!tag || typeof tag !== 'string') {
      return [];
    }
    return Array.from(this.leases.values())
      .filter(lease => lease.tags.includes(tag));
  }

  getHighPriorityLeases(): ConnectionLease[] {
    return Array.from(this.leases.values())
      .filter(lease => lease.priority === 'high' && !lease.isReleased);
  }

  // Additional utility methods for enhanced monitoring
  getConnectionStatistics(): {
    totalLeases: number;
    activeLeases: number;
    averageLeaseAge: number;
    leasesWithWarnings: number;
    leasesWithActiveTransactions: number;
    resourceLeaksSuspected: number;
  } {
    const activeLeases = Array.from(this.leases.values()).filter(lease => !lease.isReleased);
    const now = Date.now();
    
    const totalAge = activeLeases.reduce((sum, lease) => {
      return sum + (now - lease.acquiredAt.getTime());
    }, 0);
    
    return {
      totalLeases: this.leases.size,
      activeLeases: activeLeases.length,
      averageLeaseAge: activeLeases.length > 0 ? totalAge / activeLeases.length : 0,
      leasesWithWarnings: activeLeases.filter(lease => lease.warningCount > 0).length,
      leasesWithActiveTransactions: activeLeases.filter(lease => lease.hasActiveTransaction).length,
      resourceLeaksSuspected: Array.from(this.resourceLeakTracker.values()).filter(count => count > 50).length
    };
  }

  getSecurityReport(): {
    violations: string[];
    violationCount: number;
    failedConnectionAttempts: number;
    suspiciousActivity: boolean;
  } {
    return {
      violations: [...this.securityViolations],
      violationCount: this.metrics.securityViolations,
      failedConnectionAttempts: this.failedConnectionAttempts,
      suspiciousActivity: this.securityViolations.length > 10 || this.failedConnectionAttempts > 20
    };
  }
}

// Enhanced utility functions for connection pool management
export function createOptimizedPoolConfig(baseConfig: ConnectionPoolOptions): ConnectionPoolOptions {
  const os = require('os');
  const cpuCount = os.cpus().length;
  const totalMemoryMB = os.totalmem() / 1024 / 1024;
  
  // Dynamic configuration based on system resources
  const maxConnections = Math.min(
    baseConfig.max || Math.max(cpuCount * 2, 10),
    Math.floor(totalMemoryMB / 50) // Estimate ~50MB per connection
  );
  
  return {
    ...baseConfig,
    max: maxConnections,
    min: baseConfig.min || Math.max(Math.floor(cpuCount / 2), 2),
    connectionTimeoutMillis: baseConfig.connectionTimeoutMillis || 5000,
    idleTimeoutMillis: baseConfig.idleTimeoutMillis || 30000,
    maxLeaseTime: baseConfig.maxLeaseTime || 30000,
    healthCheckInterval: baseConfig.healthCheckInterval || 5000,
    enableMetrics: baseConfig.enableMetrics ?? true,
    enablePoolWarmup: baseConfig.enablePoolWarmup ?? true,
    warmupConnectionCount: baseConfig.warmupConnectionCount || Math.min(maxConnections, 3),
    enableGracefulShutdown: baseConfig.enableGracefulShutdown ?? true,
    shutdownTimeoutMs: baseConfig.shutdownTimeoutMs || 10000,
    enableResourceMonitoring: baseConfig.enableResourceMonitoring ?? true,
    // Enhanced security defaults
    enableQueryLogging: baseConfig.enableQueryLogging ?? false,
    slowQueryThreshold: baseConfig.slowQueryThreshold || 1000,
    connectionRetryAttempts: baseConfig.connectionRetryAttempts || 3,
    connectionRetryDelay: baseConfig.connectionRetryDelay || 1000
  };
}

// Utility function to validate pool configuration
export function validatePoolConfig(config: ConnectionPoolOptions): void {
  if (config.max && config.max < 1) {
    throw new Error('max connections must be at least 1');
  }
  
  if (config.min && config.min < 0) {
    throw new Error('min connections cannot be negative');
  }
  
  if (config.max && config.min && config.min > config.max) {
    throw new Error('min connections cannot exceed max connections');
  }
  
  if (config.maxLeaseTime && config.maxLeaseTime < 1000) {
    throw new Error('maxLeaseTime must be at least 1000ms');
  }
  
  if (config.connectionTimeoutMillis && config.connectionTimeoutMillis < 1000) {
    throw new Error('connectionTimeoutMillis must be at least 1000ms');
  }
}

// Enhanced monitoring utilities
export function createPoolMonitor(poolManager: TestConnectionPoolManager): {
  startMonitoring: () => void;
  stopMonitoring: () => void;
  getReport: () => string;
} {
  let monitoringInterval: NodeJS.Timeout | null = null;
  let alertCount = 0;
  
  return {
    startMonitoring: () => {
      if (monitoringInterval) return;
      
      monitoringInterval = setInterval(() => {
        const metrics = poolManager.getMetrics();
        
        // Check for concerning patterns
        if (metrics.connectionErrors > 5) {
          alertCount++;
          console.warn(`🚨 Pool monitoring alert #${alertCount}: High error rate (${metrics.connectionErrors} errors)`);
        }
        
        if (metrics.waitingClients > 0) {
          console.warn(`⚠️ Pool monitoring: ${metrics.waitingClients} clients waiting`);
        }
        
        if (metrics.averageLeaseTime > 20000) {
          console.warn(`⚠️ Pool monitoring: High average lease time (${metrics.averageLeaseTime}ms)`);
        }
      }, 10000); // Check every 10 seconds
    },
    
    stopMonitoring: () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
    },
    
    getReport: () => {
      const metrics = poolManager.getMetrics();
      return `Pool Monitor Report:\n- Total alerts: ${alertCount}\n- Current connections: ${metrics.totalConnections}\n- Active leases: ${metrics.acquiredLeases}\n- Errors: ${metrics.connectionErrors}`;
    }
  };
}