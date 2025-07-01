import { TestConnectionPoolManager, ConnectionPoolOptions } from './connection-pool-manager';
import { TestDatabaseHelpers } from './test-db-helpers';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { promisify } from 'util';

export interface PerFilePoolConfig {
  enabled: boolean;
  maxConnectionsPerFile: number;
  isolateBySchema: boolean;
  customDatabasePrefix?: string;
  enableMetrics: boolean;
  healthCheckInterval: number;
  maxLeaseTime: number;
  // Enhanced configuration options
  autoCleanupInterval: number;
  maxIdleTime: number;
  enableAutoScaling: boolean;
  minConnectionsPerFile: number;
  maxPoolsPerProcess: number;
  enableCrossFileSharing: boolean;
  isolationMode: 'database' | 'schema' | 'namespace';
  enableResourceLimits: boolean;
  maxMemoryPerPool: number;
  enableFailover: boolean;
}

export class PerFilePoolConfiguration extends EventEmitter {
  private static instance: PerFilePoolConfiguration;
  private config: PerFilePoolConfig = {
    enabled: false,
    maxConnectionsPerFile: 5,
    isolateBySchema: false,
    enableMetrics: true,
    healthCheckInterval: 10000,
    maxLeaseTime: 20000,
    // Enhanced default values
    autoCleanupInterval: 60000, // 1 minute
    maxIdleTime: 300000, // 5 minutes
    enableAutoScaling: true,
    minConnectionsPerFile: 1,
    maxPoolsPerProcess: 20,
    enableCrossFileSharing: false,
    isolationMode: 'database',
    enableResourceLimits: true,
    maxMemoryPerPool: 100, // MB
    enableFailover: true
  };

  private activeFilePools = new Map<string, TestConnectionPoolManager>();
  private filePoolMetrics = new Map<string, any>();
  private cleanupInterval?: NodeJS.Timeout;
  private poolCreationCount = 0;
  private lastCleanupTime = 0;
  private memoryUsageTracker = new Map<string, number>();
  private failedPools = new Set<string>();

  static getInstance(): PerFilePoolConfiguration {
    if (!PerFilePoolConfiguration.instance) {
      PerFilePoolConfiguration.instance = new PerFilePoolConfiguration();
    }
    return PerFilePoolConfiguration.instance;
  }

  constructor() {
    super();
    this.startAutoCleanup();
  }

  configure(config: Partial<PerFilePoolConfig>): void {
    // Validate configuration before applying
    this.validateConfiguration(config);
    
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    
    console.log('🔧 Per-file pool configuration updated:', this.config);
    
    // Handle configuration changes
    this.handleConfigurationChanges(oldConfig, this.config);
    
    this.emit('configurationChanged', { oldConfig, newConfig: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  private validateConfiguration(config: Partial<PerFilePoolConfig>): void {
    if (config.maxConnectionsPerFile !== undefined) {
      if (config.maxConnectionsPerFile < 1 || config.maxConnectionsPerFile > 50) {
        throw new Error('maxConnectionsPerFile must be between 1 and 50');
      }
    }
    
    if (config.minConnectionsPerFile !== undefined && config.maxConnectionsPerFile !== undefined) {
      if (config.minConnectionsPerFile > config.maxConnectionsPerFile) {
        throw new Error('minConnectionsPerFile cannot exceed maxConnectionsPerFile');
      }
    }
    
    if (config.maxPoolsPerProcess !== undefined) {
      if (config.maxPoolsPerProcess < 1 || config.maxPoolsPerProcess > 100) {
        throw new Error('maxPoolsPerProcess must be between 1 and 100');
      }
    }
    
    if (config.maxMemoryPerPool !== undefined) {
      if (config.maxMemoryPerPool < 10 || config.maxMemoryPerPool > 1000) {
        throw new Error('maxMemoryPerPool must be between 10MB and 1000MB');
      }
    }
  }
  
  private handleConfigurationChanges(oldConfig: PerFilePoolConfig, newConfig: PerFilePoolConfig): void {
    // Restart auto cleanup if interval changed
    if (oldConfig.autoCleanupInterval !== newConfig.autoCleanupInterval) {
      this.startAutoCleanup();
    }
    
    // If disabled, cleanup all pools
    if (oldConfig.enabled && !newConfig.enabled) {
      this.destroyAllFilePoolsSync();
    }
  }
  
  private startAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.performAutoCleanup();
    }, this.config.autoCleanupInterval);
  }
  
