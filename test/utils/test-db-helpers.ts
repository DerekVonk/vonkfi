import { TestConnectionPoolManager } from './connection-pool-manager';
import { poolManager } from '../setup';
import { beforeEach, afterEach } from 'vitest';
import { promisify } from 'util';
import { createHash } from 'crypto';

export interface TestTransaction {
  leaseId: string;
  transactionId: string;
  startTime: Date;
  timeout?: NodeJS.Timeout;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  isCommitted: boolean;
  isRolledBack: boolean;
  savepoints: string[];
}

export class TestDatabaseHelpers {
  private static activeTransactions = new Map<string, TestTransaction>();
  private static filePoolManagers = new Map<string, TestConnectionPoolManager>();
  private static transactionTimeout = 30000; // 30 seconds default timeout
  private static maxConcurrentTransactions = 50;
  private static isolationCounter = 0;
  private static cleanupRegistry = new Set<string>();

  static async getConnectionLease(
    testFile: string, 
    testName: string,
    options: {
      priority?: 'low' | 'normal' | 'high';
      timeout?: number;
      expectedDuration?: number;
    } = {}
  ): Promise<string> {
    if (!poolManager) {
      throw new Error('Database pool manager not available - tests may be running in mock mode');
    }
    
    // Input validation
    if (!testFile || !testName) {
      throw new Error('testFile and testName are required');
    }
    
    if (typeof testFile !== 'string' || typeof testName !== 'string') {
      throw new Error('testFile and testName must be strings');
    }
    
    // Sanitize inputs
    const sanitizedTestFile = testFile.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sanitizedTestName = testName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    try {
      const leaseId = await poolManager.acquireLease(sanitizedTestFile, sanitizedTestName, options);
      this.cleanupRegistry.add(leaseId);
      return leaseId;
    } catch (error) {
      console.error(`Failed to acquire connection lease for ${sanitizedTestFile}:${sanitizedTestName}:`, error);
      throw error;
    }
  }

  static releaseConnectionLease(leaseId: string): void {
    if (!leaseId || typeof leaseId !== 'string') {
      console.warn('Invalid lease ID provided for release');
      return;
    }
    
    if (poolManager) {
      try {
        poolManager.releaseLease(leaseId);
        this.cleanupRegistry.delete(leaseId);
      } catch (error) {
        console.error(`Error releasing lease ${leaseId}:`, error);
      }
    }
  }

