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

    // Verify accounts are preserved
    const accountsAfterClear = await request(app)
      .get(`/api/accounts/${userId}`)
      .expect(200);
    
    expect(accountsAfterClear.body).toHaveLength(1);
    expect(accountsAfterClear.body[0].iban).toBe('NL91ABNA0417164300');
    expect(accountsAfterClear.body[0].accountName).toBe('Test Account');

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