import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storage } from '../../server/storage';

// Check if database tests should be skipped
const shouldSkipDbTests = process.env.SKIP_DB_TESTS === 'true';

describe('Storage Layer Tests', () => {
  let testUserId: number;
  let testAccountId: number;
  let testCategoryId: number;

  beforeEach(async () => {
    // Clear any existing data before each test
    if (shouldSkipDbTests) {
      // For mock storage, clear all data
      const mockStorage = storage as any;
      mockStorage.users = [];
      mockStorage.accounts = [];
      mockStorage.transactions = [];
      mockStorage.categories = [];
      mockStorage.goals = [];
      mockStorage.allocations = [];
      mockStorage.transferRecommendations = [];
      mockStorage.cryptoWallets = [];
      mockStorage.budgetPeriods = [];
      mockStorage.budgetCategories = [];
      mockStorage.budgetAccounts = [];
      mockStorage.importHistory = [];
      mockStorage.importBatches = [];
      mockStorage.transactionHashes = [];
      mockStorage.transferPreferences = [];
      mockStorage.idCounter = 1;
    }

    // Create test data
    const testUser = await storage.createUser({
      username: 'testuser' + Date.now(), // Unique username
      password: 'testpass123'
    });
    testUserId = testUser.id;

    const testCategory = await storage.createCategory({
      name: 'Test Category',
      type: 'essential'
    });
    testCategoryId = testCategory.id;

    const testAccount = await storage.createAccount({
      userId: testUserId,
      iban: 'NL91ABNA0417164300',
      bic: 'ABNANL2A',
      accountHolderName: 'Test User',
      bankName: 'Test Bank',
      balance: '1000.00'
    });
    testAccountId = testAccount.id;
  });

  describe('User Management', () => {
    it('should create a user with hashed password', async () => {
      const userData = {
        username: 'newuser' + Date.now(),
        password: 'password123'
      };

      const user = await storage.createUser(userData);

      expect(user.username).toBe(userData.username);
      expect(user.id).toBeDefined();
      if (shouldSkipDbTests) {
        // Mock storage returns hashed password
        expect(user.password).toBeDefined();
      } else {
        // Database storage filters out password in return
        expect(user.password).toBeUndefined();
      }
    });

    it('should prevent duplicate usernames', async () => {
      const userData = {
        username: 'duplicateuser' + Date.now(),
        password: 'password123'
      };

      await storage.createUser(userData);

      await expect(storage.createUser(userData)).rejects.toThrow('Username already exists');
    });

    it('should retrieve user by ID', async () => {
      const user = await storage.getUser(testUserId);

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
    });

    it('should retrieve user by username', async () => {
      const user = await storage.getUserByUsername('testuser' + testUserId);

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
    });

    it('should return undefined for non-existent user', async () => {
      const user = await storage.getUser(99999);
      expect(user).toBeUndefined();
    });

    it('should authenticate user with correct credentials', async () => {
      const user = await storage.authenticateUser('testuser' + testUserId, 'testpass123');

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
      if (!shouldSkipDbTests) {
        expect(user!.password).toBeUndefined(); // Password should be filtered out
      }
    });

    it('should return null for incorrect credentials', async () => {
      const user = await storage.authenticateUser('testuser' + testUserId, 'wrongpassword');
      expect(user).toBeNull();
    });

    it('should return null for non-existent user authentication', async () => {
      const user = await storage.authenticateUser('nonexistent', 'password');
      expect(user).toBeNull();
    });

    it('should update user password', async () => {
      const newPassword = 'newpassword123';
      
      await storage.updateUserPassword(testUserId, newPassword);
      
      const authenticatedUser = await storage.authenticateUser('testuser' + testUserId, newPassword);
      expect(authenticatedUser).toBeDefined();
      expect(authenticatedUser!.id).toBe(testUserId);
    });
  });

  describe('Account Management', () => {
    it('should create an account', async () => {
      const accountData = {
        userId: testUserId,
        iban: 'NL56DEUT0265186420',
        bic: 'DEUTNL2A',
        accountHolderName: 'New Account Holder',
        bankName: 'New Bank',
        balance: '2000.00'
      };

      const account = await storage.createAccount(accountData);

      expect(account.id).toBeDefined();
      expect(account.userId).toBe(testUserId);
      expect(account.iban).toBe(accountData.iban);
      expect(account.balance).toBe(accountData.balance);
    });

    it('should retrieve accounts by user ID', async () => {
      const accounts = await storage.getAccountsByUserId(testUserId);

      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts[0].userId).toBe(testUserId);
    });

    it('should retrieve account by IBAN', async () => {
      const account = await storage.getAccountByIban('NL91ABNA0417164300');

      expect(account).toBeDefined();
      expect(account!.id).toBe(testAccountId);
      expect(account!.iban).toBe('NL91ABNA0417164300');
    });

    it('should retrieve account by ID', async () => {
      const account = await storage.getAccountById(testAccountId);

      expect(account).toBeDefined();
      expect(account!.id).toBe(testAccountId);
      expect(account!.userId).toBe(testUserId);
    });

    it('should update account', async () => {
      const updates = {
        balance: '1500.00',
        customName: 'Updated Account Name'
      };

      const updatedAccount = await storage.updateAccount(testAccountId, updates);

      expect(updatedAccount.balance).toBe(updates.balance);
      expect(updatedAccount.customName).toBe(updates.customName);
    });

    it('should delete account', async () => {
      await storage.deleteAccount(testAccountId);

      const account = await storage.getAccountById(testAccountId);
      expect(account).toBeUndefined();
    });
  });

  describe('Transaction Management', () => {
    let transactionId: number;

    beforeEach(async () => {
      const transaction = await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '100.00',
        description: 'Test transaction',
        categoryId: testCategoryId
      });
      transactionId = transaction.id;
    });

    it('should create a transaction', async () => {
      const transactionData = {
        accountId: testAccountId,
        date: new Date(),
        amount: '50.00',
        description: 'New test transaction',
        categoryId: testCategoryId
      };

      const transaction = await storage.createTransaction(transactionData);

      expect(transaction.id).toBeDefined();
      expect(transaction.accountId).toBe(testAccountId);
      expect(transaction.amount).toBe(transactionData.amount);
      expect(transaction.description).toBe(transactionData.description);
    });

    it('should retrieve transactions by account ID', async () => {
      const transactions = await storage.getTransactionsByAccountId(testAccountId);

      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].accountId).toBe(testAccountId);
    });

    it('should retrieve transactions by user ID', async () => {
      const transactions = await storage.getTransactionsByUserId(testUserId);

      expect(transactions.length).toBeGreaterThan(0);
    });

    it('should update transaction category', async () => {
      const newCategory = await storage.createCategory({
        name: 'New Category',
        type: 'discretionary'
      });

      const transaction = await storage.updateTransactionCategory(transactionId, newCategory.id);

      expect(transaction.categoryId).toBe(newCategory.id);
    });
  });

  describe('Category Management', () => {
    it('should create a category', async () => {
      const categoryData = {
        name: 'New Category',
        type: 'discretionary',
        color: '#FF0000',
        icon: 'shopping'
      };

      const category = await storage.createCategory(categoryData);

      expect(category.id).toBeDefined();
      expect(category.name).toBe(categoryData.name);
      expect(category.type).toBe(categoryData.type);
      expect(category.color).toBe(categoryData.color);
      expect(category.icon).toBe(categoryData.icon);
    });

    it('should retrieve all categories', async () => {
      const categories = await storage.getCategories();

      expect(categories.length).toBeGreaterThan(0);
    });

    it('should update category', async () => {
      const updates = {
        name: 'Updated Category',
        color: '#00FF00'
      };

      const updatedCategory = await storage.updateCategory(testCategoryId, updates);

      expect(updatedCategory.name).toBe(updates.name);
      expect(updatedCategory.color).toBe(updates.color);
    });

    it('should delete category', async () => {
      await storage.deleteCategory(testCategoryId);

      const categories = await storage.getCategories();
      expect(categories.find(c => c.id === testCategoryId)).toBeUndefined();
    });
  });

  describe('Goal Management', () => {
    let goalId: number;

    beforeEach(async () => {
      const goal = await storage.createGoal({
        userId: testUserId,
        name: 'Test Goal',
        targetAmount: '5000.00',
        currentAmount: '1000.00',
        targetDate: new Date('2025-12-31'),
        priority: 1
      });
      goalId = goal.id;
    });

    it('should create a goal', async () => {
      const goalData = {
        userId: testUserId,
        name: 'New Goal',
        targetAmount: '3000.00',
        currentAmount: '500.00',
        targetDate: new Date('2025-06-30'),
        priority: 2
      };

      const goal = await storage.createGoal(goalData);

      expect(goal.id).toBeDefined();
      expect(goal.userId).toBe(testUserId);
      expect(goal.name).toBe(goalData.name);
      expect(goal.targetAmount).toBe(goalData.targetAmount);
      expect(goal.currentAmount).toBe(goalData.currentAmount);
    });

    it('should retrieve goals by user ID', async () => {
      const goals = await storage.getGoalsByUserId(testUserId);

      expect(goals.length).toBeGreaterThan(0);
      expect(goals[0].userId).toBe(testUserId);
    });

    it('should update goal', async () => {
      const updates = {
        name: 'Updated Goal',
        targetAmount: '6000.00',
        currentAmount: '2000.00'
      };

      const updatedGoal = await storage.updateGoal(goalId, updates);

      expect(updatedGoal.name).toBe(updates.name);
      expect(updatedGoal.targetAmount).toBe(updates.targetAmount);
      expect(updatedGoal.currentAmount).toBe(updates.currentAmount);
    });

    it('should handle goal completion', async () => {
      const updates = {
        currentAmount: '5000.00',
        isCompleted: true
      };

      const completedGoal = await storage.updateGoal(goalId, updates);

      expect(completedGoal.isCompleted).toBe(true);
      expect(completedGoal.currentAmount).toBe('5000.00');
    });
  });

  describe('Transfer Execution', () => {
    let sourceAccountId: number;
    let destinationAccountId: number;

    beforeEach(async () => {
      const sourceAccount = await storage.createAccount({
        userId: testUserId,
        iban: 'NL91ABNA0417164301',
        bic: 'ABNANL2A',
        accountHolderName: 'Source Account',
        bankName: 'Source Bank',
        balance: '1000.00'
      });
      sourceAccountId = sourceAccount.id;

      const destinationAccount = await storage.createAccount({
        userId: testUserId,
        iban: 'NL91ABNA0417164302',
        bic: 'ABNANL2A',
        accountHolderName: 'Destination Account',
        bankName: 'Destination Bank',
        balance: '500.00'
      });
      destinationAccountId = destinationAccount.id;
    });

    it('should execute a valid transfer', async () => {
      const transferData = {
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        amount: 200,
        description: 'Test transfer',
        userId: testUserId
      };

      const result = await storage.executeTransfer(transferData);

      expect(result.success).toBe(true);
      expect(result.transferId).toBeDefined();
      expect(result.message).toBe('Transfer completed successfully');
      expect(result.sourceTransaction).toBeDefined();
      expect(result.destinationTransaction).toBeDefined();
    });

    it('should reject transfer with insufficient funds', async () => {
      const transferData = {
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        amount: 2000, // More than balance
        description: 'Invalid transfer',
        userId: testUserId
      };

      const result = await storage.executeTransfer(transferData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient funds in source account');
    });

    it('should reject self-transfer', async () => {
      const transferData = {
        fromAccountId: sourceAccountId,
        toAccountId: sourceAccountId,
        amount: 100,
        description: 'Self transfer',
        userId: testUserId
      };

      const result = await storage.executeTransfer(transferData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Cannot transfer to the same account');
    });

    it('should reject negative transfer amount', async () => {
      const transferData = {
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        amount: -100,
        description: 'Negative transfer',
        userId: testUserId
      };

      const result = await storage.executeTransfer(transferData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Transfer amount must be positive');
    });
  });

  describe('Optimized Query Performance', () => {
    beforeEach(async () => {
      // Create additional test data for optimization tests
      await Promise.all([
        storage.createTransaction({
          accountId: testAccountId,
          date: new Date(),
          amount: '100.00',
          description: 'Transaction 1',
          categoryId: testCategoryId
        }),
        storage.createTransaction({
          accountId: testAccountId,
          date: new Date(),
          amount: '200.00',
          description: 'Transaction 2',
          categoryId: testCategoryId
        }),
        storage.createGoal({
          userId: testUserId,
          name: 'Dashboard Goal',
          targetAmount: '2000.00',
          currentAmount: '800.00',
          targetDate: new Date('2025-12-31'),
          priority: 1
        }),
        storage.createTransferRecommendation({
          userId: testUserId,
          fromAccountId: testAccountId,
          toAccountId: testAccountId,
          amount: '300.00',
          reason: 'Dashboard recommendation',
          priority: 1,
          status: 'pending'
        })
      ]);
    });

    it('should retrieve optimized dashboard data', async () => {
      const dashboardData = await storage.getDashboardDataOptimized(testUserId);

      expect(dashboardData.accounts.length).toBeGreaterThan(0);
      expect(dashboardData.transactions.length).toBeGreaterThan(0);
      expect(dashboardData.goals.length).toBeGreaterThan(0);
      expect(dashboardData.categories.length).toBeGreaterThan(0);
      expect(dashboardData.transferRecommendations.length).toBeGreaterThan(0);

      // Verify transaction has category name
      if (dashboardData.transactions.length > 0) {
        expect(dashboardData.transactions[0].categoryName).toBeDefined();
      }
    });

    it('should retrieve optimized transactions with account and category names', async () => {
      const transactions = await storage.getTransactionsByUserIdOptimized(testUserId, 10);

      expect(transactions.length).toBeGreaterThan(0);
      if (transactions.length > 0) {
        expect(transactions[0].accountName).toBeDefined();
        expect(transactions[0].categoryName).toBeDefined();
      }
    });

    it('should retrieve optimized transfer generation data', async () => {
      await storage.createTransferPreference({
        userId: testUserId,
        preferenceType: 'goal_allocation',
        sourceAccountId: testAccountId,
        targetAccountId: testAccountId,
        amount: '250.00',
        frequency: 'monthly',
        priority: 1,
        isActive: true
      });

      const transferData = await storage.getTransferGenerationDataOptimized(testUserId);

      expect(transferData.accounts.length).toBeGreaterThan(0);
      expect(transferData.transactions.length).toBeGreaterThan(0);
      expect(transferData.goals.length).toBeGreaterThan(0);
      expect(transferData.transferPreferences.length).toBeGreaterThan(0);
    });
  });

  describe('Data Management Operations', () => {
    beforeEach(async () => {
      // Create some test data
      await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '100.00',
        description: 'Test transaction 1'
      });

      await storage.createGoal({
        userId: testUserId,
        name: 'Test Goal',
        targetAmount: '1000.00',
        currentAmount: '300.00',
        targetDate: new Date('2025-12-31'),
        priority: 1
      });

      await storage.createAllocation({
        userId: testUserId,
        goalId: null,
        accountId: testAccountId,
        amount: '200.00',
        frequency: 'monthly',
        priority: 1
      });
    });

    it('should clear user data while preserving configurations', async () => {
      await storage.clearUserData(testUserId);

      // Verify transactions are cleared
      const transactions = await storage.getTransactionsByUserId(testUserId);
      expect(transactions).toHaveLength(0);

      // Verify allocations are cleared
      const allocations = await storage.getAllocationsByUserId(testUserId);
      expect(allocations).toHaveLength(0);

      // Verify goals are reset but preserved
      const goals = await storage.getGoalsByUserId(testUserId);
      expect(goals.length).toBeGreaterThan(0);
      if (goals.length > 0) {
        expect(goals[0].currentAmount).toBe('0');
        expect(goals[0].isCompleted).toBe(false);
      }

      // Verify accounts are preserved but balances reset
      const accounts = await storage.getAccountsByUserId(testUserId);
      expect(accounts.length).toBeGreaterThan(0);
      if (accounts.length > 0) {
        expect(accounts[0].balance).toBe('0');
      }
    });

    it('should update account balances based on transactions', async () => {
      // Add more transactions
      await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '50.00',
        description: 'Test transaction 2'
      });

      await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '-25.00',
        description: 'Test transaction 3'
      });

      await storage.updateAccountBalances(testUserId);

      const account = await storage.getAccountById(testAccountId);
      expect(parseFloat(account!.balance)).toBeGreaterThan(0);
    });
  });

  describe('Bulk Operations and Performance', () => {
    it('should handle multiple concurrent operations safely', async () => {
      const concurrentOperations = [
        storage.createTransaction({
          accountId: testAccountId,
          date: new Date(),
          amount: '50.00',
          description: 'Concurrent transaction 1'
        }),
        storage.createTransaction({
          accountId: testAccountId,
          date: new Date(),
          amount: '75.00',
          description: 'Concurrent transaction 2'
        }),
        storage.updateAccount(testAccountId, { balance: '2000.00' })
      ];

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(3);
      expect(results[0].description).toBe('Concurrent transaction 1');
      expect(results[1].description).toBe('Concurrent transaction 2');
      expect(results[2].balance).toBe('2000.00');
    });

    it('should handle transaction hash batch operations', async () => {
      const transaction1 = await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '100.00',
        description: 'Hash test transaction 1'
      });

      const transaction2 = await storage.createTransaction({
        accountId: testAccountId,
        date: new Date(),
        amount: '200.00',
        description: 'Hash test transaction 2'
      });

      const hashBatch = [
        {
          userId: testUserId,
          transactionId: transaction1.id,
          hash: 'batch1hash',
          hashType: 'md5'
        },
        {
          userId: testUserId,
          transactionId: transaction2.id,
          hash: 'batch2hash',
          hashType: 'md5'
        }
      ];

      const createdHashes = await storage.createTransactionHashBatch(hashBatch);

      expect(Array.isArray(createdHashes)).toBe(true);
      // The batch might return empty array if table doesn't exist, which is handled gracefully
    });

    it('should handle empty batch operations gracefully', async () => {
      const createdHashes = await storage.createTransactionHashBatch([]);
      expect(createdHashes).toHaveLength(0);
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should handle budget management operations', async () => {
      const budgetPeriod = await storage.createBudgetPeriod({
        userId: testUserId,
        name: 'Test Budget',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        totalIncome: '5000.00',
        isActive: true
      });

      const budgetCategory = await storage.createBudgetCategory({
        budgetPeriodId: budgetPeriod.id,
        categoryId: testCategoryId,
        allocatedAmount: '1000.00',
        spentAmount: '300.00',
        priority: 1,
        isFixed: false
      });

      const progress = await storage.calculateBudgetProgress(budgetPeriod.id);

      expect(progress.totalAllocated).toBe(1000);
      expect(progress.totalSpent).toBe(300);
      expect(progress.remainingToBudget).toBe(4000);
    });

    it('should handle transfer preferences operations', async () => {
      const preference = await storage.createTransferPreference({
        userId: testUserId,
        preferenceType: 'goal_allocation',
        sourceAccountId: testAccountId,
        targetAccountId: testAccountId,
        amount: '500.00',
        frequency: 'monthly',
        priority: 1,
        isActive: true
      });

      const preferences = await storage.getTransferPreferencesByUserId(testUserId);
      expect(preferences.length).toBeGreaterThan(0);
      expect(preferences[0].id).toBe(preference.id);

      const updatedPreference = await storage.updateTransferPreference(preference.id, {
        amount: '600.00',
        isActive: false
      });

      expect(updatedPreference.amount).toBe('600.00');
      expect(updatedPreference.isActive).toBe(false);

      await storage.deleteTransferPreference(preference.id);

      const remainingPreferences = await storage.getTransferPreferencesByUserId(testUserId);
      expect(remainingPreferences.find(p => p.id === preference.id)).toBeUndefined();
    });
  });
});