  static async withTransaction<T>(
    testFile: string, 
    testName: string, 
    operation: (leaseId: string, transaction: TestTransaction) => Promise<T>,
    options: {
      timeout?: number;
      isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
      readOnly?: boolean;
    } = {}
  ): Promise<T> {
    // Validate concurrent transaction limits
    if (this.activeTransactions.size >= this.maxConcurrentTransactions) {
      throw new Error(`Maximum concurrent transactions limit reached (${this.maxConcurrentTransactions})`);
    }
    
    const leaseId = await this.getConnectionLease(testFile, testName, {
      expectedDuration: options.timeout || this.transactionTimeout
    });
    
    const transactionId = this.generateTransactionId();
    const timeout = options.timeout || this.transactionTimeout;
    
    let timeoutHandle: NodeJS.Timeout | undefined;
    
    try {
      const client = poolManager.getClient(leaseId);
      
      // Set isolation level if specified
      if (options.isolationLevel) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }
      
      // Set transaction as read-only if specified
      if (options.readOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }
      
      await client.query('BEGIN');
      
      const transaction: TestTransaction = {
        leaseId,
        transactionId,
        startTime: new Date(),
        isCommitted: false,
        isRolledBack: false,
        savepoints: [],
        commit: async () => {
          if (transaction.isCommitted || transaction.isRolledBack) {
            throw new Error('Transaction already completed');
          }
          
          try {
            await client.query('COMMIT');
            transaction.isCommitted = true;
            this.activeTransactions.delete(transactionId);
            
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          } catch (error) {
            console.error(`Error committing transaction ${transactionId}:`, error);
            throw error;
          }
        },
        rollback: async () => {
          if (transaction.isCommitted || transaction.isRolledBack) {
            console.warn(`Attempted to rollback already completed transaction ${transactionId}`);
            return;
          }
          
          try {
            await client.query('ROLLBACK');
            transaction.isRolledBack = true;
            this.activeTransactions.delete(transactionId);
            
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          } catch (error) {
            console.error(`Error rolling back transaction ${transactionId}:`, error);
            throw error;
          }
        }
      };
      
      // Set up transaction timeout
      timeoutHandle = setTimeout(async () => {
        if (!transaction.isCommitted && !transaction.isRolledBack) {
          console.warn(`Transaction ${transactionId} timed out after ${timeout}ms - forcing rollback`);
          try {
            await transaction.rollback();
          } catch (error) {
            console.error(`Error during timeout rollback for transaction ${transactionId}:`, error);
          }
        }
      }, timeout);
      
      transaction.timeout = timeoutHandle;
      this.activeTransactions.set(transactionId, transaction);
      
      const result = await operation(leaseId, transaction);
      
      // Auto-rollback if not explicitly committed or rolled back
      if (!transaction.isCommitted && !transaction.isRolledBack) {
        console.log(`Auto-rolling back uncommitted transaction ${transactionId}`);
        await transaction.rollback();
      }
      
      return result;
    } catch (error) {
      // Ensure rollback on error
      if (this.activeTransactions.has(transactionId)) {
        const transaction = this.activeTransactions.get(transactionId)!;
        if (!transaction.isCommitted && !transaction.isRolledBack) {
          try {
            await transaction.rollback();
          } catch (rollbackError) {
            console.error(`Error during error rollback for transaction ${transactionId}:`, rollbackError);
          }
        }
      }
      
      throw error;
    } finally {
      // Clean up timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      
      // Ensure transaction is removed from active list
      this.activeTransactions.delete(transactionId);
      
      // Release the lease
      this.releaseConnectionLease(leaseId);
    }
  }
  
  private static generateTransactionId(): string {
    return createHash('sha256')
      .update(`${Date.now()}_${Math.random()}_${process.pid}_${++this.isolationCounter}`)
      .digest('hex')
      .substring(0, 16);
  }

  static async withIsolatedData<T>(
    testFile: string,
    testName: string,
    operation: (leaseId: string, namespace: string) => Promise<T>,
    options: {
      cleanupOnError?: boolean;
      retainDataOnSuccess?: boolean;
      customNamespace?: string;
    } = {}
  ): Promise<T> {
    const namespace = options.customNamespace || this.generateTestNamespace();
    const leaseId = await this.getConnectionLease(testFile, testName);
    
    try {
      // Create isolated namespace for test data with transaction
      return await this.withTransaction(
        testFile,
        testName + '_isolated',
        async (transactionLeaseId, transaction) => {
          const result = await operation(transactionLeaseId, namespace);
          
          // Clean up namespaced data if requested (default behavior)
          if (!options.retainDataOnSuccess) {
            const client = poolManager.getClient(transactionLeaseId);
            await this.cleanupNamespacedData(client, namespace);
          }
          
          // Commit the transaction
          await transaction.commit();
          
          return result;
        },
        {
          timeout: 60000 // Longer timeout for data operations
        }
      );
    } catch (error) {
      // If cleanup on error is enabled, attempt cleanup in a separate transaction
      if (options.cleanupOnError) {
        try {
          const cleanupLeaseId = await this.getConnectionLease(testFile, testName + '_cleanup');
          const cleanupClient = poolManager.getClient(cleanupLeaseId);
          await this.cleanupNamespacedData(cleanupClient, namespace);
          this.releaseConnectionLease(cleanupLeaseId);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup namespace ${namespace} after error:`, cleanupError);
        }
      }
      
      throw error;
    }
  }
  
  private static generateTestNamespace(): string {
    return `test_${Date.now()}_${createHash('sha256')
      .update(`${Math.random()}_${process.pid}_${++this.isolationCounter}`)
      .digest('hex')
      .substring(0, 12)}`;
  }

  private static async cleanupNamespacedData(client: any, namespace: string): Promise<void> {
    // Enhanced cleanup with proper error handling and validation
    if (!namespace || typeof namespace !== 'string') {
      throw new Error('Invalid namespace provided for cleanup');
    }
    
    // Validate namespace format to prevent SQL injection
    if (!/^test_\d+_[a-zA-Z0-9_]+$/.test(namespace)) {
      throw new Error('Invalid namespace format - security violation');
    }
    
    const tables = [
      'transaction_hashes',
      'transfer_recommendations', 
      'goals',
      'transactions',
      'accounts',
      'import_history',
      'users',
      'categories'
    ];

    let cleanupCount = 0;
    const cleanupResults: Array<{table: string, count: number, error?: string}> = [];

    for (const table of tables) {
      try {
        let deleteCount = 0;
        
        // Enhanced cleanup with parameterized queries to prevent SQL injection
        if (table === 'users') {
          const result = await client.query(
            `DELETE FROM ${table} WHERE username LIKE $1`,
            [`${namespace}_%`]
          );
          deleteCount = result.rowCount || 0;
        } else if (table === 'categories') {
          const result = await client.query(
            `DELETE FROM ${table} WHERE name LIKE $1`,
            [`${namespace}_%`]
          );
          deleteCount = result.rowCount || 0;
        } else if (table === 'accounts') {
          const result = await client.query(
            `DELETE FROM ${table} WHERE custom_name LIKE $1`,
            [`${namespace}_%`]
          );
          deleteCount = result.rowCount || 0;
        } else {
          // For other tables, check if they have a test_namespace column
          try {
            const result = await client.query(
              `DELETE FROM ${table} WHERE test_namespace = $1`,
              [namespace]
            );
            deleteCount = result.rowCount || 0;
          } catch (error) {
            // If test_namespace column doesn't exist, skip with warning
            console.debug(`Table ${table} doesn't have test_namespace column, skipping`);
          }
        }
        
        cleanupCount += deleteCount;
        cleanupResults.push({ table, count: deleteCount });
        
        if (deleteCount > 0) {
          console.debug(`Cleaned ${deleteCount} records from ${table} for namespace ${namespace}`);
        }
      } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        console.warn(`Failed to clean ${table} for namespace ${namespace}: ${errorMessage}`);
        cleanupResults.push({ table, count: 0, error: errorMessage });
      }
    }
    
    console.log(`Namespace cleanup completed for ${namespace}: ${cleanupCount} total records cleaned`);
    
    // Emit cleanup event for monitoring
    if (poolManager) {
      poolManager.emit('namespaceCleanup', {
        namespace,
        totalRecords: cleanupCount,
        results: cleanupResults,
        timestamp: new Date()
      });
    }
  }

  static async withRowLevelLocking<T>(
    testFile: string,
    testName: string,
    tableName: string,
    whereClause: string,
    params: any[],
    operation: (leaseId: string) => Promise<T>,
    options: {
      lockTimeout?: number;
      lockMode?: 'FOR UPDATE' | 'FOR SHARE' | 'FOR NO KEY UPDATE' | 'FOR KEY SHARE';
      nowait?: boolean;
      skipLocked?: boolean;
    } = {}
  ): Promise<T> {
    // Enhanced input validation
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name provided');
    }
    
    if (!whereClause || typeof whereClause !== 'string') {
      throw new Error('Invalid where clause provided');
    }
    
    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error('Invalid table name format - security violation');
    }
    
    const lockMode = options.lockMode || 'FOR UPDATE';
    const lockTimeout = options.lockTimeout || 30000;
    
    return await this.withTransaction(
      testFile,
      testName + '_row_lock',
      async (leaseId, transaction) => {
        const client = poolManager.getClient(leaseId);
        
        // Set lock timeout if specified
        if (lockTimeout && lockTimeout !== 30000) {
          await client.query(`SET lock_timeout = ${lockTimeout}`);
        }
        
        try {
          // Build lock query with options
          let lockQuery = `SELECT * FROM ${tableName} WHERE ${whereClause} ${lockMode}`;
          
          if (options.nowait) {
            lockQuery += ' NOWAIT';
          } else if (options.skipLocked) {
            lockQuery += ' SKIP LOCKED';
          }
          
          // Acquire row-level lock
          const lockResult = await client.query(lockQuery, params);
          
          console.debug(`Acquired ${lockMode} lock on ${lockResult.rowCount || 0} rows in ${tableName}`);
          
          const result = await operation(leaseId);
          
          // Commit transaction
          await transaction.commit();
          
          return result;
        } catch (error) {
          // Enhanced error handling for lock-specific errors
          if (error.message.includes('could not obtain lock')) {
            throw new Error(`Row-level lock timeout on ${tableName}: ${error.message}`);
          } else if (error.message.includes('deadlock detected')) {
            throw new Error(`Deadlock detected while acquiring lock on ${tableName}: ${error.message}`);
          }
          
          throw error;
        } finally {
          // Reset lock timeout
          if (lockTimeout && lockTimeout !== 30000) {
            try {
              await client.query('SET lock_timeout = DEFAULT');
            } catch (resetError) {
              console.warn('Failed to reset lock timeout:', resetError);
            }
          }
        }
      },
      {
        timeout: lockTimeout + 5000, // Add buffer for transaction timeout
        isolationLevel: 'READ_COMMITTED' // Appropriate isolation level for locking
      }
    );
  }

  static getPerFilePoolManager(testFile: string): TestConnectionPoolManager {
    if (!testFile || typeof testFile !== 'string') {
      throw new Error('Invalid test file name provided');
    }
    
    const normalizedFile = testFile.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    if (normalizedFile.length === 0) {
      throw new Error('Test file name resulted in empty normalized name');
    }
    
    if (!this.filePoolManagers.has(normalizedFile)) {
      if (!poolManager) {
        throw new Error('Main pool manager not available');
      }

      const baseConfig = {
        host: process.env.TEST_DATABASE_HOST || 'localhost',
        port: parseInt(process.env.TEST_DATABASE_PORT || '5434'),
        database: process.env.TEST_DATABASE_NAME || 'vonkfi_test',
        user: process.env.TEST_DATABASE_USER || 'test',
        password: process.env.TEST_DATABASE_PASSWORD || 'test',
        max: 5, // Smaller pools per file
        min: 1,
        maxLeaseTime: 20000,
        healthCheckInterval: 10000,
        enableMetrics: true,
        enableGracefulShutdown: true,
        shutdownTimeoutMs: 5000 // Shorter timeout for per-file pools
      };

      try {
        const filePoolManager = TestConnectionPoolManager.createPerFilePool(normalizedFile, baseConfig);
        this.filePoolManagers.set(normalizedFile, filePoolManager);
        
        // Set up error handling for the file pool
        filePoolManager.on('error', (error) => {
          console.error(`Error in file pool manager for ${normalizedFile}:`, error);
        });
        
        console.log(`Created per-file pool manager for ${normalizedFile}`);
      } catch (error) {
        console.error(`Failed to create per-file pool manager for ${normalizedFile}:`, error);
        throw error;
      }
    }

    return this.filePoolManagers.get(normalizedFile)!;
  }

  static async cleanupFilePool(testFile: string): Promise<void> {
    const normalizedFile = testFile.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filePoolManager = this.filePoolManagers.get(normalizedFile);
    
    if (filePoolManager) {
      await filePoolManager.destroy();
      this.filePoolManagers.delete(normalizedFile);
    }
  }

  static async cleanupAllFilePools(): Promise<void> {
    console.log(`Cleaning up ${this.filePoolManagers.size} file pool managers...`);
    
    const cleanupPromises = Array.from(this.filePoolManagers.entries()).map(
      async ([fileName, poolManager]) => {
        try {
          await poolManager.destroy();
          console.log(`Successfully cleaned up pool for ${fileName}`);
        } catch (error) {
          console.error(`Error cleaning up pool for ${fileName}:`, error);
        }
      }
    );
    
    await Promise.allSettled(cleanupPromises);
    this.filePoolManagers.clear();
    
    // Clean up any remaining active transactions
    if (this.activeTransactions.size > 0) {
      console.warn(`Cleaning up ${this.activeTransactions.size} remaining active transactions`);
      await this.forceCleanupActiveTransactions();
    }
    
    // Clean up the cleanup registry
    this.cleanupRegistry.clear();
    
    console.log('All file pools cleaned up successfully');
  }
  
  private static async forceCleanupActiveTransactions(): Promise<void> {
    const cleanupPromises = Array.from(this.activeTransactions.values()).map(
      async (transaction) => {
        try {
          if (!transaction.isCommitted && !transaction.isRolledBack) {
            await transaction.rollback();
          }
        } catch (error) {
          console.error(`Error during force cleanup of transaction ${transaction.transactionId}:`, error);
        }
      }
    );
    
    await Promise.allSettled(cleanupPromises);
    this.activeTransactions.clear();
  }

  static getPoolMetrics() {
    if (!poolManager) return null;
    return poolManager.getMetrics();
  }

  static getActiveLeases() {
    if (!poolManager) return [];
    return poolManager.getActiveLeases();
  }

  static async performHealthCheck(): Promise<boolean> {
    if (!poolManager) return false;
    return await poolManager.healthCheck();
  }
}

