import { IStorage } from '../../server/storage';
import {
  User, InsertUser, Account, InsertAccount,
  Transaction, InsertTransaction, Category, InsertCategory,
  Goal, InsertGoal, Allocation, InsertAllocation,
  TransferRecommendation, InsertTransferRecommendation,
  CryptoWallet, InsertCryptoWallet,
  BudgetPeriod, InsertBudgetPeriod,
  BudgetCategory, InsertBudgetCategory,
  BudgetAccount, InsertBudgetAccount,
  ImportHistory, InsertImportHistory,
  ImportBatch, InsertImportBatch,
  TransactionHash, InsertTransactionHash,
  TransferPreference, InsertTransferPreference
} from "@shared/schema";

// In-memory storage for tests
class MockStorage implements IStorage {
  private users: User[] = [];
  private accounts: Account[] = [];
  private transactions: Transaction[] = [];
  private categories: Category[] = [];
  private goals: Goal[] = [];
  private allocations: Allocation[] = [];
  private transferRecommendations: TransferRecommendation[] = [];
  private cryptoWallets: CryptoWallet[] = [];
  private budgetPeriods: BudgetPeriod[] = [];
  private budgetCategories: BudgetCategory[] = [];
  private budgetAccounts: BudgetAccount[] = [];
  private importHistory: ImportHistory[] = [];
  private importBatches: ImportBatch[] = [];
  private transactionHashes: TransactionHash[] = [];
  private transferPreferences: TransferPreference[] = [];

