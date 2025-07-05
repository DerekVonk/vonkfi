/**
 * Concurrency control utilities for preventing race conditions
 * in transfer recommendation generation and execution
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Error thrown when a lock cannot be acquired
 */
export class LockAcquisitionError extends Error {
  constructor(message: string, public lockType: string, public resourceId: string) {
    super(message);
    this.name = 'LockAcquisitionError';
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Interface for lock management
 */
export interface Lock {
  id: string;
  release(): Promise<void>;
}

/**
 * Concurrency control manager
 */
export class ConcurrencyController {
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly LOCK_CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly MAX_LOCK_AGE = 300000; // 5 minutes
  
  private activeLocks = new Map<string, { timestamp: number; promise: Promise<void> }>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleLocks();
    }, this.LOCK_CLEANUP_INTERVAL);
  }

  /**
   * Acquires an exclusive lock for transfer recommendation generation
   */
  async acquireTransferRecommendationLock(userId: number, timeout = this.DEFAULT_TIMEOUT): Promise<Lock> {
    const lockId = `transfer_recommendation_${userId}`;
    return this.acquireLock(lockId, 'transfer_recommendation', userId.toString(), timeout);
  }

  /**
   * Acquires an exclusive lock for transfer execution
   */
  async acquireTransferExecutionLock(fromAccountId: number, toAccountId: number, timeout = this.DEFAULT_TIMEOUT): Promise<Lock> {
    // Sort account IDs to prevent deadlocks
    const sortedIds = [fromAccountId, toAccountId].sort((a, b) => a - b);
    const lockId = `transfer_execution_${sortedIds[0]}_${sortedIds[1]}`;
    return this.acquireLock(lockId, 'transfer_execution', `${fromAccountId}-${toAccountId}`, timeout);
  }

  /**
   * Acquires an exclusive lock for account balance updates
   */
  async acquireAccountLock(accountId: number, timeout = this.DEFAULT_TIMEOUT): Promise<Lock> {
    const lockId = `account_${accountId}`;
    return this.acquireLock(lockId, 'account', accountId.toString(), timeout);
  }

  /**
   * Acquires multiple account locks atomically
   */
  async acquireMultipleAccountLocks(accountIds: number[], timeout = this.DEFAULT_TIMEOUT): Promise<Lock[]> {
    // Sort to prevent deadlocks
    const sortedIds = [...accountIds].sort((a, b) => a - b);
    const locks: Lock[] = [];

    try {
      for (const accountId of sortedIds) {
        const lock = await this.acquireAccountLock(accountId, timeout);
        locks.push(lock);
      }
      return locks;
    } catch (error) {
      // Release any acquired locks on failure
      await this.releaseMultipleLocks(locks);
      throw error;
    }
  }

  /**
   * Releases multiple locks
   */
  async releaseMultipleLocks(locks: Lock[]): Promise<void> {
    const releasePromises = locks.map(lock => 
      lock.release().catch(error => 
        console.warn(`Failed to release lock ${lock.id}:`, error)
      )
    );
    await Promise.all(releasePromises);
  }

  /**
   * Executes a function with automatic lock management
   */
  async withLock<T>(
    lockId: string, 
    lockType: string, 
    resourceId: string, 
    fn: () => Promise<T>, 
    timeout = this.DEFAULT_TIMEOUT
  ): Promise<T> {
    const lock = await this.acquireLock(lockId, lockType, resourceId, timeout);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Executes a function with transfer recommendation lock
   */
  async withTransferRecommendationLock<T>(
    userId: number, 
    fn: () => Promise<T>, 
    timeout = this.DEFAULT_TIMEOUT
  ): Promise<T> {
    return this.withLock(
      `transfer_recommendation_${userId}`,
      'transfer_recommendation',
      userId.toString(),
      fn,
      timeout
    );
  }

  /**
   * Executes a function with account locks
   */
  async withAccountLocks<T>(
    accountIds: number[], 
    fn: () => Promise<T>, 
    timeout = this.DEFAULT_TIMEOUT
  ): Promise<T> {
    const locks = await this.acquireMultipleAccountLocks(accountIds, timeout);
    try {
      return await fn();
    } finally {
      await this.releaseMultipleLocks(locks);
    }
  }

  /**
   * Core lock acquisition logic
   */
  private async acquireLock(
    lockId: string, 
    lockType: string, 
    resourceId: string, 
    timeout: number
  ): Promise<Lock> {
    const startTime = Date.now();
    
    // Check if lock is already held
    if (this.activeLocks.has(lockId)) {
      const existing = this.activeLocks.get(lockId)!;
      
      // Wait for existing lock with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`Timeout waiting for lock ${lockId}`));
        }, timeout);
      });

      try {
        await Promise.race([existing.promise, timeoutPromise]);
      } catch (error) {
        if (error instanceof TimeoutError) {
          throw new LockAcquisitionError(
            `Failed to acquire ${lockType} lock for ${resourceId}: timeout`,
            lockType,
            resourceId
          );
        }
        throw error;
      }
    }

    // Try to acquire database-level advisory lock
    try {
      const lockHash = this.stringToHash(lockId);
      const acquired = await this.acquireAdvisoryLock(lockHash, timeout - (Date.now() - startTime));
      
      if (!acquired) {
        throw new LockAcquisitionError(
          `Failed to acquire ${lockType} lock for ${resourceId}: database lock unavailable`,
          lockType,
          resourceId
        );
      }

      // Create lock release promise
      let releaseFn: (() => Promise<void>) | undefined;
      const lockPromise = new Promise<void>((resolve) => {
        releaseFn = async () => {
          try {
            await this.releaseAdvisoryLock(lockHash);
            this.activeLocks.delete(lockId);
            resolve();
          } catch (error) {
            console.warn(`Failed to release advisory lock ${lockHash}:`, error);
            resolve(); // Don't block on release failures
          }
        };
      });

      // Register the lock
      this.activeLocks.set(lockId, {
        timestamp: Date.now(),
        promise: lockPromise
      });

      return {
        id: lockId,
        release: releaseFn!
      };

    } catch (error) {
      if (error instanceof LockAcquisitionError || error instanceof TimeoutError) {
        throw error;
      }
      
      throw new LockAcquisitionError(
        `Failed to acquire ${lockType} lock for ${resourceId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lockType,
        resourceId
      );
    }
  }

  /**
   * Acquires a PostgreSQL advisory lock
   */
  private async acquireAdvisoryLock(lockId: number, timeout: number): Promise<boolean> {
    try {
      // Use pg_try_advisory_lock for non-blocking acquisition
      const result = await db.execute(
        sql`SELECT pg_try_advisory_lock(${lockId}) as acquired`
      );
      
      return result.rows[0]?.acquired === true;
    } catch (error) {
      console.warn(`Failed to acquire advisory lock ${lockId}:`, error);
      return false;
    }
  }

  /**
   * Releases a PostgreSQL advisory lock
   */
  private async releaseAdvisoryLock(lockId: number): Promise<void> {
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(${lockId})`);
    } catch (error) {
      console.warn(`Failed to release advisory lock ${lockId}:`, error);
      // Don't throw - releases should be best effort
    }
  }

  /**
   * Converts a string to a hash suitable for advisory locks
   */
  private stringToHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Ensure positive integer
    return Math.abs(hash);
  }

  /**
   * Cleans up stale locks
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();
    const staleKeys: string[] = [];

    for (const [key, lock] of this.activeLocks.entries()) {
      if (now - lock.timestamp > this.MAX_LOCK_AGE) {
        staleKeys.push(key);
      }
    }

    for (const key of staleKeys) {
      console.warn(`Cleaning up stale lock: ${key}`);
      this.activeLocks.delete(key);
    }
  }

  /**
   * Shuts down the concurrency controller
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

/**
 * Global concurrency controller instance
 */
export const concurrencyController = new ConcurrencyController();

/**
 * Utility function for transaction-like operations with automatic rollback
 */
export async function withTransaction<T>(
  operations: Array<() => Promise<any>>,
  rollbackOperations: Array<() => Promise<any>>,
  timeout = 30000
): Promise<T> {
  const completedOperations: number[] = [];
  const startTime = Date.now();

  try {
    for (let i = 0; i < operations.length; i++) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new TimeoutError('Transaction timeout');
      }

      await operations[i]();
      completedOperations.push(i);
    }

    return operations[operations.length - 1] as any; // Return result of last operation
  } catch (error) {
    // Rollback completed operations in reverse order
    for (let i = completedOperations.length - 1; i >= 0; i--) {
      try {
        const rollbackIndex = completedOperations[i];
        if (rollbackOperations[rollbackIndex]) {
          await rollbackOperations[rollbackIndex]();
        }
      } catch (rollbackError) {
        console.warn(`Rollback operation ${i} failed:`, rollbackError);
      }
    }

    throw error;
  }
}