/**
 * Tests for concurrency control and race condition prevention
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  ConcurrencyController, 
  LockAcquisitionError, 
  TimeoutError 
} from '../../server/utils/concurrencyControl';

describe('Concurrency Control Edge Cases', () => {
  let controller: ConcurrencyController;

  beforeEach(() => {
    controller = new ConcurrencyController();
  });

  afterEach(() => {
    controller.shutdown();
  });

  describe('Lock Acquisition', () => {
    it('should acquire and release locks successfully', async () => {
      const lock = await controller.acquireTransferRecommendationLock(1);
      expect(lock).toBeDefined();
      expect(lock.id).toBe('transfer_recommendation_1');
      
      await lock.release();
    });

    it('should prevent concurrent access to same resource', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      
      // Second lock attempt should timeout quickly
      const startTime = Date.now();
      await expect(
        controller.acquireTransferRecommendationLock(1, 1000)
      ).rejects.toThrow(LockAcquisitionError);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(950); // Should wait close to timeout
      
      await lock1.release();
    });

    it('should allow access after lock is released', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      await lock1.release();
      
      // Should be able to acquire lock again
      const lock2 = await controller.acquireTransferRecommendationLock(1);
      expect(lock2).toBeDefined();
      await lock2.release();
    });

    it('should handle multiple different locks simultaneously', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      const lock2 = await controller.acquireTransferRecommendationLock(2);
      const lock3 = await controller.acquireAccountLock(1);
      
      expect(lock1.id).toBe('transfer_recommendation_1');
      expect(lock2.id).toBe('transfer_recommendation_2');
      expect(lock3.id).toBe('account_1');
      
      await Promise.all([lock1.release(), lock2.release(), lock3.release()]);
    });
  });

  describe('Multiple Account Locks', () => {
    it('should acquire multiple account locks in sorted order', async () => {
      const locks = await controller.acquireMultipleAccountLocks([3, 1, 2]);
      
      expect(locks).toHaveLength(3);
      // Should be sorted to prevent deadlocks
      expect(locks[0].id).toBe('account_1');
      expect(locks[1].id).toBe('account_2');
      expect(locks[2].id).toBe('account_3');
      
      await controller.releaseMultipleLocks(locks);
    });

    it('should release all locks on failure to acquire any', async () => {
      // First acquire a lock that will conflict
      const conflictLock = await controller.acquireAccountLock(2);
      
      // Try to acquire multiple locks including the conflicting one
      await expect(
        controller.acquireMultipleAccountLocks([1, 2, 3], 1000)
      ).rejects.toThrow();
      
      // The non-conflicting lock should still be acquirable
      const lock1 = await controller.acquireAccountLock(1);
      expect(lock1).toBeDefined();
      
      await Promise.all([conflictLock.release(), lock1.release()]);
    });

    it('should handle duplicate account IDs in lock request', async () => {
      const locks = await controller.acquireMultipleAccountLocks([1, 1, 2, 2]);
      
      // Should deduplicate and sort
      expect(locks).toHaveLength(2);
      expect(locks[0].id).toBe('account_1');
      expect(locks[1].id).toBe('account_2');
      
      await controller.releaseMultipleLocks(locks);
    });
  });

  describe('Lock-Protected Operations', () => {
    it('should execute function with automatic lock management', async () => {
      let executed = false;
      
      const result = await controller.withTransferRecommendationLock(1, async () => {
        executed = true;
        return 'success';
      });
      
      expect(executed).toBe(true);
      expect(result).toBe('success');
    });

    it('should release lock even if function throws', async () => {
      await expect(
        controller.withTransferRecommendationLock(1, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
      
      // Lock should be released, so we can acquire it again
      const lock = await controller.acquireTransferRecommendationLock(1);
      expect(lock).toBeDefined();
      await lock.release();
    });

    it('should handle concurrent operations with different users', async () => {
      const results = await Promise.all([
        controller.withTransferRecommendationLock(1, async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'user1';
        }),
        controller.withTransferRecommendationLock(2, async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'user2';
        })
      ]);
      
      expect(results).toEqual(['user1', 'user2']);
    });
  });

  describe('Transfer Execution Locks', () => {
    it('should prevent deadlocks by sorting account IDs', async () => {
      // Test that locks for (1,2) and (2,1) use same lock ID
      const lock1 = await controller.acquireTransferExecutionLock(1, 2);
      
      await expect(
        controller.acquireTransferExecutionLock(2, 1, 1000)
      ).rejects.toThrow(LockAcquisitionError);
      
      await lock1.release();
    });

    it('should allow transfers between different account pairs', async () => {
      const lock1 = await controller.acquireTransferExecutionLock(1, 2);
      const lock2 = await controller.acquireTransferExecutionLock(3, 4);
      
      expect(lock1.id).toBe('transfer_execution_1_2');
      expect(lock2.id).toBe('transfer_execution_3_4');
      
      await Promise.all([lock1.release(), lock2.release()]);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout if lock cannot be acquired within specified time', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      
      const startTime = Date.now();
      await expect(
        controller.acquireTransferRecommendationLock(1, 500)
      ).rejects.toThrow(LockAcquisitionError);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(450);
      expect(duration).toBeLessThan(600);
      
      await lock1.release();
    });

    it('should handle very short timeouts', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      
      await expect(
        controller.acquireTransferRecommendationLock(1, 1)
      ).rejects.toThrow(LockAcquisitionError);
      
      await lock1.release();
    });
  });

  describe('Error Recovery', () => {
    it('should handle lock release failures gracefully', async () => {
      const lock = await controller.acquireTransferRecommendationLock(1);
      
      // Mock a release failure (this is hard to test with real advisory locks)
      const originalRelease = lock.release;
      lock.release = async () => {
        throw new Error('Release failed');
      };
      
      // Should not throw even if release fails
      await expect(lock.release()).resolves.toBeUndefined();
      
      // Restore original release for cleanup
      lock.release = originalRelease;
      await lock.release();
    });

    it('should handle invalid lock operations', async () => {
      // Test with invalid account IDs
      await expect(
        controller.acquireAccountLock(-1)
      ).resolves.toBeDefined();
      
      await expect(
        controller.acquireAccountLock(0)
      ).resolves.toBeDefined();
    });
  });

  describe('Concurrent Stress Testing', () => {
    it('should handle multiple concurrent lock requests', async () => {
      const numConcurrent = 10;
      const promises = [];
      
      for (let i = 0; i < numConcurrent; i++) {
        promises.push(
          controller.withTransferRecommendationLock(i, async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return i;
          })
        );
      }
      
      const results = await Promise.all(promises);
      expect(results).toEqual(Array.from({ length: numConcurrent }, (_, i) => i));
    });

    it('should handle rapid acquire/release cycles', async () => {
      const cycles = 50;
      
      for (let i = 0; i < cycles; i++) {
        const lock = await controller.acquireTransferRecommendationLock(1);
        await lock.release();
      }
      
      // Should still be able to acquire lock after many cycles
      const finalLock = await controller.acquireTransferRecommendationLock(1);
      expect(finalLock).toBeDefined();
      await finalLock.release();
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on shutdown', () => {
      // Should not throw
      expect(() => controller.shutdown()).not.toThrow();
    });

    it('should handle multiple shutdown calls', () => {
      controller.shutdown();
      controller.shutdown(); // Second call should be safe
      expect(() => controller.shutdown()).not.toThrow();
    });
  });

  describe('Lock ID Generation', () => {
    it('should generate consistent lock IDs for same parameters', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(123);
      await lock1.release();
      
      const lock2 = await controller.acquireTransferRecommendationLock(123);
      expect(lock2.id).toBe(lock1.id);
      await lock2.release();
    });

    it('should generate different lock IDs for different parameters', async () => {
      const lock1 = await controller.acquireTransferRecommendationLock(1);
      const lock2 = await controller.acquireTransferRecommendationLock(2);
      
      expect(lock1.id).not.toBe(lock2.id);
      
      await Promise.all([lock1.release(), lock2.release()]);
    });
  });
});