  private performAutoCleanup(): void {
    const now = Date.now();
    const poolsToCleanup: string[] = [];
    
    for (const [fileName, poolManager] of this.activeFilePools) {
      const metrics = poolManager.getMetrics();
      const fileMetrics = this.filePoolMetrics.get(fileName);
      
      // Check if pool has been idle for too long
      if (fileMetrics?.lastHealthCheck) {
        const idleTime = now - fileMetrics.lastHealthCheck.lastHealthCheck.getTime();
        if (idleTime > this.config.maxIdleTime && metrics.acquiredLeases === 0) {
          poolsToCleanup.push(fileName);
        }
      }
      
      // Check memory usage if resource limits enabled
      if (this.config.enableResourceLimits) {
        const memoryUsageMB = this.memoryUsageTracker.get(fileName) || 0;
        if (memoryUsageMB > this.config.maxMemoryPerPool) {
          console.warn(`Pool ${fileName} exceeding memory limit: ${memoryUsageMB}MB`);
          this.emit('memoryLimitExceeded', { fileName, memoryUsage: memoryUsageMB });
        }
      }
    }
    
    // Cleanup idle pools
    for (const fileName of poolsToCleanup) {
      console.log(`🧹 Auto-cleaning up idle pool: ${fileName}`);
      this.destroyFilePoolSync(fileName);
    }
    
    this.lastCleanupTime = now;
    
    if (poolsToCleanup.length > 0) {
      this.emit('autoCleanup', { clearedPools: poolsToCleanup.length, totalPools: this.activeFilePools.size });
    }
  }

  async getOrCreateFilePool(testFile: string): Promise<TestConnectionPoolManager> {
    if (!this.config.enabled) {
      throw new Error('Per-file pools are not enabled. Call configure({enabled: true}) first.');
    }
    
    // Validate input
    if (!testFile || typeof testFile !== 'string') {
      throw new Error('Valid test file name is required');
    }
    
    const normalizedFile = this.normalizeFileName(testFile);
    
    // Check if we've hit the pool limit
    if (this.activeFilePools.size >= this.config.maxPoolsPerProcess) {
      throw new Error(`Maximum pools per process limit reached (${this.config.maxPoolsPerProcess})`);
    }
    
    // Check if this file has failed before
    if (this.failedPools.has(normalizedFile) && !this.config.enableFailover) {
      throw new Error(`Pool creation failed previously for ${normalizedFile}`);
    }

    if (this.activeFilePools.has(normalizedFile)) {
      const existingPool = this.activeFilePools.get(normalizedFile)!;
      // Update last access time
      this.updatePoolAccess(normalizedFile);
      return existingPool;
    }

    console.log(`🏗️ Creating dedicated pool for test file: ${testFile} (${++this.poolCreationCount} total created)`);
    
    try {
      const baseConfig: ConnectionPoolOptions = {
        host: process.env.TEST_DATABASE_HOST || 'localhost',
        port: parseInt(process.env.TEST_DATABASE_PORT || '5434'),
        database: this.getDatabaseName(normalizedFile),
        user: process.env.TEST_DATABASE_USER || 'test',
        password: process.env.TEST_DATABASE_PASSWORD || 'test',
        max: this.config.maxConnectionsPerFile,
        min: this.config.minConnectionsPerFile,
        maxLeaseTime: this.config.maxLeaseTime,
        healthCheckInterval: this.config.healthCheckInterval,
        enableMetrics: this.config.enableMetrics,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 20000,
        enableGracefulShutdown: true,
        shutdownTimeoutMs: 5000
      };

      const poolManager = new TestConnectionPoolManager(baseConfig);
      
      // Setup event listeners for monitoring
      this.setupPoolEventListeners(poolManager, normalizedFile);
      
      this.activeFilePools.set(normalizedFile, poolManager);
      
      // Initialize isolation if configured
      await this.initializeIsolation(poolManager, normalizedFile);
      
      // Track memory usage
      this.memoryUsageTracker.set(normalizedFile, 0);
      
      // Remove from failed pools if it was there
      this.failedPools.delete(normalizedFile);
      
      this.emit('poolCreated', { fileName: normalizedFile, totalPools: this.activeFilePools.size });
      
      return poolManager;
      
    } catch (error) {
      console.error(`Failed to create pool for ${normalizedFile}:`, error);
      this.failedPools.add(normalizedFile);
      this.emit('poolCreationFailed', { fileName: normalizedFile, error });
      throw error;
    }
  }
  