// Enhanced Vitest hooks for automatic cleanup with better error handling
export function setupTestDatabaseHelpers() {
  let currentTestFile: string;
  let currentTestName: string;
  let testStartTime: Date;

  beforeEach((context) => {
    currentTestFile = context.task?.file?.name || 'unknown';
    currentTestName = context.task?.name || 'unknown';
    testStartTime = new Date();
    
    console.debug(`Starting test: ${currentTestFile}:${currentTestName}`);
  });

  afterEach(async () => {
    const testDuration = Date.now() - testStartTime.getTime();
    console.debug(`Cleaning up after test: ${currentTestFile}:${currentTestName} (duration: ${testDuration}ms)`);
    
    try {
      // Clean up any remaining transactions for this test
      const activeTransactions = TestDatabaseHelpers['activeTransactions'] as Map<string, TestTransaction>;
      const transactionsToCleanup = Array.from(activeTransactions.values())
        .filter(tx => tx.leaseId.includes(currentTestName) || tx.transactionId.includes(currentTestName));
      
      if (transactionsToCleanup.length > 0) {
        console.warn(`Found ${transactionsToCleanup.length} active transactions to cleanup for ${currentTestName}`);
        
        for (const transaction of transactionsToCleanup) {
          try {
            if (!transaction.isCommitted && !transaction.isRolledBack) {
              await transaction.rollback();
            }
          } catch (error) {
            console.error(`Failed to rollback transaction ${transaction.transactionId}:`, error);
          }
        }
      }

      // Release any leases for this test file
      if (poolManager) {
        await poolManager.releaseAllLeases(currentTestFile);
      }
      
      // Clean up entries from cleanup registry
      const cleanupRegistry = TestDatabaseHelpers['cleanupRegistry'] as Set<string>;
      const leasesToCleanup = Array.from(cleanupRegistry)
        .filter(leaseId => leaseId.includes(currentTestName));
      
      for (const leaseId of leasesToCleanup) {
        TestDatabaseHelpers.releaseConnectionLease(leaseId);
      }
      
    } catch (error) {
      console.error(`Error during test cleanup for ${currentTestName}:`, error);
    }
  });
}

