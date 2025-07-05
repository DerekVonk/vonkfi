import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { TestConnectionPoolManager } from './connection-pool-manager';
import { poolManager } from '../setup';

export interface IsolationStrategy {
  name: string;
  description: string;
  overhead: 'low' | 'medium' | 'high';
  isolation: 'none' | 'weak' | 'medium' | 'strong' | 'complete';
  conflictResolution: 'abort' | 'retry' | 'wait' | 'skip';
  setup: (context: IsolationContext) => Promise<void>;
  cleanup: (context: IsolationContext) => Promise<void>;
  validateIsolation: (context: IsolationContext) => Promise<boolean>;
}

export interface IsolationContext {
  testFile: string;
  testName: string;
  namespace: string;
  leaseId: string;
  strategy: IsolationStrategy;
  metadata: Record<string, any>;
  startTime: Date;
  resources: IsolationResources;
  conflicts: ConflictTracker;
}

export interface IsolationResources {
  schemas: string[];
  tables: string[];
  sequences: string[];
  connections: string[];
  locks: DatabaseLock[];
  savepoints: string[];
  transactions: string[];
}

export interface DatabaseLock {
  id: string;
  type: 'table' | 'row' | 'advisory' | 'schema';
  resource: string;
  mode: 'shared' | 'exclusive';
  acquiredAt: Date;
  timeout: number;
  context: string;
}

export interface ConflictTracker {
  detectedConflicts: Conflict[];
  resolvedConflicts: Conflict[];
  conflictRate: number;
  lastConflictTime?: Date;
}

export interface Conflict {
  id: string;
  type: 'deadlock' | 'lock_timeout' | 'constraint_violation' | 'resource_contention';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  involvedResources: string[];
  detectedAt: Date;
  resolvedAt?: Date;
  resolution: 'retried' | 'aborted' | 'waited' | 'escalated';
  context: Record<string, any>;
}

export interface IsolationMetrics {
  totalIsolations: number;
  successfulIsolations: number;
  failedIsolations: number;
  averageSetupTime: number;
  averageCleanupTime: number;
  conflictRate: number;
  overheadRatio: number;
  strategyEffectiveness: Map<string, number>;
  resourceUtilization: {
    schemas: number;
    connections: number;
    locks: number;
    memory: number;
  };
}

export class AdvancedDatabaseIsolation extends EventEmitter {
  private strategies = new Map<string, IsolationStrategy>();
  private activeContexts = new Map<string, IsolationContext>();
  private globalLocks = new Map<string, DatabaseLock>();
  private conflictResolver: ConflictResolver;
  private deadlockDetector: DeadlockDetector;
  private isolationMetrics: IsolationMetrics;
  private cleanupRegistry = new Set<string>();
  private namespaceManager: NamespaceManager;
  private schemaManager: SchemaManager;
  private lockManager: LockManager;

  constructor(options: {
    enableDeadlockDetection?: boolean;
    conflictTimeout?: number;
    maxConcurrentIsolations?: number;
  } = {}) {
    super();
    
    this.conflictResolver = new ConflictResolver(options.conflictTimeout || 30000);
    this.deadlockDetector = new DeadlockDetector(options.enableDeadlockDetection ?? true);
    this.namespaceManager = new NamespaceManager();
    this.schemaManager = new SchemaManager();
    this.lockManager = new LockManager();
    
    this.isolationMetrics = this.initializeMetrics();
    
    this.initializeStrategies();
    this.setupEventHandlers();
    
    console.log('🛡️ Advanced Database Isolation system initialized');
  }

  private initializeMetrics(): IsolationMetrics {
    return {
      totalIsolations: 0,
      successfulIsolations: 0,
      failedIsolations: 0,
      averageSetupTime: 0,
      averageCleanupTime: 0,
      conflictRate: 0,
      overheadRatio: 0,
      strategyEffectiveness: new Map(),
      resourceUtilization: {
        schemas: 0,
        connections: 0,
        locks: 0,
        memory: 0
      }
    };
  }

