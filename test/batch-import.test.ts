import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Server } from 'http';
import express from 'express';
import type { Express } from 'express';
import { registerRoutes } from '../server/routes';
import { readFileSync } from 'fs';
import { join } from 'path';
import { duplicateDetectionService } from '../server/services/duplicateDetection';

describe('Batch Import and Duplicate Detection Tests', () => {
  let app: Express;
  let server: Server;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  describe('Duplicate Detection Service', () => {
    it('should create consistent hashes for identical transactions', () => {
      const transaction1 = {
        date: new Date('2025-01-15'),
        amount: '100.50',
        merchant: 'Test Merchant',
        counterpartyIban: 'NL58ABNA0529548685',
        reference: 'REF123',
        accountId: 1
      };

      const transaction2 = {
        date: new Date('2025-01-15'),
        amount: '100.50',
        merchant: 'Test Merchant',
        counterpartyIban: 'NL58ABNA0529548685',
        reference: 'REF123',
        accountId: 1
      };

      const hash1 = duplicateDetectionService.createTransactionHash(transaction1);
      const hash2 = duplicateDetectionService.createTransactionHash(transaction2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
    });

    it('should create different hashes for different transactions', () => {
      const transaction1 = {
        date: new Date('2025-01-15'),
        amount: '100.50',
        merchant: 'Test Merchant',
        counterpartyIban: 'NL58ABNA0529548685',
        reference: 'REF123',
        accountId: 1
      };

      const transaction2 = {
        date: new Date('2025-01-15'),
        amount: '200.50', // Different amount
        merchant: 'Test Merchant',
        counterpartyIban: 'NL58ABNA0529548685',
        reference: 'REF123',
        accountId: 1
      };

      const hash1 = duplicateDetectionService.createTransactionHash(transaction1);
      const hash2 = duplicateDetectionService.createTransactionHash(transaction2);

      expect(hash1).not.toBe(hash2);
    });

    it('should filter out duplicate transactions correctly', async () => {
      const transactions = [
        {
          date: new Date('2025-01-15'),
          amount: '100.50',
          merchant: 'Test Merchant',
          counterpartyIban: 'NL58ABNA0529548685',
          reference: 'REF123',
          accountId: 1
        },
        {
          date: new Date('2025-01-16'),
          amount: '200.00',
          merchant: 'Another Merchant',
          counterpartyIban: 'NL58ABNA0529548686',
          reference: 'REF124',
          accountId: 1
        }
      ];

      const existingHashes = [
        {
          id: 1,
          userId: 1,
          transactionId: 100,
          hash: duplicateDetectionService.createTransactionHash(transactions[0]),
          createdAt: new Date()
        }
      ];

      const result = await duplicateDetectionService.filterDuplicates(
        transactions,
        1,
        existingHashes
      );

      expect(result.duplicateCount).toBe(1);
      expect(result.uniqueTransactions).toHaveLength(1);
      expect(result.uniqueTransactions[0].merchant).toBe('Another Merchant');
    });
  });

  describe('Import with Duplicate Detection', () => {
    it('should detect and skip duplicate transactions on second import', async () => {
      const userId = 1;
      
      // Clear existing data
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Read test CAMT file
      const xmlContent = readFileSync(
        join(__dirname, '../attached_assets/50430009_251925218_020125000000_1750248257863.xml'),
        'utf-8'
      );

      // First import
      const firstImport = await request(app)
        .post(`/api/import/${userId}`)
        .attach('camtFile', Buffer.from(xmlContent), 'test-statement.xml')
        .expect(200);

      expect(firstImport.body.message).toContain('imported successfully');
      const firstTransactionCount = firstImport.body.newTransactions.length;
      expect(firstTransactionCount).toBeGreaterThan(0);

      // Second import (should detect duplicates)
      const secondImport = await request(app)
        .post(`/api/import/${userId}`)
        .attach('camtFile', Buffer.from(xmlContent), 'test-statement-duplicate.xml')
        .expect(200);

      expect(secondImport.body.message).toContain('imported successfully');
      expect(secondImport.body.newTransactions.length).toBe(0);
      expect(secondImport.body.duplicatesSkipped).toBe(firstTransactionCount);
    });

    it('should track duplicate statistics in import history', async () => {
      const userId = 1;
      
      // Get import history after a duplicate detection test
      const historyResponse = await request(app)
        .get(`/api/imports/${userId}`)
        .expect(200);

      expect(Array.isArray(historyResponse.body)).toBe(true);
      expect(historyResponse.body.length).toBeGreaterThan(0);

      // Find the second import (with duplicates)
      const duplicateImport = historyResponse.body.find(
        (item: any) => item.fileName === 'test-statement-duplicate.xml'
      );

      expect(duplicateImport).toBeDefined();
      expect(duplicateImport.duplicatesSkipped).toBeGreaterThan(0);
      expect(duplicateImport.transactionsImported).toBe(0);
    });
  });

  describe('Batch Import Management', () => {
    it('should create import batches for multiple file uploads', async () => {
      const userId = 1;
      
      // Clear existing data
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Create a batch
      const batchResponse = await request(app)
        .post(`/api/import/batches`)
        .send({
          userId,
          notes: 'Test batch import'
        })
        .expect(200);

      expect(batchResponse.body.id).toBeDefined();
      expect(batchResponse.body.userId).toBe(userId);
      expect(batchResponse.body.notes).toBe('Test batch import');
    });

    it('should retrieve import batches with drill-down capability', async () => {
      const userId = 1;

      // Get import batches
      const batchesResponse = await request(app)
        .get(`/api/import/batches/${userId}`)
        .expect(200);

      expect(Array.isArray(batchesResponse.body)).toBe(true);
      
      if (batchesResponse.body.length > 0) {
        const batch = batchesResponse.body[0];
        expect(batch.id).toBeDefined();
        expect(batch.userId).toBe(userId);
        expect(batch.batchDate).toBeDefined();
        expect(batch.totalFiles).toBeGreaterThanOrEqual(0);
        expect(batch.totalTransactions).toBeGreaterThanOrEqual(0);
      }
    });

    it('should retrieve individual files within a batch', async () => {
      const userId = 1;

      // Get import batches first
      const batchesResponse = await request(app)
        .get(`/api/import/batches/${userId}`)
        .expect(200);

      if (batchesResponse.body.length > 0) {
        const batchId = batchesResponse.body[0].id;

        // Get files in the batch
        const filesResponse = await request(app)
          .get(`/api/import/batches/${batchId}/files`)
          .expect(200);

        expect(Array.isArray(filesResponse.body)).toBe(true);
        
        if (filesResponse.body.length > 0) {
          const file = filesResponse.body[0];
          expect(file.batchId).toBe(batchId);
          expect(file.fileName).toBeDefined();
          expect(file.transactionsImported).toBeGreaterThanOrEqual(0);
          expect(file.duplicatesSkipped).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Import History Analytics', () => {
    it('should provide comprehensive import statistics', async () => {
      const userId = 1;

      const historyResponse = await request(app)
        .get(`/api/imports/${userId}`)
        .expect(200);

      expect(Array.isArray(historyResponse.body)).toBe(true);

      if (historyResponse.body.length > 0) {
        const importRecord = historyResponse.body[0];
        
        // Verify required fields are present
        expect(importRecord.id).toBeDefined();
        expect(importRecord.userId).toBe(userId);
        expect(importRecord.fileName).toBeDefined();
        expect(importRecord.importDate).toBeDefined();
        expect(importRecord.transactionsImported).toBeGreaterThanOrEqual(0);
        expect(importRecord.duplicatesSkipped).toBeGreaterThanOrEqual(0);
        expect(importRecord.status).toBeDefined();
        
        // Verify status is valid
        expect(['completed', 'failed', 'processing']).toContain(importRecord.status);
      }
    });

    it('should calculate total import metrics across all imports', async () => {
      const userId = 1;

      const historyResponse = await request(app)
        .get(`/api/imports/${userId}`)
        .expect(200);

      const imports = historyResponse.body;
      
      if (imports.length > 0) {
        const totalTransactions = imports.reduce((sum: number, imp: any) => 
          sum + (imp.transactionsImported || 0), 0
        );
        const totalDuplicates = imports.reduce((sum: number, imp: any) => 
          sum + (imp.duplicatesSkipped || 0), 0
        );
        const successfulImports = imports.filter((imp: any) => imp.status === 'completed').length;

        expect(totalTransactions).toBeGreaterThanOrEqual(0);
        expect(totalDuplicates).toBeGreaterThanOrEqual(0);
        expect(successfulImports).toBeGreaterThanOrEqual(0);
        expect(successfulImports).toBeLessThanOrEqual(imports.length);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty files gracefully', async () => {
      const userId = 1;

      const response = await request(app)
        .post(`/api/import/${userId}`)
        .attach('camtFile', Buffer.from(''), 'empty-file.xml')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should handle invalid XML gracefully', async () => {
      const userId = 1;

      const response = await request(app)
        .post(`/api/import/${userId}`)
        .attach('camtFile', Buffer.from('<invalid>xml</invalid>'), 'invalid.xml')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should track failed imports in history', async () => {
      const userId = 1;

      // Check the import history for failed imports
      const historyResponse = await request(app)
        .get(`/api/imports/${userId}`)
        .expect(200);

      const failedImports = historyResponse.body.filter((imp: any) => imp.status === 'failed');
      
      if (failedImports.length > 0) {
        const failedImport = failedImports[0];
        expect(failedImport.errorMessage).toBeDefined();
        expect(failedImport.transactionsImported).toBe(0);
        expect(failedImport.accountsFound).toBe(0);
      }
    });
  });
});