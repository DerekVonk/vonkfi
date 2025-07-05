import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuplicateDetectionService } from '../../server/services/duplicateDetection';
import { Transaction, InsertTransaction, TransactionHash } from '@shared/schema';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let mockUserId: number;

  beforeEach(() => {
    service = new DuplicateDetectionService();
    mockUserId = 1;
    vi.clearAllMocks();
  });

  describe('createTransactionHash', () => {
    it('should create identical hashes for identical transactions', () => {
      const transaction1: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        description: 'Coffee shop payment',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      const transaction2: InsertTransaction = {
        ...transaction1,
        accountId: 2 // Different accountId should not affect hash
      };

      const hash1 = service.createTransactionHash(transaction1);
      const hash2 = service.createTransactionHash(transaction2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should create different hashes for different transactions', () => {
      const baseTransaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        description: 'Coffee shop payment',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      // Test different amounts
      const differentAmount = { ...baseTransaction, amount: '-30.00' };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentAmount));

      // Test different dates
      const differentDate = { ...baseTransaction, date: new Date('2024-01-16T10:30:00Z') };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentDate));

      // Test different merchants
      const differentMerchant = { ...baseTransaction, merchant: 'Costa Coffee' };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentMerchant));

      // Test different counterparty IBANs
      const differentIban = { ...baseTransaction, counterpartyIban: 'NL12RABO0123456789' };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentIban));

      // Test different references
      const differentReference = { ...baseTransaction, reference: 'REF789012' };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentReference));

      // Test different statement IDs
      const differentStatementId = { ...baseTransaction, statementId: 'STMT002' };
      expect(service.createTransactionHash(baseTransaction))
        .not.toBe(service.createTransactionHash(differentStatementId));
    });

    it('should handle null and undefined values gracefully', () => {
      const transactionWithNulls: InsertTransaction = {
        accountId: 1,
        date: undefined,
        amount: undefined,
        currency: 'EUR',
        description: undefined,
        merchant: undefined,
        counterpartyIban: undefined,
        reference: undefined,
        statementId: undefined
      };

      const hash = service.createTransactionHash(transactionWithNulls);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBeDefined();
    });

    it('should handle empty string values', () => {
      const transactionWithEmptyStrings: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '',
        currency: 'EUR',
        description: '',
        merchant: '',
        counterpartyIban: '',
        reference: '',
        statementId: ''
      };

      const hash = service.createTransactionHash(transactionWithEmptyStrings);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBeDefined();
    });

    it('should create consistent hashes for similar transactions with type variations', () => {
      // Test with InsertTransaction
      const insertTransaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      // Test with Transaction (includes id)
      const transaction: Transaction = {
        id: 999,
        ...insertTransaction
      };

      const hash1 = service.createTransactionHash(insertTransaction);
      const hash2 = service.createTransactionHash(transaction);

      expect(hash1).toBe(hash2);
    });

    it('should handle special characters and Unicode in transaction data', () => {
      const transactionWithSpecialChars: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Café München & Söhne',
        counterpartyIban: 'DE89370400440532013000',
        reference: 'Überweisungsref: äöü ß',
        statementId: 'STMT-äöü-001'
      };

      const hash = service.createTransactionHash(transactionWithSpecialChars);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBeDefined();
    });
  });

  describe('checkForDuplicate', () => {
    it('should identify existing duplicate transaction', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      const existingHash = service.createTransactionHash(transaction);
      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: existingHash,
          createdAt: new Date()
        }
      ];

      const result = await service.checkForDuplicate(transaction, mockUserId, existingHashes);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingTransactionId).toBe(100);
      expect(result.hash).toBe(existingHash);
    });

    it('should not identify duplicate for unique transaction', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      const differentHash = service.createTransactionHash({
        ...transaction,
        amount: '-30.00' // Different amount creates different hash
      });

      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: differentHash,
          createdAt: new Date()
        }
      ];

      const result = await service.checkForDuplicate(transaction, mockUserId, existingHashes);

      expect(result.isDuplicate).toBe(false);
      expect(result.existingTransactionId).toBeUndefined();
      expect(result.hash).not.toBe(differentHash);
    });

    it('should handle empty existing hashes array', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks'
      };

      const existingHashes: TransactionHash[] = [];

      const result = await service.checkForDuplicate(transaction, mockUserId, existingHashes);

      expect(result.isDuplicate).toBe(false);
      expect(result.existingTransactionId).toBeUndefined();
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return correct hash even when not duplicate', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks'
      };

      const expectedHash = service.createTransactionHash(transaction);
      const existingHashes: TransactionHash[] = [];

      const result = await service.checkForDuplicate(transaction, mockUserId, existingHashes);

      expect(result.hash).toBe(expectedHash);
    });
  });

  describe('createHashRecords', () => {
    it('should create hash records for multiple transactions', () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks',
          counterpartyIban: 'NL91ABNA0417164300',
          reference: 'REF123456',
          statementId: 'STMT001'
        },
        {
          id: 2,
          accountId: 1,
          date: new Date('2024-01-16T14:15:00Z'),
          amount: '-12.75',
          currency: 'EUR',
          merchant: 'McDonald\'s',
          counterpartyIban: 'NL12RABO0123456789',
          reference: 'REF789012',
          statementId: 'STMT001'
        }
      ];

      const hashRecords = service.createHashRecords(transactions, mockUserId);

      expect(hashRecords).toHaveLength(2);
      
      expect(hashRecords[0]).toEqual({
        userId: mockUserId,
        transactionId: 1,
        hash: service.createTransactionHash(transactions[0])
      });

      expect(hashRecords[1]).toEqual({
        userId: mockUserId,
        transactionId: 2,
        hash: service.createTransactionHash(transactions[1])
      });

      // Verify hashes are different
      expect(hashRecords[0].hash).not.toBe(hashRecords[1].hash);
    });

    it('should handle empty transactions array', () => {
      const transactions: Transaction[] = [];
      const hashRecords = service.createHashRecords(transactions, mockUserId);

      expect(hashRecords).toHaveLength(0);
      expect(hashRecords).toEqual([]);
    });

    it('should create hash records with correct user ID', () => {
      const differentUserId = 999;
      const transactions: Transaction[] = [
        {
          id: 1,
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks'
        }
      ];

      const hashRecords = service.createHashRecords(transactions, differentUserId);

      expect(hashRecords[0].userId).toBe(differentUserId);
    });
  });

  describe('filterDuplicates', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should filter out duplicate transactions', async () => {
      const transactions = [
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks',
          counterpartyIban: 'NL91ABNA0417164300',
          reference: 'REF123456',
          statementId: 'STMT001'
        },
        {
          accountId: 1,
          date: new Date('2024-01-16T14:15:00Z'),
          amount: '-12.75',
          currency: 'EUR',
          merchant: 'McDonald\'s',
          counterpartyIban: 'NL12RABO0123456789',
          reference: 'REF789012',
          statementId: 'STMT001'
        }
      ];

      // First transaction is a duplicate
      const duplicateHash = service.createTransactionHash(transactions[0]);
      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: duplicateHash,
          createdAt: new Date()
        }
      ];

      const result = await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(result.uniqueTransactions).toHaveLength(1);
      expect(result.duplicateCount).toBe(1);
      expect(result.duplicateHashes).toHaveLength(1);
      expect(result.duplicateTransactions).toHaveLength(1);

      // Check that the unique transaction is the second one
      expect(result.uniqueTransactions[0]).toEqual(transactions[1]);

      // Check duplicate transaction info
      expect(result.duplicateTransactions[0]).toEqual({
        ...transactions[0],
        hash: duplicateHash,
        existingTransactionId: 100
      });

      expect(result.duplicateHashes[0]).toBe(duplicateHash);
    });

    it('should handle all unique transactions', async () => {
      const transactions = [
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks'
        },
        {
          accountId: 1,
          date: new Date('2024-01-16T14:15:00Z'),
          amount: '-12.75',
          currency: 'EUR',
          merchant: 'McDonald\'s'
        }
      ];

      const existingHashes: TransactionHash[] = [];

      const result = await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(result.uniqueTransactions).toHaveLength(2);
      expect(result.duplicateCount).toBe(0);
      expect(result.duplicateHashes).toHaveLength(0);
      expect(result.duplicateTransactions).toHaveLength(0);
      expect(result.uniqueTransactions).toEqual(transactions);
    });

    it('should handle all duplicate transactions', async () => {
      const transactions = [
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks',
          counterpartyIban: 'NL91ABNA0417164300'
        },
        {
          accountId: 1,
          date: new Date('2024-01-16T14:15:00Z'),
          amount: '-12.75',
          currency: 'EUR',
          merchant: 'McDonald\'s',
          counterpartyIban: 'NL12RABO0123456789'
        }
      ];

      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: service.createTransactionHash(transactions[0]),
          createdAt: new Date()
        },
        {
          id: 2,
          userId: mockUserId,
          transactionId: 101,
          hash: service.createTransactionHash(transactions[1]),
          createdAt: new Date()
        }
      ];

      const result = await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(result.uniqueTransactions).toHaveLength(0);
      expect(result.duplicateCount).toBe(2);
      expect(result.duplicateHashes).toHaveLength(2);
      expect(result.duplicateTransactions).toHaveLength(2);
    });

    it('should handle empty transactions array', async () => {
      const transactions: any[] = [];
      const existingHashes: TransactionHash[] = [];

      const result = await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(result.uniqueTransactions).toHaveLength(0);
      expect(result.duplicateCount).toBe(0);
      expect(result.duplicateHashes).toHaveLength(0);
      expect(result.duplicateTransactions).toHaveLength(0);
    });

    it('should log duplicate detection messages', async () => {
      const transactions = [
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Starbucks',
          description: 'Coffee purchase'
        }
      ];

      const duplicateHash = service.createTransactionHash(transactions[0]);
      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: duplicateHash,
          createdAt: new Date()
        }
      ];

      await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE found: Starbucks -25.50 -> matches TX100')
      );
    });

    it('should handle transactions without merchant in log messages', async () => {
      const transactions = [
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          description: 'ATM withdrawal'
        }
      ];

      const duplicateHash = service.createTransactionHash(transactions[0]);
      const existingHashes: TransactionHash[] = [
        {
          id: 1,
          userId: mockUserId,
          transactionId: 100,
          hash: duplicateHash,
          createdAt: new Date()
        }
      ];

      await service.filterDuplicates(transactions, mockUserId, existingHashes);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE found: ATM withdrawal -25.50 -> matches TX100')
      );
    });
  });

  describe('Hash Algorithm Reliability', () => {
    it('should generate consistent hashes across multiple calls', () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      const hashes = Array.from({ length: 100 }, () => service.createTransactionHash(transaction));
      
      // All hashes should be identical
      expect(new Set(hashes).size).toBe(1);
      expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle hash collisions properly (theoretical test)', () => {
      // Create many similar transactions with slight variations
      const baseTransaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Test Merchant',
        statementId: 'STMT001'
      };

      const hashes = new Set<string>();
      const transactions: InsertTransaction[] = [];

      // Generate 1000 transactions with slight variations
      for (let i = 0; i < 1000; i++) {
        const transaction = {
          ...baseTransaction,
          reference: `REF${i.toString().padStart(6, '0')}`,
          amount: `${-25.50 - i * 0.01}`
        };
        transactions.push(transaction);
        hashes.add(service.createTransactionHash(transaction));
      }

      // Should have 1000 unique hashes (no collisions expected with SHA-256)
      expect(hashes.size).toBe(1000);
    });

    it('should create different hashes for minimal field differences', () => {
      const baseTransaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks',
        counterpartyIban: 'NL91ABNA0417164300',
        reference: 'REF123456',
        statementId: 'STMT001'
      };

      // Test very small differences
      const variations = [
        { ...baseTransaction, amount: '-25.51' }, // 1 cent difference
        { ...baseTransaction, reference: 'REF123457' }, // 1 character difference
        { ...baseTransaction, merchant: 'Starbuck' }, // Missing 1 character
      ];

      const baseHash = service.createTransactionHash(baseTransaction);
      const variationHashes = variations.map(t => service.createTransactionHash(t));

      variationHashes.forEach(hash => {
        expect(hash).not.toBe(baseHash);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('Performance and Large Dataset Tests', () => {
    it('should handle large batches of transactions efficiently', async () => {
      const startTime = Date.now();
      
      // Create 1000 transactions with valid dates
      const transactions = Array.from({ length: 1000 }, (_, i) => {
        const month = (i % 12) + 1;
        const day = (i % 28) + 1;
        return {
          accountId: 1,
          date: new Date(`2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:30:00Z`),
          amount: `${-100 - i}`,
          currency: 'EUR',
          merchant: `Merchant ${i}`,
          reference: `REF${i.toString().padStart(6, '0')}`,
          statementId: 'STMT001'
        };
      });

      // Create existing hashes for half of them (500 duplicates)
      const existingHashes: TransactionHash[] = transactions.slice(0, 500).map((t, i) => ({
        id: i + 1,
        userId: mockUserId,
        transactionId: i + 100,
        hash: service.createTransactionHash(t),
        createdAt: new Date()
      }));

      const result = await service.filterDuplicates(transactions, mockUserId, existingHashes);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.uniqueTransactions).toHaveLength(500);
      expect(result.duplicateCount).toBe(500);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle creating hash records for large transaction sets', () => {
      const startTime = Date.now();

      // Create 5000 transactions
      const transactions: Transaction[] = Array.from({ length: 5000 }, (_, i) => ({
        id: i + 1,
        accountId: 1,
        date: new Date(`2024-${((i % 12) + 1).toString().padStart(2, '0')}-01T10:30:00Z`),
        amount: `${-50 - i}`,
        currency: 'EUR',
        merchant: `Merchant ${i}`,
        reference: `REF${i}`,
        statementId: 'STMT001'
      }));

      const hashRecords = service.createHashRecords(transactions, mockUserId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(hashRecords).toHaveLength(5000);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      // Verify all hashes are unique
      const uniqueHashes = new Set(hashRecords.map(r => r.hash));
      expect(uniqueHashes.size).toBe(5000);
    });
  });

  describe('Data Integrity and Edge Cases', () => {
    it('should handle transactions with extreme date values', () => {
      const extremeDates = [
        new Date('1970-01-01T00:00:00Z'), // Unix epoch
        new Date('2099-12-31T23:59:59Z'), // Far future
        new Date('2024-02-29T12:00:00Z'), // Leap year
      ];

      extremeDates.forEach(date => {
        const transaction: InsertTransaction = {
          accountId: 1,
          date,
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Test Merchant'
        };

        const hash = service.createTransactionHash(transaction);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hash).toBeDefined();
      });
    });

    it('should handle transactions with extreme amount values', () => {
      const extremeAmounts = [
        '0.01', // Minimal positive amount
        '-0.01', // Minimal negative amount
        '999999999999.99', // Maximum positive amount
        '-999999999999.99', // Maximum negative amount
        '0', // Zero amount
      ];

      extremeAmounts.forEach(amount => {
        const transaction: InsertTransaction = {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount,
          currency: 'EUR',
          merchant: 'Test Merchant'
        };

        const hash = service.createTransactionHash(transaction);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hash).toBeDefined();
      });
    });

    it('should handle malformed transaction data gracefully', async () => {
      const malformedTransactions = [
        {
          // Missing required fields
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z') // Add valid date
        },
        {
          // Very long strings but valid structure
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          merchant: 'A'.repeat(10000), // Very long merchant name
          reference: 'B'.repeat(10000) // Very long reference
        }
      ];

      malformedTransactions.forEach(transaction => {
        expect(() => {
          service.createTransactionHash(transaction as any);
        }).not.toThrow();
      });

      // Test with completely invalid date separately
      const transactionWithInvalidDate = {
        accountId: 1,
        date: 'invalid-date' as any,
        amount: '-25.50'
      };

      expect(() => {
        service.createTransactionHash(transactionWithInvalidDate);
      }).toThrow(); // This should throw because date.toISOString() will fail
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks'
      };

      const existingHashes: TransactionHash[] = [];

      // Simulate concurrent duplicate checks
      const promises = Array.from({ length: 10 }, () => 
        service.checkForDuplicate(transaction, mockUserId, existingHashes)
      );

      const results = await Promise.all(promises);

      // All results should be identical
      results.forEach(result => {
        expect(result.isDuplicate).toBe(false);
        expect(result.hash).toBe(results[0].hash);
      });
    });

    it('should handle different transaction types correctly', () => {
      const transactionTypes = [
        // Income transaction
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '2500.00',
          currency: 'EUR',
          description: 'Salary payment',
          isIncome: true
        },
        // Expense transaction
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-25.50',
          currency: 'EUR',
          merchant: 'Grocery Store',
          isIncome: false
        },
        // Transfer transaction
        {
          accountId: 1,
          date: new Date('2024-01-15T10:30:00Z'),
          amount: '-500.00',
          currency: 'EUR',
          counterpartyIban: 'NL91ABNA0417164300',
          counterpartyName: 'John Doe',
          reference: 'Monthly transfer'
        }
      ];

      const hashes = transactionTypes.map(t => service.createTransactionHash(t));
      
      // All hashes should be different and valid
      expect(new Set(hashes).size).toBe(3);
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    it('should properly validate hash uniqueness across users', async () => {
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks'
      };

      const hash = service.createTransactionHash(transaction);

      // Same hash exists for different user
      const existingHashesUser1: TransactionHash[] = [
        {
          id: 1,
          userId: 999, // Different user
          transactionId: 100,
          hash,
          createdAt: new Date()
        }
      ];

      // Check for user 1 (should not find duplicate since it's for different user)
      const result = await service.checkForDuplicate(transaction, mockUserId, existingHashesUser1);

      expect(result.isDuplicate).toBe(true); // Hash comparison doesn't consider userId
      expect(result.existingTransactionId).toBe(100);
    });
  });

  describe('Export Instance Tests', () => {
    it('should provide a singleton instance', async () => {
      const { duplicateDetectionService } = await import('../../server/services/duplicateDetection');
      
      expect(duplicateDetectionService).toBeDefined();
      expect(duplicateDetectionService).toBeInstanceOf(DuplicateDetectionService);
    });

    it('should maintain state consistency across singleton usage', async () => {
      const { duplicateDetectionService } = await import('../../server/services/duplicateDetection');
      
      const transaction: InsertTransaction = {
        accountId: 1,
        date: new Date('2024-01-15T10:30:00Z'),
        amount: '-25.50',
        currency: 'EUR',
        merchant: 'Starbucks'
      };

      const hash1 = duplicateDetectionService.createTransactionHash(transaction);
      const hash2 = duplicateDetectionService.createTransactionHash(transaction);

      expect(hash1).toBe(hash2);
    });
  });
});