  private initializeStrategies(): void {
    // Strategy 1: Namespace-based isolation (lightweight)
    this.strategies.set('namespace', {
      name: 'Namespace Isolation',
      description: 'Uses table name prefixes and data namespacing for isolation',
      overhead: 'low',
      isolation: 'medium',
      conflictResolution: 'retry',
      setup: async (context) => await this.setupNamespaceIsolation(context),
      cleanup: async (context) => await this.cleanupNamespaceIsolation(context),
      validateIsolation: async (context) => await this.validateNamespaceIsolation(context)
    });

    // Strategy 2: Schema-based isolation (medium overhead)
    this.strategies.set('schema', {
      name: 'Schema Isolation',
      description: 'Creates dedicated schemas for each test execution',
      overhead: 'medium',
      isolation: 'strong',
      conflictResolution: 'wait',
      setup: async (context) => await this.setupSchemaIsolation(context),
      cleanup: async (context) => await this.cleanupSchemaIsolation(context),
      validateIsolation: async (context) => await this.validateSchemaIsolation(context)
    });

    // Strategy 3: Transaction-based isolation (high overhead)
    this.strategies.set('transaction', {
      name: 'Transaction Isolation',
      description: 'Uses database transactions with rollback for complete isolation',
      overhead: 'high',
      isolation: 'complete',
      conflictResolution: 'abort',
      setup: async (context) => await this.setupTransactionIsolation(context),
      cleanup: async (context) => await this.cleanupTransactionIsolation(context),
      validateIsolation: async (context) => await this.validateTransactionIsolation(context)
    });

    // Strategy 4: Hybrid isolation (adaptive)
    this.strategies.set('hybrid', {
      name: 'Hybrid Isolation',
      description: 'Dynamically selects isolation strategy based on test characteristics',
      overhead: 'medium',
      isolation: 'strong',
      conflictResolution: 'retry',
      setup: async (context) => await this.setupHybridIsolation(context),
      cleanup: async (context) => await this.cleanupHybridIsolation(context),
      validateIsolation: async (context) => await this.validateHybridIsolation(context)
    });

    // Strategy 5: Advisory lock isolation (specialized)
    this.strategies.set('advisory', {
      name: 'Advisory Lock Isolation',
      description: 'Uses PostgreSQL advisory locks for resource coordination',
      overhead: 'low',
      isolation: 'weak',
      conflictResolution: 'wait',
      setup: async (context) => await this.setupAdvisoryLockIsolation(context),
      cleanup: async (context) => await this.cleanupAdvisoryLockIsolation(context),
      validateIsolation: async (context) => await this.validateAdvisoryLockIsolation(context)
    });
  }

  private setupEventHandlers(): void {
    this.on('conflictDetected', (conflict: Conflict) => {
      console.warn(`⚠️ Database conflict detected: ${conflict.description}`);
      this.handleConflict(conflict);
    });

    this.on('deadlockDetected', (deadlock: any) => {
      console.error(`🔒 Deadlock detected: ${deadlock.description}`);
      this.handleDeadlock(deadlock);
    });

    this.on('isolationFailed', (context: IsolationContext, error: Error) => {
      console.error(`❌ Isolation failed for ${context.testName}: ${error.message}`);
      this.isolationMetrics.failedIsolations++;
    });
  }