// Enhanced cleanup function for test suites
export async function cleanupTestSuite(): Promise<void> {
  try {
    console.log('Starting comprehensive test suite cleanup...');
    
    // Force cleanup all active transactions
    await TestDatabaseHelpers['forceCleanupActiveTransactions']();
    
    // Clean up all file pools
    await TestDatabaseHelpers.cleanupAllFilePools();
    
    // Clean up the main pool if available
    if (poolManager) {
      await poolManager.releaseAllLeases();
    }
    
    console.log('Test suite cleanup completed successfully');
  } catch (error) {
    console.error('Error during test suite cleanup:', error);
    throw error;
  }
}

// Enhanced convenience functions for common test patterns
export const testWithTransaction = TestDatabaseHelpers.withTransaction.bind(TestDatabaseHelpers);
export const testWithIsolatedData = TestDatabaseHelpers.withIsolatedData.bind(TestDatabaseHelpers);
export const testWithRowLocking = TestDatabaseHelpers.withRowLevelLocking.bind(TestDatabaseHelpers);
export const getTestLease = TestDatabaseHelpers.getConnectionLease.bind(TestDatabaseHelpers);
export const releaseTestLease = TestDatabaseHelpers.releaseConnectionLease.bind(TestDatabaseHelpers);

// Additional utility functions
export function getActiveTransactionCount(): number {
  const activeTransactions = TestDatabaseHelpers['activeTransactions'] as Map<string, TestTransaction>;
  return activeTransactions.size;
}

