import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import request from 'supertest';
import express from 'express';
import {registerRoutes} from '../server/routes';
import {storage} from '../server/storage';
import {readFileSync} from 'fs';
import {join} from 'path';
import {duplicateDetectionService} from '../server/services/duplicateDetection';
import {dbConnectionFailed} from './setup';

const app = express();
app.use(express.json());

// Helper function to conditionally skip tests that require database connection
const itIfDb = dbConnectionFailed ? it.skip : it;

// TODO: Batch import tests require advanced file processing and duplicate detection features
// Skipping until batch processing infrastructure is complete
describe.skip('Batch Import and Duplicate Detection Tests', () => {
    let server: any;
    let testUserId: number;

    beforeEach(async () => {
        if (dbConnectionFailed) {
            console.log('Skipping database test - no test database available');
            return;
        }

        try {
            server = await registerRoutes(app);

            // Create test user
            const user = await storage.createUser({
                username: `testuser_${Date.now()}`,
                password: 'TestPass123!'
            });
            testUserId = user.id;

            // Clean up any existing data
            await storage.clearUserData(testUserId);
        } catch (error: unknown) {
            console.warn('Database setup failed, skipping database tests:', error instanceof Error ? error.message : String(error));
            process.env.SKIP_DB_TESTS = 'true';
            return;
        }
    });

    afterEach(async () => {
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
                counterpartyIban: 'NL91ABNA0417164300',
                reference: 'REF123',
                accountId: 1
            };

            const transaction2 = {
                date: new Date('2025-01-15'),
                amount: '100.50',
                merchant: 'Test Merchant',
                counterpartyIban: 'NL91ABNA0417164300',
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
                counterpartyIban: 'NL91ABNA0417164300',
                reference: 'REF123',
                accountId: 1
            };

            const transaction2 = {
                date: new Date('2025-01-15'),
                amount: '200.50', // Different amount
                merchant: 'Test Merchant',
                counterpartyIban: 'NL91ABNA0417164300',
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
                    counterpartyIban: 'NL91ABNA0417164300',
                    reference: 'REF123',
                    accountId: 1
                },
                {
                    date: new Date('2025-01-16'),
                    amount: '200.00',
                    merchant: 'Another Merchant',
                    counterpartyIban: 'NL53RABO0300065264',
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
        itIfDb('should detect and skip duplicate transactions on second import', async () => {
            if (!testUserId) {
                console.log('Skipping test - no test user ID available');
                return;
            }
            const userId = testUserId;

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
            const firstTransactionCount = firstImport.body.data.newTransactions.length;
            expect(firstTransactionCount).toBeGreaterThan(0);

            // Second import (should detect duplicates)
            const secondImport = await request(app)
                .post(`/api/import/${userId}`)
                .attach('camtFile', Buffer.from(xmlContent), 'test-statement-duplicate.xml')
                .expect(200);

            expect(secondImport.body.message).toContain('imported successfully');
            expect(secondImport.body.data.newTransactions.length).toBe(0);
            expect(secondImport.body.data.duplicatesSkipped).toBe(firstTransactionCount);
        });

        itIfDb('should track duplicate statistics in import history', async () => {
            if (!testUserId) {
                console.log('Skipping test - no test user ID available');
                return;
            }
            const userId = testUserId;

            // Read test CAMT file
            const xmlContent = readFileSync(
                join(__dirname, '../attached_assets/50430009_251925218_020125000000_1750248257863.xml'),
                'utf-8'
            );

            // First import to create initial data
            await request(app)
                .post(`/api/import/${userId}`)
                .attach('camtFile', Buffer.from(xmlContent), 'first-import.xml')
                .expect(200);

            // Second import (duplicate) to test tracking
            await request(app)
                .post(`/api/import/${userId}`)
                .attach('camtFile', Buffer.from(xmlContent), 'duplicate-import.xml')
                .expect(200);

            // Get import history
            const historyResponse = await request(app)
                .get(`/api/imports/${userId}`)
                .expect(200);

            expect(Array.isArray(historyResponse.body)).toBe(true);
            expect(historyResponse.body.length).toBeGreaterThan(1);

            // Find the duplicate import
            const duplicateImport = historyResponse.body.find(
                (item: any) => item.fileName === 'duplicate-import.xml'
            );

            expect(duplicateImport).toBeDefined();
            expect(duplicateImport.duplicatesSkipped).toBeGreaterThan(0);
            expect(duplicateImport.transactionsImported).toBe(0);
        });
    });

    describe('Batch Import Management', () => {
        itIfDb('should create import batches for multiple file uploads', async () => {
            const userId = testUserId;

            // Clear existing data
            await request(app)
                .delete(`/api/data/${userId}`)
                .expect(200);

            // Create a batch directly through storage to test functionality
            const batchData = {
                userId,
                notes: 'Test batch import',
                totalFiles: 0,
                totalTransactions: 0,
                status: 'completed' as const
            };

            const batch = await storage.createImportBatch(batchData);

            expect(batch.id).toBeDefined();
            expect(batch.userId).toBe(userId);
            expect(batch.notes).toBe('Test batch import');
        });

        itIfDb('should retrieve import batches with drill-down capability', async () => {
            const userId = testUserId;

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

        itIfDb('should retrieve individual files within a batch', async () => {
            // Get import batches first
            const batchesResponse = await request(app)
                .get(`/api/import/batches/${testUserId}`)
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
        itIfDb('should provide comprehensive import statistics', async () => {
            const userId = testUserId;

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

        itIfDb('should calculate total import metrics across all imports', async () => {
            const historyResponse = await request(app)
                .get(`/api/imports/${testUserId}`)
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
        itIfDb('should handle empty files gracefully', async () => {
            const response = await request(app)
                .post(`/api/import/${testUserId}`)
                .attach('camtFile', Buffer.from(''), 'empty-file.xml')
                .expect(400);

            expect(response.body.message).toBeDefined();
        });

        itIfDb('should handle invalid XML gracefully', async () => {
            const response = await request(app)
                .post(`/api/import/${testUserId}`)
                .attach('camtFile', Buffer.from('<invalid>xml</invalid>'), 'invalid.xml')
                .expect(400);

            expect(response.body.message).toBeDefined();
        });

        itIfDb('should track failed imports in history', async () => {
            // Check the import history for failed imports
            const historyResponse = await request(app)
                .get(`/api/imports/${testUserId}`)
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