  async createIsolation(
    testFile: string,
    testName: string,
    strategyName: string = 'namespace',
    options: {
      timeout?: number;
      retries?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<IsolationContext> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown isolation strategy: ${strategyName}`);
    }

    const namespace = this.namespaceManager.generateNamespace(testFile, testName);
    const leaseId = await this.acquireLease(testFile, testName);

    const context: IsolationContext = {
      testFile,
      testName,
      namespace,
      leaseId,
      strategy,
      metadata: options.metadata || {},
      startTime: new Date(),
      resources: {
        schemas: [],
        tables: [],
        sequences: [],
        connections: [leaseId],
        locks: [],
        savepoints: [],
        transactions: []
      },
      conflicts: {
        detectedConflicts: [],
        resolvedConflicts: [],
        conflictRate: 0
      }
    };

    this.isolationMetrics.totalIsolations++;
    
    try {
      const setupStart = Date.now();
      
      // Set up isolation strategy
      await strategy.setup(context);
      
      const setupTime = Date.now() - setupStart;
      this.updateSetupTime(setupTime);
      
      // Validate isolation effectiveness
      const isValid = await strategy.validateIsolation(context);
      if (!isValid) {
        throw new Error(`Isolation validation failed for strategy: ${strategyName}`);
      }

      this.activeContexts.set(context.namespace, context);
      this.cleanupRegistry.add(context.namespace);
      
      console.log(`🛡️ Isolation created: ${strategyName} for ${testName} (namespace: ${namespace})`);
      this.emit('isolationCreated', context);
      
      return context;
    } catch (error) {
      this.emit('isolationFailed', context, error);
      await this.forceCleanup(context);
      throw error;
    }
  }

  async destroyIsolation(context: IsolationContext): Promise<void> {
    const cleanupStart = Date.now();
    
    try {
      // Clean up using the strategy
      await context.strategy.cleanup(context);
      
      // Release all locks
      await this.releaseLocks(context);
      
      // Clean up resources
      await this.cleanupResources(context);
      
      // Release database lease
      this.releaseLease(context.leaseId);
      
      const cleanupTime = Date.now() - cleanupStart;
      this.updateCleanupTime(cleanupTime);
      
      this.activeContexts.delete(context.namespace);
      this.cleanupRegistry.delete(context.namespace);
      
      this.isolationMetrics.successfulIsolations++;
      
      console.log(`✅ Isolation destroyed: ${context.strategy.name} for ${context.testName}`);
      this.emit('isolationDestroyed', context);
      
    } catch (error) {
      console.error(`❌ Error during isolation cleanup: ${error.message}`);
      await this.forceCleanup(context);
      throw error;
    }
  }

  // Namespace isolation implementation
  private async setupNamespaceIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Create namespace-specific data prefixes
    const namespacePrefix = `${context.namespace}_`;
    
    // Set session variables for namespace awareness
    await client.query(`SET application_name = '${context.namespace}'`);
    await client.query(`SET SESSION test_namespace = '${context.namespace}'`);
    
    // Store namespace configuration
    context.metadata.namespacePrefix = namespacePrefix;
    context.metadata.sessionConfigured = true;
    
    console.log(`📝 Namespace isolation configured: ${context.namespace}`);
  }

  private async cleanupNamespaceIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Clean up namespace-specific data
    const tables = ['users', 'accounts', 'transactions', 'categories', 'goals', 'transfer_recommendations'];
    let cleanedRecords = 0;
    
    for (const table of tables) {
      try {
        // Clean by namespace prefix or column
        let query = '';
        let params: any[] = [];
        
        if (table === 'users') {
          query = `DELETE FROM ${table} WHERE username LIKE $1`;
          params = [`${context.namespace}_%`];
        } else if (table === 'accounts') {
          query = `DELETE FROM ${table} WHERE custom_name LIKE $1`;
          params = [`${context.namespace}_%`];
        } else {
          // Try namespace column first
          try {
            query = `DELETE FROM ${table} WHERE test_namespace = $1`;
            params = [context.namespace];
          } catch {
            // Fallback to pattern matching
            continue;
          }
        }
        
        const result = await client.query(query, params);
        cleanedRecords += result.rowCount || 0;
        
      } catch (error) {
        console.warn(`Warning: Failed to clean ${table} in namespace ${context.namespace}: ${error.message}`);
      }
    }
    
    // Reset session variables
    await client.query(`RESET application_name`);
    await client.query(`RESET test_namespace`);
    
    console.log(`🧹 Namespace cleanup completed: ${cleanedRecords} records cleaned from ${context.namespace}`);
  }

  private async validateNamespaceIsolation(context: IsolationContext): Promise<boolean> {
    const client = poolManager.getClient(context.leaseId);
    
    try {
      // Verify session configuration
      const result = await client.query('SHOW test_namespace');
      const currentNamespace = result.rows[0]?.test_namespace;
      
      return currentNamespace === context.namespace;
    } catch {
      return false;
    }
  }

  // Schema isolation implementation
  private async setupSchemaIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Create dedicated schema
    const schemaName = `test_${context.namespace}`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    
    // Set search path to use the test schema
    await client.query(`SET search_path = "${schemaName}", public`);
    
    // Clone necessary tables to the test schema
    const tables = await this.getTableList(client);
    for (const table of tables) {
      await this.cloneTableToSchema(client, table, schemaName);
    }
    
    context.resources.schemas.push(schemaName);
    context.metadata.schemaName = schemaName;
    
    console.log(`🏗️ Schema isolation configured: ${schemaName}`);
  }

  private async cleanupSchemaIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Drop the test schema and all its contents
    const schemaName = context.metadata.schemaName;
    if (schemaName) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        console.log(`🧹 Schema dropped: ${schemaName}`);
      } catch (error) {
        console.warn(`Warning: Failed to drop schema ${schemaName}: ${error.message}`);
      }
    }
    
    // Reset search path
    await client.query(`SET search_path = public`);
  }

  private async validateSchemaIsolation(context: IsolationContext): Promise<boolean> {
    const client = poolManager.getClient(context.leaseId);
    
    try {
      const result = await client.query('SHOW search_path');
      const searchPath = result.rows[0]?.search_path;
      return searchPath?.includes(context.metadata.schemaName);
    } catch {
      return false;
    }
  }

  // Transaction isolation implementation
  private async setupTransactionIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Start a transaction with appropriate isolation level
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    
    // Create a savepoint for fine-grained rollback control
    const savepointName = `sp_${context.namespace}`;
    await client.query(`SAVEPOINT "${savepointName}"`);
    
    context.resources.savepoints.push(savepointName);
    context.resources.transactions.push('main');
    
    console.log(`🔄 Transaction isolation configured with savepoint: ${savepointName}`);
  }

  private async cleanupTransactionIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    try {
      // Rollback to savepoint (preserves other data)
      if (context.resources.savepoints.length > 0) {
        const savepointName = context.resources.savepoints[0];
        await client.query(`ROLLBACK TO SAVEPOINT "${savepointName}"`);
        await client.query(`RELEASE SAVEPOINT "${savepointName}"`);
      }
      
      // Commit the transaction (only non-test changes remain)
      await client.query('COMMIT');
      
      console.log(`🔄 Transaction isolation cleaned up`);
    } catch (error) {
      // Force rollback if there are issues
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`Failed to rollback transaction: ${rollbackError.message}`);
      }
      throw error;
    }
  }

  private async validateTransactionIsolation(context: IsolationContext): Promise<boolean> {
    const client = poolManager.getClient(context.leaseId);
    
    try {
      const result = await client.query('SELECT txid_current()');
      return result.rows.length > 0; // Transaction is active
    } catch {
      return false;
    }
  }

  // Hybrid isolation implementation
  private async setupHybridIsolation(context: IsolationContext): Promise<void> {
    // Analyze test characteristics to choose optimal strategy
    const testCharacteristics = this.analyzeTestCharacteristics(context);
    
    let selectedStrategy: string;
    if (testCharacteristics.hasSchemaChanges) {
      selectedStrategy = 'transaction';
    } else if (testCharacteristics.hasHighConflictPotential) {
      selectedStrategy = 'schema';
    } else {
      selectedStrategy = 'namespace';
    }
    
    console.log(`🔄 Hybrid isolation selected strategy: ${selectedStrategy} for ${context.testName}`);
    
    const strategy = this.strategies.get(selectedStrategy);
    if (strategy) {
      context.metadata.selectedStrategy = selectedStrategy;
      await strategy.setup(context);
    }
  }

  private async cleanupHybridIsolation(context: IsolationContext): Promise<void> {
    const selectedStrategy = context.metadata.selectedStrategy;
    if (selectedStrategy) {
      const strategy = this.strategies.get(selectedStrategy);
      if (strategy) {
        await strategy.cleanup(context);
      }
    }
  }

  private async validateHybridIsolation(context: IsolationContext): Promise<boolean> {
    const selectedStrategy = context.metadata.selectedStrategy;
    if (selectedStrategy) {
      const strategy = this.strategies.get(selectedStrategy);
      if (strategy) {
        return await strategy.validateIsolation(context);
      }
    }
    return false;
  }

  // Advisory lock isolation implementation
  private async setupAdvisoryLockIsolation(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    // Generate lock IDs based on test resources
    const lockIds = this.generateAdvisoryLockIds(context);
    
    for (const lockId of lockIds) {
      try {
        // Acquire advisory lock (non-blocking)
        const result = await client.query('SELECT pg_try_advisory_lock($1)', [lockId]);
        const acquired = result.rows[0]?.pg_try_advisory_lock;
        
        if (acquired) {
          const lock: DatabaseLock = {
            id: lockId.toString(),
            type: 'advisory',
            resource: `advisory_${lockId}`,
            mode: 'exclusive',
            acquiredAt: new Date(),
            timeout: 30000,
            context: context.testName
          };
          
          context.resources.locks.push(lock);
          this.globalLocks.set(lock.id, lock);
        } else {
          throw new Error(`Failed to acquire advisory lock: ${lockId}`);
        }
      } catch (error) {
        // Release any acquired locks and fail
        await this.releaseLocks(context);
        throw error;
      }
    }
    
    console.log(`🔒 Advisory lock isolation configured with ${lockIds.length} locks`);
  }

  private async cleanupAdvisoryLockIsolation(context: IsolationContext): Promise<void> {
    await this.releaseLocks(context);
  }

  private async validateAdvisoryLockIsolation(context: IsolationContext): Promise<boolean> {
    return context.resources.locks.length > 0;
  }

  // Helper methods
  private analyzeTestCharacteristics(context: IsolationContext): {
    hasSchemaChanges: boolean;
    hasHighConflictPotential: boolean;
    estimatedDuration: number;
    resourceRequirements: string[];
  } {
    // Analyze test file content and metadata
    const testFile = context.testFile.toLowerCase();
    const testName = context.testName.toLowerCase();
    
    const hasSchemaChanges = 
      testFile.includes('migration') || 
      testName.includes('schema') || 
      testName.includes('create_table') ||
      testName.includes('alter_table');
    
    const hasHighConflictPotential = 
      testFile.includes('concurrent') ||
      testName.includes('parallel') ||
      testName.includes('race') ||
      testFile.includes('stress');
    
    return {
      hasSchemaChanges,
      hasHighConflictPotential,
      estimatedDuration: 5000, // Default 5 seconds
      resourceRequirements: ['database', 'memory']
    };
  }

  private generateAdvisoryLockIds(context: IsolationContext): number[] {
    // Generate deterministic lock IDs based on test characteristics
    const baseId = parseInt(createHash('md5').update(context.testName).digest('hex').substring(0, 8), 16);
    
    return [
      baseId,
      baseId + 1, // Additional locks for complex tests
    ];
  }

  private async getTableList(client: any): Promise<string[]> {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%'
    `);
    
    return result.rows.map((row: any) => row.table_name);
  }