  // Counter for generating IDs
  private idCounter = 1;

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser = {
      ...user,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as User;
    this.users.push(newUser);
    return newUser;
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user || user.password !== password) {
      return null;
    }
    return user;
  }

  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    const user = this.users.find(user => user.id === id);
    if (user) {
      user.password = newPassword;
    }
  }

  // Accounts
  async getAccountsByUserId(userId: number): Promise<Account[]> {
    return this.accounts.filter(account => account.userId === userId);
  }

  async getAccountByIban(iban: string): Promise<Account | undefined> {
    return this.accounts.find(account => account.iban === iban);
  }

  async getAccountById(id: number): Promise<Account | undefined> {
    return this.accounts.find(account => account.id === id);
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const newAccount = {
      ...account,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Account;
    this.accounts.push(newAccount);
    return newAccount;
  }

  async updateAccount(id: number, updates: Partial<Account>): Promise<Account> {
    const account = this.accounts.find(account => account.id === id);
    if (!account) {
      throw new Error(`Account with id ${id} not found`);
    }
    Object.assign(account, updates);
    return account;
  }

  async deleteAccount(id: number): Promise<void> {
    const index = this.accounts.findIndex(account => account.id === id);
    if (index !== -1) {
      this.accounts.splice(index, 1);
    }
  }

  // Transactions
  async getTransactionsByAccountId(accountId: number): Promise<Transaction[]> {
    return this.transactions.filter(transaction => transaction.accountId === accountId);
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    const accountIds = this.accounts
      .filter(account => account.userId === userId)
      .map(account => account.id);
    return this.transactions.filter(transaction => accountIds.includes(transaction.accountId));
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const newTransaction = {
      ...transaction,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Transaction;
    this.transactions.push(newTransaction);
    return newTransaction;
  }

  async updateTransactionCategory(id: number, categoryId: number): Promise<Transaction> {
    const transaction = this.transactions.find(transaction => transaction.id === id);
    if (!transaction) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    transaction.categoryId = categoryId;
    return transaction;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return this.categories;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const newCategory = {
      ...category,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Category;
    this.categories.push(newCategory);
    return newCategory;
  }

  async updateCategory(id: number, updates: Partial<Category>): Promise<Category> {
    const category = this.categories.find(category => category.id === id);
    if (!category) {
      throw new Error(`Category with id ${id} not found`);
    }
    Object.assign(category, updates);
    return category;
  }

  async deleteCategory(id: number): Promise<void> {
    const index = this.categories.findIndex(category => category.id === id);
    if (index !== -1) {
      this.categories.splice(index, 1);
    }
  }

  // Data Management
  async clearUserData(userId: number): Promise<void> {
    // Remove transactions for user's accounts
    const accountIds = this.accounts
      .filter(account => account.userId === userId)
      .map(account => account.id);
    
    this.transactions = this.transactions.filter(
      transaction => !accountIds.includes(transaction.accountId)
    );
    
    // Clear other user data
    this.allocations = this.allocations.filter(allocation => allocation.userId !== userId);
    this.transferRecommendations = this.transferRecommendations.filter(rec => rec.userId !== userId);
    this.importHistory = this.importHistory.filter(history => history.userId !== userId);
    this.importBatches = this.importBatches.filter(batch => batch.userId !== userId);
    
    // Reset goal amounts
    this.goals.forEach(goal => {
      if (goal.userId === userId) {
        goal.currentAmount = "0";
        goal.isCompleted = false;
      }
    });
  }

  async updateAccountBalances(userId: number): Promise<void> {
    // Calculate balances based on transactions
    const accounts = await this.getAccountsByUserId(userId);
    
    for (const account of accounts) {
      const transactions = await this.getTransactionsByAccountId(account.id);
      const balance = transactions.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount), 
        0
      ).toString();
      
      await this.updateAccount(account.id, { balance });
    }
  }

  async updateGoalAccountBalances(userId: number): Promise<void> {
    await this.updateAccountBalances(userId);
    
    const goals = await this.getGoalsByUserId(userId);
    
    for (const goal of goals) {
      if (goal.linkedAccountId) {
        const account = await this.getAccountById(goal.linkedAccountId);
        if (account) {
          const currentAmount = account.balance;
          const isCompleted = parseFloat(currentAmount) >= goal.targetAmount;
          
          goal.currentAmount = currentAmount;
          goal.isCompleted = isCompleted;
        }
      }
    }
  }

  // Goals
  async getGoalsByUserId(userId: number): Promise<Goal[]> {
    return this.goals.filter(goal => goal.userId === userId);
  }

  async createGoal(goal: InsertGoal): Promise<Goal> {
    const newGoal = {
      ...goal,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentAmount: goal.currentAmount || "0",
      isCompleted: goal.isCompleted || false
    } as Goal;
    this.goals.push(newGoal);
    return newGoal;
  }

  async updateGoal(id: number, updates: Partial<Goal>): Promise<Goal> {
    const goal = this.goals.find(goal => goal.id === id);
    if (!goal) {
      throw new Error(`Goal with id ${id} not found`);
    }
    Object.assign(goal, updates);
    return goal;
  }

  // Allocations
  async getAllocationsByUserId(userId: number): Promise<Allocation[]> {
    return this.allocations.filter(allocation => allocation.userId === userId);
  }

  async createAllocation(allocation: InsertAllocation): Promise<Allocation> {
    const newAllocation = {
      ...allocation,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Allocation;
    this.allocations.push(newAllocation);
    return newAllocation;
  }

  // Transfer Recommendations
  async getTransferRecommendationsByUserId(userId: number): Promise<TransferRecommendation[]> {
    return this.transferRecommendations.filter(rec => rec.userId === userId);
  }

  async createTransferRecommendation(recommendation: InsertTransferRecommendation): Promise<TransferRecommendation> {
    const newRecommendation = {
      ...recommendation,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as TransferRecommendation;
    this.transferRecommendations.push(newRecommendation);
    return newRecommendation;
  }

  async updateTransferRecommendationStatus(id: number, status: string): Promise<TransferRecommendation> {
    const recommendation = this.transferRecommendations.find(rec => rec.id === id);
    if (!recommendation) {
      throw new Error(`Transfer recommendation with id ${id} not found`);
    }
    recommendation.status = status;
    return recommendation;
  }

  // Transfer Execution
  async executeTransfer(transfer: {
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    description: string;
    userId: number;
  }): Promise<{
    success: boolean;
    transferId?: string;
    message: string;
    sourceTransaction?: Transaction;
    destinationTransaction?: Transaction;
  }> {
    const { fromAccountId, toAccountId, amount, description, userId } = transfer;

    try {
      // Validation: Check if accounts exist and belong to user
      const sourceAccount = await this.getAccountById(fromAccountId);
      const destinationAccount = await this.getAccountById(toAccountId);

      if (!sourceAccount) {
        return { success: false, message: "Source account not found" };
      }

      if (!destinationAccount) {
        return { success: false, message: "Destination account not found" };
      }

      // Verify accounts belong to user
      if (sourceAccount.userId !== userId || destinationAccount.userId !== userId) {
        return { success: false, message: "Unauthorized account access" };
      }

      // Validation: Check for self-transfer
      if (fromAccountId === toAccountId) {
        return { success: false, message: "Cannot transfer to the same account" };
      }

      // Validation: Check amount is positive
      if (amount <= 0) {
        return { success: false, message: "Transfer amount must be positive" };
      }

      // Validation: Check sufficient funds
      const sourceBalance = parseFloat(sourceAccount.balance);
      if (sourceBalance < amount) {
        return { success: false, message: "Insufficient funds in source account" };
      }

      // Execute the transfer
      const transferId = `TXF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transferDate = new Date();

      // Create outgoing transaction
      const sourceTransaction = await this.createTransaction({
        accountId: fromAccountId,
        date: transferDate,
        amount: (-amount).toString(),
        description: description,
        counterpartyIban: destinationAccount.iban,
        counterpartyName: destinationAccount.accountHolderName,
        reference: `INTERNAL_TRANSFER_${transferId}`
      });

      // Create incoming transaction
      const destinationTransaction = await this.createTransaction({
        accountId: toAccountId,
        date: transferDate,
        amount: amount.toString(),
        description: description,
        counterpartyIban: sourceAccount.iban,
        counterpartyName: sourceAccount.accountHolderName,
        reference: `INTERNAL_TRANSFER_${transferId}`
      });

      // Update account balances
      const newSourceBalance = (sourceBalance - amount).toString();
      const newDestinationBalance = (parseFloat(destinationAccount.balance) + amount).toString();

      await this.updateAccount(fromAccountId, { balance: newSourceBalance });
      await this.updateAccount(toAccountId, { balance: newDestinationBalance });

      return {
        success: true,
        transferId,
        message: "Transfer completed successfully",
        sourceTransaction,
        destinationTransaction
      };
    } catch (error) {
      console.error("Transfer execution error:", error);
      return { 
        success: false, 
        message: "Transfer failed due to internal error" 
      };
    }
  }

  // Crypto Wallets
  async getCryptoWalletsByUserId(userId: number): Promise<CryptoWallet[]> {
    return this.cryptoWallets.filter(wallet => wallet.userId === userId);
  }

  async createCryptoWallet(wallet: InsertCryptoWallet): Promise<CryptoWallet> {
    const newWallet = {
      ...wallet,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as CryptoWallet;
    this.cryptoWallets.push(newWallet);
    return newWallet;
  }

  // Budget methods
  async getBudgetPeriodsByUserId(userId: number): Promise<BudgetPeriod[]> {
    return this.budgetPeriods.filter(period => period.userId === userId);
  }

  async getActiveBudgetPeriod(userId: number): Promise<BudgetPeriod | undefined> {
    return this.budgetPeriods.find(period => period.userId === userId && period.isActive);
  }

  async createBudgetPeriod(budgetPeriod: InsertBudgetPeriod): Promise<BudgetPeriod> {
    // Deactivate any existing active periods
    this.budgetPeriods.forEach(period => {
      if (period.userId === budgetPeriod.userId && period.isActive) {
        period.isActive = false;
      }
    });

    const newPeriod = {
      ...budgetPeriod,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as BudgetPeriod;
    this.budgetPeriods.push(newPeriod);
    return newPeriod;
  }

  async updateBudgetPeriod(id: number, updates: Partial<BudgetPeriod>): Promise<BudgetPeriod> {
    const period = this.budgetPeriods.find(period => period.id === id);
    if (!period) {
      throw new Error(`Budget period with id ${id} not found`);
    }
    Object.assign(period, updates);
    return period;
  }

  async getBudgetCategoriesByPeriod(budgetPeriodId: number): Promise<BudgetCategory[]> {
    return this.budgetCategories
      .filter(category => category.budgetPeriodId === budgetPeriodId)
      .map(category => {
        const matchingCategory = this.categories.find(c => c.id === category.categoryId);
        return {
          ...category,
          categoryName: matchingCategory?.name || '',
          categoryType: matchingCategory?.type || ''
        };
      });
  }

  async createBudgetCategory(budgetCategory: InsertBudgetCategory): Promise<BudgetCategory> {
    const newCategory = {
      ...budgetCategory,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as BudgetCategory;
    this.budgetCategories.push(newCategory);
    return newCategory;
  }

  async updateBudgetCategory(id: number, updates: Partial<BudgetCategory>): Promise<BudgetCategory> {
    const category = this.budgetCategories.find(category => category.id === id);
    if (!category) {
      throw new Error(`Budget category with id ${id} not found`);
    }
    Object.assign(category, updates);
    return category;
  }

  async deleteBudgetCategory(id: number): Promise<void> {
    const index = this.budgetCategories.findIndex(category => category.id === id);
    if (index !== -1) {
      this.budgetCategories.splice(index, 1);
    }
  }

  async getBudgetAccountsByPeriod(budgetPeriodId: number): Promise<BudgetAccount[]> {
    return this.budgetAccounts
      .filter(account => account.budgetPeriodId === budgetPeriodId)
      .map(budgetAccount => {
        const matchingAccount = this.accounts.find(a => a.id === budgetAccount.accountId);
        return {
          ...budgetAccount,
          accountName: matchingAccount?.customName || matchingAccount?.accountHolderName || '',
          bankName: matchingAccount?.bankName || '',
          balance: matchingAccount?.balance || '0'
        };
      });
  }

  async createBudgetAccount(budgetAccount: InsertBudgetAccount): Promise<BudgetAccount> {
    const newAccount = {
      ...budgetAccount,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as BudgetAccount;
    this.budgetAccounts.push(newAccount);
    return newAccount;
  }

  async updateBudgetAccount(id: number, updates: Partial<BudgetAccount>): Promise<BudgetAccount> {
    const account = this.budgetAccounts.find(account => account.id === id);
    if (!account) {
      throw new Error(`Budget account with id ${id} not found`);
    }
    Object.assign(account, updates);
    return account;
  }

  async calculateBudgetProgress(budgetPeriodId: number): Promise<{ totalAllocated: number; totalSpent: number; remainingToBudget: number; }> {
    const period = this.budgetPeriods.find(period => period.id === budgetPeriodId);
    if (!period) {
      throw new Error('Budget period not found');
    }

    const categories = this.budgetCategories.filter(category => category.budgetPeriodId === budgetPeriodId);
    
    const totalAllocated = categories.reduce((sum, cat) => sum + parseFloat(cat.allocatedAmount || '0'), 0);
    const totalSpent = categories.reduce((sum, cat) => sum + parseFloat(cat.spentAmount || '0'), 0);
    const totalIncome = parseFloat((period.totalIncome as string) || '0');
    
    return {
      totalAllocated,
      totalSpent,
      remainingToBudget: totalIncome - totalAllocated,
    };
  }

  // Import History
  async getImportHistoryByUserId(userId: number): Promise<ImportHistory[]> {
    return this.importHistory.filter(history => history.userId === userId);
  }

  async createImportHistory(importHistory: InsertImportHistory): Promise<ImportHistory> {
    const newHistory = {
      ...importHistory,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ImportHistory;
    this.importHistory.push(newHistory);
    return newHistory;
  }
  
  // Import Batches
  async getImportBatchesByUserId(userId: number): Promise<ImportBatch[]> {
    return this.importBatches.filter(batch => batch.userId === userId);
  }

  async createImportBatch(importBatch: InsertImportBatch): Promise<ImportBatch> {
    const newBatch = {
      ...importBatch,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ImportBatch;
    this.importBatches.push(newBatch);
    return newBatch;
  }

  async updateImportBatch(id: number, updates: Partial<ImportBatch>): Promise<ImportBatch> {
    const batch = this.importBatches.find(batch => batch.id === id);
    if (!batch) {
      throw new Error(`Import batch with id ${id} not found`);
    }
    Object.assign(batch, updates);
    return batch;
  }

  async getImportHistoryByBatchId(batchId: number): Promise<ImportHistory[]> {
    return this.importHistory.filter(history => history.batchId === batchId);
  }

  // Transaction Hashes
  async getTransactionHashesByUserId(userId: number): Promise<TransactionHash[]> {
    return this.transactionHashes.filter(hash => hash.userId === userId);
  }

  async createTransactionHash(transactionHash: InsertTransactionHash): Promise<TransactionHash> {
    const newHash = {
      ...transactionHash,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as TransactionHash;
    this.transactionHashes.push(newHash);
    return newHash;
  }

  async createTransactionHashBatch(transactionHashes: InsertTransactionHash[]): Promise<TransactionHash[]> {
    const newHashes = transactionHashes.map(hash => ({
      ...hash,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as TransactionHash));
    
    this.transactionHashes.push(...newHashes);
    return newHashes;
  }

  // Transfer Preferences
  async getTransferPreferencesByUserId(userId: number): Promise<TransferPreference[]> {
    return this.transferPreferences.filter(pref => pref.userId === userId);
  }

  async createTransferPreference(preference: InsertTransferPreference): Promise<TransferPreference> {
    const newPreference = {
      ...preference,
      id: this.idCounter++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as TransferPreference;
    this.transferPreferences.push(newPreference);
    return newPreference;
  }

  async updateTransferPreference(id: number, updates: Partial<TransferPreference>): Promise<TransferPreference> {
    const preference = this.transferPreferences.find(pref => pref.id === id);
    if (!preference) {
      throw new Error(`Transfer preference with id ${id} not found`);
    }
    Object.assign(preference, { ...updates, updatedAt: new Date() });
    return preference;
  }

  async deleteTransferPreference(id: number): Promise<void> {
    const index = this.transferPreferences.findIndex(pref => pref.id === id);
    if (index !== -1) {
      this.transferPreferences.splice(index, 1);
    }
  }

  // Optimized Dashboard Query
  async getDashboardDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: (Transaction & { categoryName?: string })[];
    goals: Goal[];
    categories: Category[];
    transferRecommendations: TransferRecommendation[];
  }> {
    const accounts = await this.getAccountsByUserId(userId);
    const goals = await this.getGoalsByUserId(userId);
    const categories = await this.getCategories();
    const transferRecommendations = await this.getTransferRecommendationsByUserId(userId);
    
    // Get transactions with category names
    const accountIds = accounts.map(account => account.id);
    const transactions = this.transactions
      .filter(transaction => accountIds.includes(transaction.accountId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
      .map(transaction => {
        const category = categories.find(cat => cat.id === transaction.categoryId);
        return {
          ...transaction,
          categoryName: category?.name
        };
      });
    
    return {
      accounts,
      transactions,
      goals,
      categories,
      transferRecommendations
    };
  }

  // Optimized Transaction Query
  async getTransactionsByUserIdOptimized(userId: number, limit = 50): Promise<(Transaction & { accountName?: string; categoryName?: string })[]> {
    const accounts = await this.getAccountsByUserId(userId);
    const categories = await this.getCategories();
    
    const accountIds = accounts.map(account => account.id);
    return this.transactions
      .filter(transaction => accountIds.includes(transaction.accountId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)
      .map(transaction => {
        const account = accounts.find(acc => acc.id === transaction.accountId);
        const category = categories.find(cat => cat.id === transaction.categoryId);
        return {
          ...transaction,
          accountName: account?.customName || account?.accountHolderName,
          categoryName: category?.name
        };
      });
  }

  // Optimized Transfer Generation Data
  async getTransferGenerationDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: Transaction[];
    goals: Goal[];
    transferPreferences: TransferPreference[];
  }> {
    const accounts = await this.getAccountsByUserId(userId);
    const transactions = await this.getTransactionsByUserId(userId);
    const goals = await this.getGoalsByUserId(userId);
    const transferPreferences = await this.getTransferPreferencesByUserId(userId);
    
    return {
      accounts,
      transactions,
      goals,
      transferPreferences
    };
  }
}

export const mockStorage = new MockStorage();