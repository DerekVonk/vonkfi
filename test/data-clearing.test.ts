import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';

describe('Selective Data Clearing', () => {
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

  it('should preserve user configurations while clearing imported data', async () => {
    const userId = 1;
    
    // First, create some test data
    const goalData = {
      name: 'Test Savings Goal',
      targetAmount: '5000.00',
      currentAmount: '1500.00',
      targetDate: '2025-12-31',
      userId: userId,
    };
    
    const accountData = {
      iban: 'NL91ABNA0417164300',
      bic: 'ABNANL2A',
      accountName: 'Test Account',
      balance: '2500.00',
      currency: 'EUR',
      userId: userId,
    };

    // Create goal and account
    const goalResponse = await request(app)
      .post('/api/goals')
      .send(goalData)
      .expect(200);
    
    const accountResponse = await request(app)
      .post('/api/accounts')
      .send(accountData)
      .expect(200);

    // Verify they exist
    expect(goalResponse.body.name).toBe('Test Savings Goal');
    expect(goalResponse.body.currentAmount).toBe('1500.00');
    expect(accountResponse.body.iban).toBe('NL91ABNA0417164300');

    // Clear user data (selective clearing)
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Verify goals are preserved but reset
    const goalsAfterClear = await request(app)
      .get(`/api/goals/${userId}`)
      .expect(200);
    
    expect(goalsAfterClear.body).toHaveLength(1);
    expect(goalsAfterClear.body[0].name).toBe('Test Savings Goal');
    expect(goalsAfterClear.body[0].targetAmount).toBe('5000.00');
    expect(goalsAfterClear.body[0].currentAmount).toBe('0'); // Reset to 0
    expect(goalsAfterClear.body[0].isCompleted).toBe(false);

    // Verify accounts are preserved but balances are reset
    const accountsAfterClear = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);
    
    expect(accountsAfterClear.body).toHaveLength(1);
    expect(accountsAfterClear.body[0].iban).toBe('NL91ABNA0417164300');
    expect(accountsAfterClear.body[0].accountName).toBe('Test Account');
    expect(accountsAfterClear.body[0].balance).toBe('0'); // Balance reset to 0

    // Verify transfer recommendations are cleared
    const transfersAfterClear = await request(app)
      .get(`/api/transfers/${userId}`)
      .expect(200);
    
    expect(transfersAfterClear.body).toHaveLength(0);
  });

  it('should clear all transactions while preserving account structure', async () => {
    const userId = 1;
    
    // Clear data should remove transactions but keep accounts
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Check that accounts still exist (from previous test or seed data)
    const accounts = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);

    // If accounts exist, verify no transactions remain
    if (accounts.body.length > 0) {
      const dashboard = await request(app)
        .get(`/api/dashboard/${userId}`)
        .expect(200);
      
      expect(dashboard.body.transactions).toHaveLength(0);
    }
  });

  it('should reset account balances to zero when clearing data', async () => {
    const userId = 1;
    
    // Create multiple accounts with different balances
    const accounts = [
      {
        iban: 'NL91ABNA0417164301',
        bic: 'ABNANL2A',
        accountName: 'Checking Account',
        balance: '1500.75',
        currency: 'EUR',
        userId: userId,
      },
      {
        iban: 'NL91ABNA0417164302',
        bic: 'ABNANL2A',
        accountName: 'Savings Account',
        balance: '5000.00',
        currency: 'EUR',
        userId: userId,
      },
      {
        iban: 'NL91ABNA0417164303',
        bic: 'ABNANL2A',
        accountName: 'Investment Account',
        balance: '12500.50',
        currency: 'EUR',
        userId: userId,
      }
    ];

    // Create all accounts
    const createdAccounts = [];
    for (const accountData of accounts) {
      const response = await request(app)
        .post('/api/accounts')
        .send(accountData)
        .expect(200);
      createdAccounts.push(response.body);
    }

    // Verify accounts have the expected balances before clearing
    const accountsBeforeClear = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);
    
    expect(accountsBeforeClear.body.length).toBeGreaterThanOrEqual(3);
    const checkingAccount = accountsBeforeClear.body.find((acc: any) => acc.iban === 'NL91ABNA0417164301');
    const savingsAccount = accountsBeforeClear.body.find((acc: any) => acc.iban === 'NL91ABNA0417164302');
    const investmentAccount = accountsBeforeClear.body.find((acc: any) => acc.iban === 'NL91ABNA0417164303');
    
    expect(checkingAccount?.balance).toBe('1500.75');
    expect(savingsAccount?.balance).toBe('5000.00');
    expect(investmentAccount?.balance).toBe('12500.50');

    // Clear user data
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Verify all account balances are reset to 0
    const accountsAfterClear = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);
    
    expect(accountsAfterClear.body.length).toBeGreaterThanOrEqual(3);
    
    for (const account of accountsAfterClear.body) {
      expect(account.balance).toBe('0'); // All balances should be reset to 0
      expect(account.iban).toBeDefined(); // Account structure preserved
      expect(account.accountName).toBeDefined(); // Account names preserved
    }
  });

  it('should preserve categories after data clearing', async () => {
    // Categories should remain available after clearing user data
    await request(app)
      .delete('/api/data/1')
      .expect(200);

    const categories = await request(app)
      .get('/api/categories')
      .expect(200);

    // Categories should still exist (they are global, not user-specific)
    expect(categories.body.length).toBeGreaterThan(0);
    expect(categories.body.some((cat: any) => cat.name === 'Salary')).toBe(true);
    expect(categories.body.some((cat: any) => cat.name === 'Groceries')).toBe(true);
  });
});