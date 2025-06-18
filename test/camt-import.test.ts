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
    expect(transactions).toHaveLength(8); // 8 transactions in the XML

    // Test specific transaction details
    const applePayTransaction = transactions.find((t: any) => 
      t.description?.includes('Apple Pay') && t.description?.includes('Celly Shop')
    );
    expect(applePayTransaction).toBeDefined();
    expect(parseFloat(applePayTransaction.amount)).toBe(-35.00);
    expect(applePayTransaction.date).toBe('2025-01-02');
    expect(applePayTransaction.type).toBe('debit');

    const nsTicketTransaction = transactions.find((t: any) => 
      t.description?.includes('NS Reizigers') || t.counterpartyName?.includes('NS Reizigers')
    );
    expect(nsTicketTransaction).toBeDefined();
    expect(parseFloat(nsTicketTransaction.amount)).toBe(-2.50);
    expect(nsTicketTransaction.counterpartyName).toBe('NS Reizigers B.V.');

    const bolComTransaction = transactions.find((t: any) => 
      t.counterpartyName?.includes('bol.com')
    );
    expect(bolComTransaction).toBeDefined();
    expect(parseFloat(bolComTransaction.amount)).toBe(-24.99);
    expect(bolComTransaction.counterpartyName).toBe('bol.com');

    // Verify total amounts
    const totalDebits = transactions
      .filter((t: any) => t.type === 'debit')
      .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
    
    expect(totalDebits).toBeCloseTo(188.04, 2); // Sum of all debit transactions
  });

  it('should correctly calculate FIRE metrics after CAMT import', async () => {
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
      expect(january2025Data.expenses).toBeCloseTo(188.04, 2); // Total expenses from XML
      expect(january2025Data.income).toBe(0); // No income transactions in this statement
    }
  });

  it('should handle merchant extraction correctly', async () => {
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
    const userId = 1;
    
    const accountsResponse = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);

    const account = accountsResponse.body[0];
    
    // The XML shows closing balance of 561.54 EUR
    expect(parseFloat(account.balance)).toBe(561.54);
    expect(account.currency).toBe('EUR');
  });

  it('should recalculate dashboard after data clearing', async () => {
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