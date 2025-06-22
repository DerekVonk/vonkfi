import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

describe('Transfer Recommendations Generation', () => {
  let app: express.Application;
  let server: ReturnType<typeof createServer>;
  const testUserId = 1;
  let createdAccountIds: number[] = [];
  let createdGoalIds: number[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    
    try {
      server = await registerRoutes(app);
      
      // Clear any existing data first
      await storage.clearUserData(testUserId);
    } catch (error) {
      console.log('Failed to initialize server due to database connection:', error.message);
      process.env.SKIP_DB_TESTS = 'true';
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      if (process.env.SKIP_DB_TESTS !== 'true') {
        await storage.clearUserData(testUserId);
      }
    } catch (error) {
      console.log('Cleanup error (expected):', error);
    }
    
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    // Clear data before each test to ensure clean state
    try {
      if (process.env.SKIP_DB_TESTS !== 'true') {
        await storage.clearUserData(testUserId);
      }
    } catch (error) {
      console.log('BeforeEach cleanup error (expected):', error.message);
    }
    createdAccountIds = [];
    createdGoalIds = [];
  });

  describe('Test Setup Verification', () => {
    it('should have proper Express app setup', () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
    });

    it('should have proper server setup', () => {
      expect(server).toBeDefined();
    });
  });

  describe('Basic Transfer Generation Tests', () => {
    it('should generate 0 recommendations when no accounts exist', async () => {
      if (process.env.SKIP_DB_TESTS === 'true') {
        console.log('Skipping database test due to connection issues');
        return;
      }
      
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(400);
      
      expect(response.body.error).toBe('No main account found');
    });

    it('should generate 0 recommendations with accounts but no goals or transactions', async () => {
      if (process.env.SKIP_DB_TESTS === 'true') {
        console.log('Skipping database test due to connection issues');
        return;
      }
      
      // Create a basic income account
      const accountResponse = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Income Account',
          balance: '5000.00'
        })
        .expect(200);
      
      createdAccountIds.push(accountResponse.body.id);

      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      expect(response.body.recommendations).toHaveLength(0);
      expect(response.body.allocation).toBeDefined();
      expect(response.body.summary.numberOfTransfers).toBe(0);
    });

    it('should generate buffer transfer when income exceeds expenses', async () => {
      // Create main income account
      const mainAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Account',
          balance: '5000.00'
        })
        .expect(200);
      
      createdAccountIds.push(mainAccount.body.id);

      // Create emergency buffer account
      const bufferAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL92ABNA0417164301',
          role: 'emergency',
          name: 'Emergency Buffer',
          balance: '1000.00'
        })
        .expect(200);
      
      createdAccountIds.push(bufferAccount.body.id);

      // Add income transactions
      const incomeTransaction = {
        accountId: mainAccount.body.id,
        amount: '4000.00',
        description: 'Salary Payment',
        date: '2025-06-01',
        transactionId: 'SAL001',
        type: 'credit',
        categoryId: 2 // Freelance income category
      };

      await request(app)
        .post('/api/transactions')
        .send(incomeTransaction)
        .expect(200);

      // Add some expenses
      const expenseTransaction = {
        accountId: mainAccount.body.id,
        amount: '-800.00',
        description: 'Rent Payment',
        date: '2025-06-02',
        transactionId: 'RENT001',
        type: 'debit',
        categoryId: 3 // Expenses category
      };

      await request(app)
        .post('/api/transactions')
        .send(expenseTransaction)
        .expect(200);

      // Generate transfer recommendations
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      console.log('Transfer response with buffer account:', JSON.stringify(response.body, null, 2));
      
      expect(response.body.recommendations).toBeDefined();
      expect(response.body.allocation).toBeDefined();
      expect(response.body.allocation.bufferAllocation).toBeGreaterThan(0);
      
      // Should have at least one buffer transfer recommendation
      const bufferTransfers = response.body.recommendations.filter((r: any) => 
        r.purpose.toLowerCase().includes('buffer') || r.purpose.toLowerCase().includes('emergency')
      );
      expect(bufferTransfers.length).toBeGreaterThan(0);
    });

    it('should generate goal transfer when goal has linked account', async () => {
      // Create main income account
      const mainAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Account',
          balance: '5000.00'
        })
        .expect(200);
      
      createdAccountIds.push(mainAccount.body.id);

      // Create goal savings account
      const goalAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL92ABNA0417164302',
          role: 'savings',
          name: 'Holiday Savings',
          balance: '500.00'
        })
        .expect(200);
      
      createdAccountIds.push(goalAccount.body.id);

      // Create a goal linked to the savings account
      const goalResponse = await request(app)
        .post('/api/goals')
        .send({
          name: 'Holiday Fund',
          targetAmount: '3000.00',
          currentAmount: '500.00',
          priority: 1,
          userId: testUserId,
          linkedAccountId: goalAccount.body.id
        })
        .expect(200);
      
      createdGoalIds.push(goalResponse.body.id);

      // Add income transactions to create surplus
      const incomeTransaction = {
        accountId: mainAccount.body.id,
        amount: '3500.00',
        description: 'Monthly Salary',
        date: '2025-06-01',
        transactionId: 'SAL002',
        type: 'credit',
        categoryId: 2
      };

      await request(app)
        .post('/api/transactions')
        .send(incomeTransaction)
        .expect(200);

      // Add modest expenses
      const expenseTransaction = {
        accountId: mainAccount.body.id,
        amount: '-1200.00',
        description: 'Monthly Expenses',
        date: '2025-06-02',
        transactionId: 'EXP001',
        type: 'debit',
        categoryId: 3
      };

      await request(app)
        .post('/api/transactions')
        .send(expenseTransaction)
        .expect(200);

      // Generate transfer recommendations
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      console.log('Transfer response with goal:', JSON.stringify(response.body, null, 2));
      
      expect(response.body.recommendations).toBeDefined();
      expect(response.body.allocation).toBeDefined();
      expect(response.body.allocation.goalAllocations).toBeDefined();
      expect(response.body.allocation.goalAllocations.length).toBeGreaterThan(0);
      
      // Should have goal transfer recommendations
      const goalTransfers = response.body.recommendations.filter((r: any) => 
        r.purpose.toLowerCase().includes('holiday') || r.goalId
      );
      expect(goalTransfers.length).toBeGreaterThan(0);
    });

    it('should handle multiple goals with different priorities', async () => {
      // Create main account
      const mainAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Account',
          balance: '8000.00'
        })
        .expect(200);
      
      createdAccountIds.push(mainAccount.body.id);

      // Create multiple goal accounts
      const emergencyAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL92ABNA0417164303',
          role: 'emergency',
          name: 'Emergency Fund',
          balance: '2000.00'
        })
        .expect(200);
      
      createdAccountIds.push(emergencyAccount.body.id);

      const vacationAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL93ABNA0417164304',
          role: 'savings',
          name: 'Vacation Fund',
          balance: '800.00'
        })
        .expect(200);
      
      createdAccountIds.push(vacationAccount.body.id);

      // Create high priority emergency goal
      const emergencyGoal = await request(app)
        .post('/api/goals')
        .send({
          name: 'Emergency Fund',
          targetAmount: '10000.00',
          currentAmount: '2000.00',
          priority: 1,
          userId: testUserId,
          linkedAccountId: emergencyAccount.body.id
        })
        .expect(200);
      
      createdGoalIds.push(emergencyGoal.body.id);

      // Create lower priority vacation goal
      const vacationGoal = await request(app)
        .post('/api/goals')
        .send({
          name: 'Summer Vacation',
          targetAmount: '5000.00',
          currentAmount: '800.00',
          priority: 2,
          userId: testUserId,
          linkedAccountId: vacationAccount.body.id
        })
        .expect(200);
      
      createdGoalIds.push(vacationGoal.body.id);

      // Add substantial income
      const incomeTransaction = {
        accountId: mainAccount.body.id,
        amount: '6000.00',
        description: 'Monthly Income',
        date: '2025-06-01',
        transactionId: 'SAL003',
        type: 'credit',
        categoryId: 2
      };

      await request(app)
        .post('/api/transactions')
        .send(incomeTransaction)
        .expect(200);

      // Add reasonable expenses
      const expenseTransaction = {
        accountId: mainAccount.body.id,
        amount: '-2000.00',
        description: 'Monthly Living Expenses',
        date: '2025-06-02',
        transactionId: 'EXP002',
        type: 'debit',
        categoryId: 3
      };

      await request(app)
        .post('/api/transactions')
        .send(expenseTransaction)
        .expect(200);

      // Generate transfer recommendations
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      console.log('Multiple goals response:', JSON.stringify(response.body, null, 2));
      
      expect(response.body.recommendations).toBeDefined();
      expect(response.body.recommendations.length).toBeGreaterThan(0);
      
      // Should prioritize emergency fund (priority 1) over vacation (priority 2)
      const emergencyTransfers = response.body.recommendations.filter((r: any) => 
        r.purpose.toLowerCase().includes('emergency')
      );
      const vacationTransfers = response.body.recommendations.filter((r: any) => 
        r.purpose.toLowerCase().includes('vacation')
      );
      
      expect(emergencyTransfers.length).toBeGreaterThan(0);
      
      // If both goals get allocations, emergency should get more
      if (vacationTransfers.length > 0 && emergencyTransfers.length > 0) {
        const emergencyAmount = parseFloat(emergencyTransfers[0].amount);
        const vacationAmount = parseFloat(vacationTransfers[0].amount);
        expect(emergencyAmount).toBeGreaterThanOrEqual(vacationAmount);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle accounts without transactions gracefully', async () => {
      // Create accounts but no transactions
      const mainAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Account',
          balance: '1000.00'
        })
        .expect(200);
      
      createdAccountIds.push(mainAccount.body.id);

      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      expect(response.body.recommendations).toHaveLength(0);
      expect(response.body.allocation.bufferAllocation).toBe(0);
      expect(response.body.allocation.goalAllocations).toHaveLength(0);
    });

    it('should handle completed goals correctly', async () => {
      // Create main account
      const mainAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          name: 'Main Account',
          balance: '3000.00'
        })
        .expect(200);
      
      createdAccountIds.push(mainAccount.body.id);

      // Create goal account
      const goalAccount = await request(app)
        .post('/api/accounts')
        .send({
          userId: testUserId,
          iban: 'NL92ABNA0417164305',
          role: 'savings',
          name: 'Completed Goal Account',
          balance: '2000.00'
        })
        .expect(200);
      
      createdAccountIds.push(goalAccount.body.id);

      // Create a completed goal
      const completedGoal = await request(app)
        .post('/api/goals')
        .send({
          name: 'Completed Goal',
          targetAmount: '2000.00',
          currentAmount: '2000.00',
          priority: 1,
          userId: testUserId,
          linkedAccountId: goalAccount.body.id,
          isCompleted: true
        })
        .expect(200);
      
      createdGoalIds.push(completedGoal.body.id);

      // Add income
      const incomeTransaction = {
        accountId: mainAccount.body.id,
        amount: '3000.00',
        description: 'Income',
        date: '2025-06-01',
        transactionId: 'SAL004',
        type: 'credit',
        categoryId: 2
      };

      await request(app)
        .post('/api/transactions')
        .send(incomeTransaction)
        .expect(200);

      // Generate recommendations
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      console.log('Completed goal response:', JSON.stringify(response.body, null, 2));
      
      // Should not generate transfers for completed goals
      const completedGoalTransfers = response.body.recommendations.filter((r: any) => 
        r.goalId === completedGoal.body.id
      );
      expect(completedGoalTransfers).toHaveLength(0);
    });

    it('should verify current user data state causing 0 recommendations', async () => {
      // Get current user state
      const [accounts, transactions, goals] = await Promise.all([
        request(app).get(`/api/accounts/${testUserId}`),
        request(app).get(`/api/transactions/${testUserId}`),
        request(app).get(`/api/goals/${testUserId}`)
      ]);

      console.log('Current user state:');
      console.log('Accounts:', JSON.stringify(accounts.body, null, 2));
      console.log('Transactions:', JSON.stringify(transactions.body.slice(0, 5), null, 2));
      console.log('Goals:', JSON.stringify(goals.body, null, 2));

      // Generate recommendations with current state
      const response = await request(app)
        .post(`/api/transfers/generate/${testUserId}`)
        .expect(200);
      
      console.log('Current state recommendations:', JSON.stringify(response.body, null, 2));
      
      // This test helps us understand why current state produces 0 recommendations
      expect(response.body).toBeDefined();
    });
  });
});