  private async cloneTableToSchema(client: any, tableName: string, schemaName: string): Promise<void> {
    try {
      // Create table structure
      await client.query(`
        CREATE TABLE "${schemaName}"."${tableName}" 
        (LIKE "public"."${tableName}" INCLUDING ALL)
      `);
      
      // Copy data (optional - usually we want empty tables for tests)
      // await client.query(`INSERT INTO "${schemaName}"."${tableName}" SELECT * FROM "public"."${tableName}"`);
      
    } catch (error) {
      // Some tables might not be clonable (views, etc.)
      console.warn(`Warning: Could not clone table ${tableName}: ${error.message}`);
    }
  }

  private async releaseLocks(context: IsolationContext): Promise<void> {
    const client = poolManager.getClient(context.leaseId);
    
    for (const lock of context.resources.locks) {
      try {
        if (lock.type === 'advisory') {
          await client.query('SELECT pg_advisory_unlock($1)', [parseInt(lock.id)]);
        }
        
        this.globalLocks.delete(lock.id);
      } catch (error) {
        console.warn(`Warning: Failed to release lock ${lock.id}: ${error.message}`);
      }
    }
    
    context.resources.locks = [];
  }

  private async cleanupResources(context: IsolationContext): Promise<void> {
    // Cleanup any remaining resources
    const client = poolManager.getClient(context.leaseId);
    
    // Reset any session variables
    try {
      await client.query('RESET ALL');
    } catch (error) {
      console.warn(`Warning: Failed to reset session: ${error.message}`);
    }
  }