export function getActiveLeaseCount(): number {
  const cleanupRegistry = TestDatabaseHelpers['cleanupRegistry'] as Set<string>;
  return cleanupRegistry.size;
}

export function getTestDatabaseStats(): {
  activeTransactions: number;
  activeLeases: number;
  filePoolManagers: number;
  uptime: number;
} {
  const activeTransactions = TestDatabaseHelpers['activeTransactions'] as Map<string, TestTransaction>;
  const cleanupRegistry = TestDatabaseHelpers['cleanupRegistry'] as Set<string>;
  const filePoolManagers = TestDatabaseHelpers['filePoolManagers'] as Map<string, TestConnectionPoolManager>;
  
  return {
    activeTransactions: activeTransactions.size,
    activeLeases: cleanupRegistry.size,
    filePoolManagers: filePoolManagers.size,
    uptime: poolManager ? poolManager.getMetrics().uptimeMs : 0
  };
}

// Enhanced error handling wrapper
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: {
    retries?: number;
    retryDelay?: number;
    logErrors?: boolean;
  } = {}
): Promise<T> {
  const { retries = 0, retryDelay = 1000, logErrors = true } = options;
  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (logErrors) {
        console.error(`Error in ${context} (attempt ${attempt + 1}/${retries + 1}):`, error);
      }
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError!;
}