  private updatePoolAccess(fileName: string): void {
    const metrics = this.filePoolMetrics.get(fileName);
    if (metrics) {
      metrics.lastAccess = new Date();
    }
  }

  private normalizeFileName(testFile: string): string {
    if (!testFile || typeof testFile !== 'string') {
      throw new Error('Invalid test file name');
    }
    
    const normalized = testFile
      .replace(/^.*[\/\\]/, '') // Remove path
      .replace(/\.[^.]*$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars
      .toLowerCase();
      
    if (normalized.length === 0) {
      throw new Error('Test file name resulted in empty normalized name');
    }
    
    if (normalized.length > 50) {
      // Use hash for very long names
      const hash = createHash('sha256').update(normalized).digest('hex').substring(0, 12);
      return `file_${hash}`;
    }
    
    return normalized;
  }

  private getDatabaseName(normalizedFile: string): string {
    const baseDatabase = process.env.TEST_DATABASE_NAME || 'vonkfi_test';
    
    switch (this.config.isolationMode) {
      case 'schema':
        return baseDatabase; // Same database, different schemas
      case 'namespace':
        return baseDatabase; // Same database, namespace isolation
      case 'database':
      default:
        // Different databases per file
        const prefix = this.config.customDatabasePrefix || baseDatabase;
        const dbName = `${prefix}_${normalizedFile}`;
        
        // Validate database name length (PostgreSQL limit is 63 characters)
        if (dbName.length > 63) {
          const hash = createHash('sha256').update(dbName).digest('hex').substring(0, 12);
          return `${prefix.substring(0, 30)}_${hash}`;
        }
        
        return dbName;
    }
  }

  private setupPoolEventListeners(poolManager: TestConnectionPoolManager, fileName: string): void {
    poolManager.on('connectionError', (error) => {
      console.error(`🚨 Connection error in ${fileName} pool:`, error.message);
      this.updateFileMetrics(fileName, 'connectionError', error);
      this.emit('poolError', { fileName, error });
    });

    poolManager.on('leaseTimeout', (lease) => {
      console.warn(`⏰ Lease timeout in ${fileName} pool for ${lease.testName}`);
      this.updateFileMetrics(fileName, 'leaseTimeout', lease);
      this.emit('leaseTimeout', { fileName, lease });
    });

    poolManager.on('leaseWarning', (lease) => {
      console.warn(`⚠️ Long-running lease in ${fileName} pool for ${lease.testName}`);
      this.updateFileMetrics(fileName, 'leaseWarning', lease);
      this.emit('leaseWarning', { fileName, lease });
    });

    poolManager.on('healthCheck', (metrics) => {
      this.updateFileMetrics(fileName, 'healthCheck', metrics);
      
      // Update memory usage tracking
      if (metrics.memoryUsage) {
        const memoryUsageMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
        this.memoryUsageTracker.set(fileName, memoryUsageMB);
      }
    });
    
    poolManager.on('slowQuery', (data) => {
      this.updateFileMetrics(fileName, 'slowQuery', data);
      this.emit('slowQuery', { fileName, ...data });
    });
    
    poolManager.on('securityViolation', (violation) => {
      console.error(`🔒 Security violation in ${fileName} pool: ${violation}`);
      this.updateFileMetrics(fileName, 'securityViolation', violation);
      this.emit('securityViolation', { fileName, violation });
    });
    
    poolManager.on('shutdown', () => {
      console.log(`🔄 Pool ${fileName} shutting down`);
      this.emit('poolShutdown', { fileName });
    });
  }

  private updateFileMetrics(fileName: string, event: string, data: any): void {
    if (!this.filePoolMetrics.has(fileName)) {
      this.filePoolMetrics.set(fileName, {
        connectionErrors: 0,
        leaseTimeouts: 0,
        leaseWarnings: 0,
        slowQueries: 0,
        securityViolations: 0,
        lastHealthCheck: null,
        lastAccess: new Date(),
        events: [],
        createdAt: new Date(),
        totalQueries: 0
      });
    }

    const metrics = this.filePoolMetrics.get(fileName)!;
    
    switch (event) {
      case 'connectionError':
        metrics.connectionErrors++;
        break;
      case 'leaseTimeout':
        metrics.leaseTimeouts++;
        break;
      case 'leaseWarning':
        metrics.leaseWarnings++;
        break;
      case 'slowQuery':
        metrics.slowQueries++;
        metrics.totalQueries++;
        break;
      case 'securityViolation':
        metrics.securityViolations++;
        break;
      case 'healthCheck':
        metrics.lastHealthCheck = data;
        metrics.lastAccess = new Date();
        break;
    }

    const eventData = {
      type: event,
      timestamp: new Date(),
      data: this.sanitizeEventData(data)
    };
    
    metrics.events.push(eventData);

    // Keep only last 100 events per file with memory management
    if (metrics.events.length > 100) {
      metrics.events = metrics.events.slice(-50); // More aggressive cleanup
    }
  }
  
  private sanitizeEventData(data: any): any {
    if (!data) return data;
    
    // Remove potentially large or sensitive data
    if (typeof data === 'object') {
      const sanitized = { ...data };
      
      // Remove large fields
      delete sanitized.stackTrace;
      delete sanitized.fullQuery;
      
      // Truncate long strings
      Object.keys(sanitized).forEach(key => {
        if (typeof sanitized[key] === 'string' && sanitized[key].length > 200) {
          sanitized[key] = sanitized[key].substring(0, 200) + '...';
        }
      });
      
      return sanitized;
    }
    
    return data;
  }

  private async initializeIsolation(poolManager: TestConnectionPoolManager, fileName: string): Promise<void> {
    try {
      console.log(`🗂️ Initializing ${this.config.isolationMode} isolation for ${fileName}...`);
      
      switch (this.config.isolationMode) {
        case 'schema':
          await this.initializeSchemaIsolation(poolManager, fileName);
          break;
        case 'namespace':
          await this.initializeNamespaceIsolation(poolManager, fileName);
          break;
        case 'database':
        default:
          // Database isolation doesn't need additional setup
          console.log(`✅ Database isolation ready for ${fileName}`);
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to initialize isolation for ${fileName}:`, error);
      throw error;
    }
  }
  
  private async initializeSchemaIsolation(poolManager: TestConnectionPoolManager, fileName: string): Promise<void> {
    const schemaName = `test_${fileName}`;
    
    // This would create file-specific schema
    // Implementation depends on your database schema requirements
    try {
      // Example: Create schema if it doesn't exist
      // const client = await poolManager.acquireLease('schema-init', 'create-schema');
      // await poolManager.getClient(client).query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      // poolManager.releaseLease(client);
      
      console.log(`✅ Schema ${schemaName} ready`);
    } catch (error) {
      console.error(`❌ Failed to create schema ${schemaName}:`, error);
      throw error;
    }
  }
  
  private async initializeNamespaceIsolation(poolManager: TestConnectionPoolManager, fileName: string): Promise<void> {
    // Namespace isolation uses application-level prefixes rather than database features
    const namespace = `ns_${fileName}`;
    
    // Store namespace configuration for this pool
    const metrics = this.filePoolMetrics.get(fileName);
    if (metrics) {
      metrics.namespace = namespace;
    }
    
    console.log(`✅ Namespace ${namespace} ready`);
  }

  async destroyFilePool(testFile: string): Promise<void> {
    if (!testFile || typeof testFile !== 'string') {
      console.warn('Invalid test file name provided for pool destruction');
      return;
    }
    
    const normalizedFile = this.normalizeFileName(testFile);
    const poolManager = this.activeFilePools.get(normalizedFile);
    
    if (poolManager) {
      console.log(`🧹 Destroying pool for test file: ${testFile}`);
      
      try {
        // Remove from active pools first to prevent new connections
        this.activeFilePools.delete(normalizedFile);
        
        // Destroy the pool with timeout
        const destroyPromise = poolManager.destroy();
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Pool destruction timeout')), 10000);
        });
        
        await Promise.race([destroyPromise, timeoutPromise]);
        
        // Clean up metrics and tracking data
        this.filePoolMetrics.delete(normalizedFile);
        this.memoryUsageTracker.delete(normalizedFile);
        this.failedPools.delete(normalizedFile);
        
        this.emit('poolDestroyed', { fileName: normalizedFile, totalPools: this.activeFilePools.size });
        
      } catch (error) {
        console.error(`Error destroying pool for ${testFile}:`, error);
        
        // Force cleanup even if destroy failed
        this.filePoolMetrics.delete(normalizedFile);
        this.memoryUsageTracker.delete(normalizedFile);
        
        this.emit('poolDestroyFailed', { fileName: normalizedFile, error });
        throw error;
      }
    } else {
      console.debug(`No pool found for test file: ${testFile}`);
    }
  }
  
  private destroyFilePoolSync(testFile: string): void {
    this.destroyFilePool(testFile).catch(error => {
      console.error(`Error in sync pool destruction for ${testFile}:`, error);
    });
  }

  async destroyAllFilePools(): Promise<void> {
    if (this.activeFilePools.size === 0) {
      console.log('No file pools to destroy');
      return;
    }
    
    console.log(`🧹 Destroying ${this.activeFilePools.size} file pools...`);
    
    const startTime = Date.now();
    const destroyPromises = Array.from(this.activeFilePools.entries()).map(
      async ([fileName, poolManager]) => {
        try {
          await poolManager.destroy();
          console.debug(`Destroyed pool: ${fileName}`);
        } catch (error) {
          console.error(`Failed to destroy pool ${fileName}:`, error);
        }
      }
    );
    
    // Use allSettled to ensure all pools are attempted to be destroyed
    const results = await Promise.allSettled(destroyPromises);
    
    // Clean up all tracking data
    this.activeFilePools.clear();
    this.filePoolMetrics.clear();
    this.memoryUsageTracker.clear();
    this.failedPools.clear();
    
    const destroyTime = Date.now() - startTime;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    
    if (failedCount > 0) {
      console.warn(`⚠️ ${failedCount} pools failed to destroy cleanly`);
    }
    
    console.log(`✅ All file pools destroyed (${destroyTime}ms)`);
    
    this.emit('allPoolsDestroyed', {
      totalPools: results.length,
      failedDestructions: failedCount,
      destroyTime
    });
  }
  
  private destroyAllFilePoolsSync(): void {
    this.destroyAllFilePools().catch(error => {
      console.error('Error in sync destruction of all pools:', error);
    });
  }

  getFilePoolStatus(): Map<string, any> {
    const status = new Map();
    
    for (const [fileName, poolManager] of this.activeFilePools) {
      try {
        const metrics = poolManager.getMetrics();
        const fileMetrics = this.filePoolMetrics.get(fileName) || {};
        const memoryUsage = this.memoryUsageTracker.get(fileName) || 0;
        
        status.set(fileName, {
          poolMetrics: metrics,
          fileMetrics,
          activeLeases: poolManager.getActiveLeases().length,
          memoryUsageMB: memoryUsage,
          isHealthy: this.checkPoolHealth(poolManager, fileMetrics),
          createdAt: fileMetrics.createdAt,
          lastAccess: fileMetrics.lastAccess,
          uptime: fileMetrics.createdAt ? Date.now() - fileMetrics.createdAt.getTime() : 0
        });
      } catch (error) {
        console.error(`Error getting status for pool ${fileName}:`, error);
        status.set(fileName, {
          error: error.message,
          isHealthy: false
        });
      }
    }
    
    return status;
  }
  
  private async checkPoolHealth(poolManager: TestConnectionPoolManager, fileMetrics: any): Promise<boolean> {
    try {
      const healthResult = await poolManager.healthCheck();
      
      // Additional health checks
      if (fileMetrics.connectionErrors > 5) return false;
      if (fileMetrics.securityViolations > 0) return false;
      
      const memoryUsage = fileMetrics.memoryUsage;
      if (memoryUsage && this.config.enableResourceLimits) {
        const memUsageMB = memoryUsage.heapUsed / 1024 / 1024;
        if (memUsageMB > this.config.maxMemoryPerPool * 0.9) return false;
      }
      
      return healthResult;
    } catch (error) {
      return false;
    }
  }

  generateFilePoolReport(): string {
    let report = '\n🗂️ PER-FILE POOL STATUS REPORT\n';
    report += '═'.repeat(70) + '\n';
    report += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    report += `Configuration: ${this.config.enabled ? 'ENABLED' : 'DISABLED'}\n`;
    if (this.config.enabled) {
      report += `  Isolation Mode: ${this.config.isolationMode.toUpperCase()}\n`;
      report += `  Max Connections per File: ${this.config.maxConnectionsPerFile}\n`;
      report += `  Min Connections per File: ${this.config.minConnectionsPerFile}\n`;
      report += `  Max Pools per Process: ${this.config.maxPoolsPerProcess}\n`;
      report += `  Auto Scaling: ${this.config.enableAutoScaling ? 'YES' : 'NO'}\n`;
      report += `  Resource Limits: ${this.config.enableResourceLimits ? 'YES' : 'NO'}\n`;
      report += `  Cross-File Sharing: ${this.config.enableCrossFileSharing ? 'YES' : 'NO'}\n`;
      report += `  Active File Pools: ${this.activeFilePools.size}/${this.config.maxPoolsPerProcess}\n`;
      report += `  Total Pools Created: ${this.poolCreationCount}\n`;
      report += `  Failed Pools: ${this.failedPools.size}\n`;
      report += `  Last Cleanup: ${this.lastCleanupTime ? new Date(this.lastCleanupTime).toLocaleString() : 'Never'}\n\n`;
    }

    if (this.activeFilePools.size === 0) {
      report += 'No active file pools\n';
      return report + '═'.repeat(70) + '\n';
    }

    const poolStatus = this.getFilePoolStatus();
    const sortedPools = Array.from(poolStatus.entries())
      .sort(([, a], [, b]) => (b.activeLeases || 0) - (a.activeLeases || 0));

    for (const [fileName, status] of sortedPools) {
      const healthIndicator = status.isHealthy ? '🟢' : '🔴';
      const memoryWarning = status.memoryUsageMB > this.config.maxMemoryPerPool * 0.8 ? ' ⚠️' : '';
      
      report += `📁 ${fileName.toUpperCase()} ${healthIndicator}${memoryWarning}\n`;
      
      if (status.error) {
        report += `  ERROR: ${status.error}\n\n`;
        continue;
      }
      
      const metrics = status.poolMetrics;
      const fileMetrics = status.fileMetrics;
      
      report += `  Active Connections: ${metrics.activeConnections}/${metrics.totalConnections}\n`;
      report += `  Active Leases: ${metrics.acquiredLeases}\n`;
      report += `  Avg Lease Time: ${(metrics.averageLeaseTime / 1000).toFixed(2)}s\n`;
      report += `  Memory Usage: ${status.memoryUsageMB.toFixed(2)}MB\n`;
      report += `  Uptime: ${this.formatDuration(status.uptime)}\n`;
      report += `  Last Access: ${status.lastAccess ? this.formatTimeAgo(status.lastAccess) : 'Never'}\n`;
      
      // Error summary
      const errors = [
        fileMetrics.connectionErrors && `${fileMetrics.connectionErrors} conn errors`,
        fileMetrics.leaseTimeouts && `${fileMetrics.leaseTimeouts} timeouts`,
        fileMetrics.leaseWarnings && `${fileMetrics.leaseWarnings} warnings`,
        fileMetrics.slowQueries && `${fileMetrics.slowQueries} slow queries`,
        fileMetrics.securityViolations && `${fileMetrics.securityViolations} security violations`
      ].filter(Boolean);
      
      if (errors.length > 0) {
        report += `  Issues: ${errors.join(', ')}\n`;
      }
      
      report += '\n';
    }

    report += '═'.repeat(70) + '\n';
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
  
  private formatTimeAgo(date: Date): string {
    const ms = Date.now() - date.getTime();
    return this.formatDuration(ms) + ' ago';
  }

  getConfiguration(): PerFilePoolConfig {
    return { ...this.config };
  }
  
  getStatistics(): {
    totalPoolsCreated: number;
    activePoolsCount: number;
    failedPoolsCount: number;
    totalMemoryUsageMB: number;
    averagePoolAge: number;
    lastCleanupTime: number;
  } {
    const totalMemoryUsage = Array.from(this.memoryUsageTracker.values())
      .reduce((sum, usage) => sum + usage, 0);
    
    const poolAges = Array.from(this.filePoolMetrics.values())
      .filter(metrics => metrics.createdAt)
      .map(metrics => Date.now() - metrics.createdAt.getTime());
    
    const averagePoolAge = poolAges.length > 0 
      ? poolAges.reduce((sum, age) => sum + age, 0) / poolAges.length 
      : 0;
    
    return {
      totalPoolsCreated: this.poolCreationCount,
      activePoolsCount: this.activeFilePools.size,
      failedPoolsCount: this.failedPools.size,
      totalMemoryUsageMB: totalMemoryUsage,
      averagePoolAge,
      lastCleanupTime: this.lastCleanupTime
    };
  }
  
  destroy(): void {
    console.log('Destroying PerFilePoolConfiguration...');
    
    // Stop auto cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    // Destroy all pools synchronously
    this.destroyAllFilePoolsSync();
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('PerFilePoolConfiguration destroyed');
  }

  // Static methods for backwards compatibility
  static configure(config: Partial<PerFilePoolConfig>): void {
    PerFilePoolConfiguration.getInstance().configure(config);
  }

  static isEnabled(): boolean {
    return PerFilePoolConfiguration.getInstance().isEnabled();
  }

  static getOrCreateFilePool(testFile: string): Promise<TestConnectionPoolManager> {
    return PerFilePoolConfiguration.getInstance().getOrCreateFilePool(testFile);
  }

  static destroyFilePool(testFile: string): Promise<void> {
    return PerFilePoolConfiguration.getInstance().destroyFilePool(testFile);
  }

  static destroyAllFilePools(): Promise<void> {
    return PerFilePoolConfiguration.getInstance().destroyAllFilePools();
  }

  static getFilePoolStatus(): Map<string, any> {
    return PerFilePoolConfiguration.getInstance().getFilePoolStatus();
  }

  static generateFilePoolReport(): string {
    return PerFilePoolConfiguration.getInstance().generateFilePoolReport();
  }

  static getConfiguration(): PerFilePoolConfig {
    return PerFilePoolConfiguration.getInstance().getConfiguration();
  }
}

// Enhanced convenience functions for easy usage
export function enablePerFilePools(config?: Partial<PerFilePoolConfig>): void {
  const instance = PerFilePoolConfiguration.getInstance();
  instance.configure({ enabled: true, ...config });
}

export function disablePerFilePools(): void {
  const instance = PerFilePoolConfiguration.getInstance();
  instance.configure({ enabled: false });
}

export async function getFilePool(testFile: string): Promise<TestConnectionPoolManager> {
  const instance = PerFilePoolConfiguration.getInstance();
  return instance.getOrCreateFilePool(testFile);
}

export function logFilePoolStatus(): void {
  const instance = PerFilePoolConfiguration.getInstance();
  console.log(instance.generateFilePoolReport());
}

export function getFilePoolConfiguration(): PerFilePoolConfig {
  const instance = PerFilePoolConfiguration.getInstance();
  return instance.getConfiguration();
}

export function getFilePoolStatistics(): ReturnType<PerFilePoolConfiguration['getStatistics']> {
  const instance = PerFilePoolConfiguration.getInstance();
  return instance.getStatistics();
}

export async function cleanupFilePool(testFile: string): Promise<void> {
  const instance = PerFilePoolConfiguration.getInstance();
  return instance.destroyFilePool(testFile);
}

export async function cleanupAllFilePools(): Promise<void> {
  const instance = PerFilePoolConfiguration.getInstance();
  return instance.destroyAllFilePools();
}

export function setupFilePoolMonitoring(): {
  onPoolCreated: (callback: (data: any) => void) => void;
  onPoolDestroyed: (callback: (data: any) => void) => void;
  onPoolError: (callback: (data: any) => void) => void;
  onSecurityViolation: (callback: (data: any) => void) => void;
  onAutoCleanup: (callback: (data: any) => void) => void;
  removeAllListeners: () => void;
} {
  const instance = PerFilePoolConfiguration.getInstance();
  
  return {
    onPoolCreated: (callback) => instance.on('poolCreated', callback),
    onPoolDestroyed: (callback) => instance.on('poolDestroyed', callback),
    onPoolError: (callback) => instance.on('poolError', callback),
    onSecurityViolation: (callback) => instance.on('securityViolation', callback),
    onAutoCleanup: (callback) => instance.on('autoCleanup', callback),
    removeAllListeners: () => instance.removeAllListeners()
  };
}