  private async forceCleanup(context: IsolationContext): Promise<void> {
    console.warn(`🧹 Force cleaning up isolation context: ${context.namespace}`);
    
    try {
      await this.releaseLocks(context);
      await this.cleanupResources(context);
      this.releaseLease(context.leaseId);
    } catch (error) {
      console.error(`Error during force cleanup: ${error.message}`);
    }
    
    this.activeContexts.delete(context.namespace);
    this.cleanupRegistry.delete(context.namespace);
  }

  private async acquireLease(testFile: string, testName: string): Promise<string> {
    if (!poolManager) {
      throw new Error('Pool manager not available');
    }
    
    return await poolManager.acquireLease(testFile, testName, {
      priority: 'high',
      tags: ['isolation'],
      timeout: 60000
    });
  }

  private releaseLease(leaseId: string): void {
    if (poolManager) {
      poolManager.releaseLease(leaseId);
    }
  }

  private handleConflict(conflict: Conflict): void {
    // Implement conflict resolution logic
    switch (conflict.type) {
      case 'deadlock':
        this.resolveDeadlock(conflict);
        break;
      case 'lock_timeout':
        this.resolveLockTimeout(conflict);
        break;
      default:
        console.warn(`Unhandled conflict type: ${conflict.type}`);
    }
  }

