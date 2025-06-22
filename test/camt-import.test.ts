import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';
import { readFileSync } from 'fs';
import { join } from 'path';
import { expectedCamtData } from './camt-expected-data';

describe('CAMT.053 Import Accuracy Tests', () => {
  let app: express.Application;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    // Skip database-dependent tests if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping database-dependent CAMT import test - no test database available');
      return;
    }

    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('should accurately import CAMT.053 XML file with correct account and transaction data', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    // Clear existing data first
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Read the test CAMT.053 XML file
    const xmlContent = readFileSync(
      join(__dirname, '../attached_assets/50430009_251925218_020125000000_1750248257863.xml'),
      'utf-8'
    );

    // Create a mock file for upload
    const response = await request(app)
      .post(`/api/import/${userId}`)
      .attach('file', Buffer.from(xmlContent), 'test-statement.xml')
      .expect(200);

    expect(response.body.message).toContain('imported successfully');

    // Verify account was created correctly
    const accountsResponse = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);

    expect(accountsResponse.body).toHaveLength(1);
    const account = accountsResponse.body[0];
    expect(account.iban).toBe(expectedCamtData.account.iban);
    expect(account.bic).toBe(expectedCamtData.account.bic);
    expect(account.currency).toBe(expectedCamtData.account.currency);
    expect(parseFloat(account.balance)).toBe(expectedCamtData.account.closingBalance);

    // Verify transactions were imported correctly
    const transactionsResponse = await request(app)
      .get(`/api/dashboard/${userId}`)
      .expect(200);

    const transactions = transactionsResponse.body.transactions;
    expect(transactions).toHaveLength(expectedCamtData.expectedTotals.totalTransactions);

    // Verify each transaction matches expected data
    expectedCamtData.transactions.forEach((expectedTx, index) => {
      const actualTx = transactions.find((t: any) => 
        Math.abs(parseFloat(t.amount) - expectedTx.amount) < 0.01 &&
        t.date === expectedTx.date
      );
      
      expect(actualTx).toBeDefined();
      expect(parseFloat(actualTx.amount)).toBeCloseTo(expectedTx.amount, 2);
      expect(actualTx.date).toBe(expectedTx.date);
      expect(actualTx.type).toBe(expectedTx.type);
      
      if (expectedTx.counterpartyName) {
        expect(actualTx.counterpartyName).toBe(expectedTx.counterpartyName);
      }
      
      if (expectedTx.merchant) {
        expect(actualTx.merchant || actualTx.description).toContain(expectedTx.merchant);
      }
    });

    // Verify total amounts match expected data
    const totalDebits = transactions
      .filter((t: any) => t.type === 'debit')
      .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
    
    expect(totalDebits).toBeCloseTo(expectedCamtData.expectedTotals.totalDebits, 2);
    
    // Verify Apple Pay transaction count
    const applePayCount = transactions.filter((t: any) => 
      t.description?.includes('Apple Pay')
    ).length;
    expect(applePayCount).toBe(expectedCamtData.expectedTotals.applePayTransactions);
  });

  it('should correctly calculate FIRE metrics after CAMT import', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    // Get dashboard data after import
    const dashboardResponse = await request(app)
      .get(`/api/dashboard/${userId}`)
      .expect(200);

    const { fireMetrics } = dashboardResponse.body;
    
    // Verify FIRE calculations are based on imported data
    expect(fireMetrics).toBeDefined();
    expect(fireMetrics.monthlyExpenses).toBeGreaterThan(0);
    expect(fireMetrics.currentMonth).toBeDefined();
    expect(fireMetrics.monthlyBreakdown).toBeDefined();
    expect(Array.isArray(fireMetrics.monthlyBreakdown)).toBe(true);
    
    // Check that expenses are calculated from the imported transactions
    const january2025Data = fireMetrics.monthlyBreakdown.find(
      (month: any) => month.month.includes('2025-01')
    );
    
    if (january2025Data) {
      expect(january2025Data.expenses).toBeCloseTo(expectedCamtData.expectedTotals.totalDebits, 2);
      expect(january2025Data.income).toBe(expectedCamtData.expectedTotals.totalCredits);
    }
  });

  it('should handle merchant extraction correctly', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    const dashboardResponse = await request(app)
      .get(`/api/dashboard/${userId}`)
      .expect(200);

    const transactions = dashboardResponse.body.transactions;
    
    // Check merchant extraction for Apple Pay transactions
    const applePayTransactions = transactions.filter((t: any) => 
      t.description?.includes('Apple Pay')
    );
    
    expect(applePayTransactions.length).toBeGreaterThan(0);
    
    // Verify merchant names are extracted correctly
    const cellyShopTransaction = applePayTransactions.find((t: any) => 
      t.merchant?.includes('Celly Shop')
    );
    expect(cellyShopTransaction).toBeDefined();
    
    const cafeThijssenTransaction = applePayTransactions.find((t: any) => 
      t.merchant?.includes('Cafe Thijssen')
    );
    expect(cafeThijssenTransaction).toBeDefined();
  });

  it('should preserve account balance from CAMT closing balance', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    const accountsResponse = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);

    const account = accountsResponse.body[0];
    
    // Verify closing balance matches CAMT data
    expect(parseFloat(account.balance)).toBe(expectedCamtData.account.closingBalance);
    expect(account.currency).toBe(expectedCamtData.account.currency);
  });

  it('should recalculate dashboard after data clearing', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    // Clear data and verify recalculation
    const clearResponse = await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    expect(clearResponse.body.message).toContain('recalculated');
    expect(clearResponse.body.recalculatedData).toBeDefined();
    expect(clearResponse.body.recalculatedData.transactions).toBe(0);
    expect(clearResponse.body.recalculatedData.fireMetrics).toBeDefined();
    
    // Verify dashboard reflects cleared state
    const dashboardResponse = await request(app)
      .get(`/api/dashboard/${userId}`)
      .expect(200);

    expect(dashboardResponse.body.transactions).toHaveLength(0);
    expect(dashboardResponse.body.fireMetrics.monthlyExpenses).toBe(0);
    expect(dashboardResponse.body.fireMetrics.monthlyIncome).toBe(0);
  });
});