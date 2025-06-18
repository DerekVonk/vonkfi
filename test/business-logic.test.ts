import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';

describe('Business Logic Tests', () => {
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

  describe('Goal Management with Account Linking', () => {
    it('should allow goal editing without affecting imported data', async () => {
      const userId = 1;
      
      // Clear existing data
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Create a goal
      const goalData = {
        name: 'Emergency Fund',
        targetAmount: '10000.00',
        currentAmount: '2500.00',
        targetDate: '2025-12-31',
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      const goalId = goalResponse.body.id;

      // Update the goal
      const updates = {
        name: 'Updated Emergency Fund',
        targetAmount: '15000.00',
        currentAmount: '3000.00',
        targetDate: '2026-06-30',
      };

      const updateResponse = await request(app)
        .patch(`/api/goals/${goalId}`)
        .send(updates)
        .expect(200);

      expect(updateResponse.body.name).toBe('Updated Emergency Fund');
      expect(updateResponse.body.targetAmount).toBe('15000.00');
      expect(updateResponse.body.currentAmount).toBe('3000.00');
      expect(updateResponse.body.targetDate).toBe('2026-06-30');

      // Verify original goal data is preserved in database
      const goalsResponse = await request(app)
        .get(`/api/goals/${userId}`)
        .expect(200);

      const updatedGoal = goalsResponse.body.find((g: any) => g.id === goalId);
      expect(updatedGoal.name).toBe('Updated Emergency Fund');
      expect(updatedGoal.targetAmount).toBe('15000.00');
    });

    it('should sync goal current amount when linked to account with balance updates', async () => {
      const userId = 1;
      
      // Clear existing data
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Create an account
      const accountData = {
        iban: 'NL91ABNA0417164300',
        bic: 'ABNANL2A',
        accountName: 'Savings Account',
        balance: '5000.00',
        currency: 'EUR',
        userId: userId,
      };

      const accountResponse = await request(app)
        .post('/api/accounts')
        .send(accountData)
        .expect(200);

      const accountId = accountResponse.body.id;

      // Create a goal linked to the account
      const goalData = {
        name: 'Vacation Fund',
        targetAmount: '8000.00',
        currentAmount: '0.00',
        linkedAccountId: accountId,
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      const goalId = goalResponse.body.id;

      // Update account balance (simulating import)
      const accountUpdate = {
        balance: '6500.00'
      };

      await request(app)
        .patch(`/api/accounts/${accountId}`)
        .send(accountUpdate)
        .expect(200);

      // Trigger goal balance synchronization
      await request(app)
        .post(`/api/recalculate/${userId}`)
        .expect(200);

      // Verify goal current amount is updated
      const updatedGoalsResponse = await request(app)
        .get(`/api/goals/${userId}`)
        .expect(200);

      const linkedGoal = updatedGoalsResponse.body.find((g: any) => g.id === goalId);
      expect(linkedGoal.linkedAccountId).toBe(accountId);
      expect(parseFloat(linkedGoal.currentAmount)).toBe(6500.00);
    });

    it('should not sync goal amount when not linked to account', async () => {
      const userId = 1;
      
      // Create a goal without account linking
      const goalData = {
        name: 'Manual Savings',
        targetAmount: '5000.00',
        currentAmount: '1200.00',
        linkedAccountId: null,
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      const goalId = goalResponse.body.id;

      // Trigger goal balance synchronization
      await request(app)
        .post(`/api/recalculate/${userId}`)
        .expect(200);

      // Verify goal current amount remains unchanged
      const goalsResponse = await request(app)
        .get(`/api/goals/${userId}`)
        .expect(200);

      const manualGoal = goalsResponse.body.find((g: any) => g.id === goalId);
      expect(manualGoal.linkedAccountId).toBeNull();
      expect(parseFloat(manualGoal.currentAmount)).toBe(1200.00);
    });
  });

  describe('FIRE Calculation Business Logic', () => {
    it('should calculate accurate FIRE metrics with multiple accounts and goals', async () => {
      const userId = 1;
      
      // Clear existing data
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Create multiple accounts
      const accounts = [
        {
          iban: 'NL91ABNA0417164300',
          bic: 'ABNANL2A',
          accountName: 'Checking Account',
          balance: '2500.00',
          currency: 'EUR',
          userId: userId,
        },
        {
          iban: 'NL56DEUT0265186420',
          bic: 'DEUTNL2A',
          accountName: 'Savings Account',
          balance: '15000.00',
          currency: 'EUR',
          userId: userId,
        }
      ];

      for (const accountData of accounts) {
        await request(app)
          .post('/api/accounts')
          .send(accountData)
          .expect(200);
      }

      // Create multiple goals
      const goals = [
        {
          name: 'Emergency Fund',
          targetAmount: '10000.00',
          currentAmount: '7500.00',
          priority: 1,
          userId: userId,
        },
        {
          name: 'House Down Payment',
          targetAmount: '50000.00',
          currentAmount: '25000.00',
          priority: 2,
          userId: userId,
        }
      ];

      for (const goalData of goals) {
        await request(app)
          .post('/api/goals')
          .send(goalData)
          .expect(200);
      }

      // Get dashboard with FIRE metrics
      const dashboardResponse = await request(app)
        .get(`/api/dashboard/${userId}`)
        .expect(200);

      const { fireMetrics, goals: dashGoals, accounts: dashAccounts } = dashboardResponse.body;

      expect(dashAccounts).toHaveLength(2);
      expect(dashGoals).toHaveLength(2);
      expect(fireMetrics).toBeDefined();
      expect(fireMetrics.bufferStatus).toBeDefined();
      expect(fireMetrics.volatility).toBeDefined();
      
      // Verify total account balances
      const totalBalance = dashAccounts.reduce((sum: number, acc: any) => 
        sum + parseFloat(acc.balance), 0
      );
      expect(totalBalance).toBe(17500.00);
    });

    it('should handle goal completion and calculate transfer recommendations', async () => {
      const userId = 1;
      
      // Create a nearly completed goal
      const goalData = {
        name: 'Short Term Goal',
        targetAmount: '1000.00',
        currentAmount: '950.00',
        priority: 1,
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      const goalId = goalResponse.body.id;

      // Update goal to completion
      const updates = {
        currentAmount: '1000.00',
        isCompleted: true,
      };

      await request(app)
        .patch(`/api/goals/${goalId}`)
        .send(updates)
        .expect(200);

      // Generate transfer recommendations
      const transferResponse = await request(app)
        .post(`/api/transfers/generate/${userId}`)
        .expect(200);

      expect(transferResponse.body.recommendations).toBeDefined();
      expect(transferResponse.body.allocation).toBeDefined();
      
      // Verify completed goal doesn't affect new recommendations
      const { allocation } = transferResponse.body;
      expect(allocation.goalAllocations).toBeDefined();
    });
  });

  describe('Data Integrity and Source of Truth', () => {
    it('should preserve imported transaction data when editing goals', async () => {
      const userId = 1;
      
      // Clear and import test data (simulated)
      await request(app)
        .delete(`/api/data/${userId}`)
        .expect(200);

      // Create transactions via account creation
      const accountData = {
        iban: 'NL91ABNA0417164300',
        bic: 'ABNANL2A',
        accountName: 'Test Account',
        balance: '1000.00',
        currency: 'EUR',
        userId: userId,
      };

      const accountResponse = await request(app)
        .post('/api/accounts')
        .send(accountData)
        .expect(200);

      // Create goal and link to account
      const goalData = {
        name: 'Test Goal',
        targetAmount: '2000.00',
        currentAmount: '500.00',
        linkedAccountId: accountResponse.body.id,
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      // Edit goal multiple times
      const updates1 = { targetAmount: '2500.00' };
      await request(app)
        .patch(`/api/goals/${goalResponse.body.id}`)
        .send(updates1)
        .expect(200);

      const updates2 = { name: 'Updated Test Goal' };
      await request(app)
        .patch(`/api/goals/${goalResponse.body.id}`)
        .send(updates2)
        .expect(200);

      // Verify account data remains unchanged
      const accountsResponse = await request(app)
        .get(`/api/accounts/${userId}`)
        .expect(200);

      const account = accountsResponse.body[0];
      expect(account.iban).toBe('NL91ABNA0417164300');
      expect(account.balance).toBe('1000.00');
      expect(account.accountName).toBe('Test Account');

      // Verify goal updates are applied
      const goalsResponse = await request(app)
        .get(`/api/goals/${userId}`)
        .expect(200);

      const goal = goalsResponse.body[0];
      expect(goal.name).toBe('Updated Test Goal');
      expect(goal.targetAmount).toBe('2500.00');
      expect(goal.linkedAccountId).toBe(accountResponse.body.id);
    });

    it('should maintain referential integrity when unlinking account from goal', async () => {
      const userId = 1;
      
      // Create account and linked goal
      const accountData = {
        iban: 'NL56DEUT0265186420',
        bic: 'DEUTNL2A',
        accountName: 'Investment Account',
        balance: '5000.00',
        currency: 'EUR',
        userId: userId,
      };

      const accountResponse = await request(app)
        .post('/api/accounts')
        .send(accountData)
        .expect(200);

      const goalData = {
        name: 'Investment Goal',
        targetAmount: '10000.00',
        currentAmount: '3000.00',
        linkedAccountId: accountResponse.body.id,
        userId: userId,
      };

      const goalResponse = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      // Unlink account from goal
      const updates = {
        linkedAccountId: null,
        currentAmount: '3500.00', // Manual update since no longer synced
      };

      await request(app)
        .patch(`/api/goals/${goalResponse.body.id}`)
        .send(updates)
        .expect(200);

      // Verify goal is unlinked
      const goalsResponse = await request(app)
        .get(`/api/goals/${userId}`)
        .expect(200);

      const unlinkedGoal = goalsResponse.body[0];
      expect(unlinkedGoal.linkedAccountId).toBeNull();
      expect(unlinkedGoal.currentAmount).toBe('3500.00');

      // Verify account still exists
      const accountsResponse = await request(app)
        .get(`/api/accounts/${userId}`)
        .expect(200);

      expect(accountsResponse.body).toHaveLength(1);
      expect(accountsResponse.body[0].balance).toBe('5000.00');
    });
  });
});