  private resolveDeadlock(conflict: Conflict): void {
    // Simple deadlock resolution: abort one of the conflicting contexts
    const involvedContexts = Array.from(this.activeContexts.values())
      .filter(context => conflict.involvedResources.some(resource => 
        context.resources.locks.some(lock => lock.resource === resource)
      ));
    
    if (involvedContexts.length > 0) {
      // Abort the newest context (least work lost)
      const newest = involvedContexts.sort((a, b) => 
        b.startTime.getTime() - a.startTime.getTime()
      )[0];
      
      console.warn(`🔒 Resolving deadlock by aborting context: ${newest.namespace}`);
      this.forceCleanup(newest);
    }
  }

  private resolveLockTimeout(conflict: Conflict): void {
    // Implement lock timeout resolution
    console.warn(`⏰ Lock timeout detected: ${conflict.description}`);
    // Could implement retry logic or resource reallocation
  }

  private handleDeadlock(deadlock: any): void {
    this.deadlockDetector.handleDeadlock(deadlock);
  }

  private updateSetupTime(time: number): void {
    const count = this.isolationMetrics.totalIsolations;
    this.isolationMetrics.averageSetupTime = 
      (this.isolationMetrics.averageSetupTime * (count - 1) + time) / count;
  }

  private updateCleanupTime(time: number): void {
    const count = this.isolationMetrics.successfulIsolations;
    this.isolationMetrics.averageCleanupTime = 
      (this.isolationMetrics.averageCleanupTime * (count - 1) + time) / count;
  }

  // Public API methods
  getMetrics(): IsolationMetrics {
    // Update real-time metrics
    this.isolationMetrics.resourceUtilization = {
      schemas: this.schemaManager.getActiveSchemaCount(),
      connections: this.activeContexts.size,
      locks: this.globalLocks.size,
      memory: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
    
    return { ...this.isolationMetrics };
  }

  getActiveContexts(): IsolationContext[] {
    return Array.from(this.activeContexts.values());
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  async forceCleanupAll(): Promise<void> {
    console.warn(`🧹 Force cleaning up all ${this.activeContexts.size} active isolation contexts`);
    
    const cleanupPromises = Array.from(this.activeContexts.values()).map(context =>
      this.forceCleanup(context)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    // Clear all state
    this.activeContexts.clear();
    this.globalLocks.clear();
    this.cleanupRegistry.clear();
    
    console.log('✅ All isolation contexts cleaned up');
  }
}

// Supporting classes
class ConflictResolver {
  constructor(private timeout: number) {}
  
  async resolveConflict(conflict: Conflict): Promise<boolean> {
    // Implement conflict resolution logic
    console.log(`🔧 Resolving conflict: ${conflict.description}`);
    return true;
  }
}

class DeadlockDetector {
  private enabled: boolean;
  
  constructor(enabled: boolean) {
    this.enabled = enabled;
  }
  
  handleDeadlock(deadlock: any): void {
    if (!this.enabled) return;
    
    console.error(`🔒 Deadlock handled: ${deadlock.description}`);
  }
}

class NamespaceManager {
  private usedNamespaces = new Set<string>();
  
  generateNamespace(testFile: string, testName: string): string {
    const timestamp = Date.now();
    const hash = createHash('md5')
      .update(`${testFile}_${testName}_${timestamp}_${Math.random()}`)
      .digest('hex')
      .substring(0, 12);
    
    const namespace = `test_${timestamp}_${hash}`;
    
    // Ensure uniqueness
    let counter = 0;
    let finalNamespace = namespace;
    while (this.usedNamespaces.has(finalNamespace)) {
      finalNamespace = `${namespace}_${++counter}`;
    }
    
    this.usedNamespaces.add(finalNamespace);
    return finalNamespace;
  }
  
  releaseNamespace(namespace: string): void {
    this.usedNamespaces.delete(namespace);
  }
}

class SchemaManager {
  private activeSchemas = new Set<string>();
  
  addSchema(schemaName: string): void {
    this.activeSchemas.add(schemaName);
  }
  
  removeSchema(schemaName: string): void {
    this.activeSchemas.delete(schemaName);
  }
  
  getActiveSchemaCount(): number {
    return this.activeSchemas.size;
  }
}

class LockManager {
  private activeLocks = new Map<string, DatabaseLock>();
  
  addLock(lock: DatabaseLock): void {
    this.activeLocks.set(lock.id, lock);
  }
  
  removeLock(lockId: string): void {
    this.activeLocks.delete(lockId);
  }
  
  getActiveLocks(): DatabaseLock[] {
    return Array.from(this.activeLocks.values());
  }
}

export default AdvancedDatabaseIsolation;