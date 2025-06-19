import { 
  users, accounts, transactions, categories, goals, allocations, 
  transferRecommendations, cryptoWallets, budgetPeriods, budgetCategories, budgetAccounts, importHistory, importBatches, transactionHashes,
  type User, type InsertUser, type Account, type InsertAccount,
  type Transaction, type InsertTransaction, type Category, type InsertCategory,
  type Goal, type InsertGoal, type Allocation, type InsertAllocation,
  type TransferRecommendation, type InsertTransferRecommendation,
  type CryptoWallet, type InsertCryptoWallet,
  type BudgetPeriod, type InsertBudgetPeriod,
  type BudgetCategory, type InsertBudgetCategory,
  type BudgetAccount, type InsertBudgetAccount,
  type ImportHistory, type InsertImportHistory,
  type ImportBatch, type InsertImportBatch,
  type TransactionHash, type InsertTransactionHash
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray, and, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Accounts
  getAccountsByUserId(userId: number): Promise<Account[]>;
  getAccountByIban(iban: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, updates: Partial<Account>): Promise<Account>;
  deleteAccount(id: number): Promise<void>;

  // Transactions
  getTransactionsByAccountId(accountId: number): Promise<Transaction[]>;
  getTransactionsByUserId(userId: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransactionCategory(id: number, categoryId: number): Promise<Transaction>;

  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, updates: Partial<Category>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;

  // Data Management
  clearUserData(userId: number): Promise<void>;
  updateAccountBalances(userId: number): Promise<void>;
  updateGoalAccountBalances(userId: number): Promise<void>;

  // Goals
  getGoalsByUserId(userId: number): Promise<Goal[]>;
  createGoal(goal: InsertGoal): Promise<Goal>;
  updateGoal(id: number, updates: Partial<Goal>): Promise<Goal>;

  // Allocations
  getAllocationsByUserId(userId: number): Promise<Allocation[]>;
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;

  // Transfer Recommendations
  getTransferRecommendationsByUserId(userId: number): Promise<TransferRecommendation[]>;
  createTransferRecommendation(recommendation: InsertTransferRecommendation): Promise<TransferRecommendation>;
  updateTransferRecommendationStatus(id: number, status: string): Promise<TransferRecommendation>;

  // Crypto Wallets
  getCryptoWalletsByUserId(userId: number): Promise<CryptoWallet[]>;
  createCryptoWallet(wallet: InsertCryptoWallet): Promise<CryptoWallet>;

  // Zero Based Budgeting
  getBudgetPeriodsByUserId(userId: number): Promise<BudgetPeriod[]>;
  getActiveBudgetPeriod(userId: number): Promise<BudgetPeriod | undefined>;
  createBudgetPeriod(budgetPeriod: InsertBudgetPeriod): Promise<BudgetPeriod>;
  updateBudgetPeriod(id: number, updates: Partial<BudgetPeriod>): Promise<BudgetPeriod>;
  getBudgetCategoriesByPeriod(budgetPeriodId: number): Promise<BudgetCategory[]>;
  createBudgetCategory(budgetCategory: InsertBudgetCategory): Promise<BudgetCategory>;
  updateBudgetCategory(id: number, updates: Partial<BudgetCategory>): Promise<BudgetCategory>;
  deleteBudgetCategory(id: number): Promise<void>;
  getBudgetAccountsByPeriod(budgetPeriodId: number): Promise<BudgetAccount[]>;
  createBudgetAccount(budgetAccount: InsertBudgetAccount): Promise<BudgetAccount>;
  updateBudgetAccount(id: number, updates: Partial<BudgetAccount>): Promise<BudgetAccount>;
  calculateBudgetProgress(budgetPeriodId: number): Promise<{ totalAllocated: number; totalSpent: number; remainingToBudget: number; }>;

  // Import History
  getImportHistoryByUserId(userId: number): Promise<ImportHistory[]>;
  createImportHistory(importHistory: InsertImportHistory): Promise<ImportHistory>;
  
  // Import Batches
  getImportBatchesByUserId(userId: number): Promise<ImportBatch[]>;
  createImportBatch(importBatch: InsertImportBatch): Promise<ImportBatch>;
  updateImportBatch(id: number, updates: Partial<ImportBatch>): Promise<ImportBatch>;
  getImportHistoryByBatchId(batchId: number): Promise<ImportHistory[]>;
  
  // Transaction Hashes (Duplicate Detection)
  getTransactionHashesByUserId(userId: number): Promise<TransactionHash[]>;
  createTransactionHash(transactionHash: InsertTransactionHash): Promise<TransactionHash>;
  createTransactionHashBatch(transactionHashes: InsertTransactionHash[]): Promise<TransactionHash[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Accounts
  async getAccountsByUserId(userId: number): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.userId, userId));
  }

  async getAccountByIban(iban: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.iban, iban));
    return account || undefined;
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateAccount(id: number, updates: Partial<Account>): Promise<Account> {
    const [account] = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, id))
      .returning();
    return account;
  }

  async deleteAccount(id: number): Promise<void> {
    await db.delete(accounts).where(eq(accounts.id, id));
  }

  // Transactions
  async getTransactionsByAccountId(accountId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    const userAccounts = await this.getAccountsByUserId(userId);
    const accountIds = userAccounts.map(acc => acc.id);
    
    if (accountIds.length === 0) return [];
    
    return await db.select().from(transactions).where(inArray(transactions.accountId, accountIds));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async updateTransactionCategory(id: number, categoryId: number): Promise<Transaction> {
    const [transaction] = await db
      .update(transactions)
      .set({ categoryId })
      .where(eq(transactions.id, id))
      .returning();
    return transaction;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  async updateCategory(id: number, updates: Partial<Category>): Promise<Category> {
    const [category] = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    return category;
  }

  async clearUserData(userId: number): Promise<void> {
    // Clear only imported bank statement data and calculated metrics
    // Preserve user configurations: accounts, categories, goals, crypto wallets
    
    // Get user's accounts
    const userAccounts = await this.getAccountsByUserId(userId);
    const accountIds = userAccounts.map(acc => acc.id);
    
    // Get all user transactions first to delete related hashes
    let userTransactionIds: number[] = [];
    if (accountIds.length > 0) {
      const userTransactions = await db.select({ id: transactions.id })
        .from(transactions)
        .where(inArray(transactions.accountId, accountIds));
      userTransactionIds = userTransactions.map(t => t.id);
    }
    
    // Delete transaction hashes for user's transactions
    if (userTransactionIds.length > 0) {
      await db.delete(transactionHashes).where(inArray(transactionHashes.transactionId, userTransactionIds));
    }
    
    // Delete transactions (imported bank statement data)
    if (accountIds.length > 0) {
      await db.delete(transactions).where(inArray(transactions.accountId, accountIds));
    }
    
    // Delete import history and batches
    await db.delete(importHistory).where(eq(importHistory.userId, userId));
    await db.delete(importBatches).where(eq(importBatches.userId, userId));
    
    // Delete calculated allocations
    await db.delete(allocations).where(eq(allocations.userId, userId));
    
    // Delete transfer recommendations (calculated data)
    await db.delete(transferRecommendations).where(eq(transferRecommendations.userId, userId));
    
    // Reset goal current amounts to 0 but preserve goal configurations
    const userGoals = await this.getGoalsByUserId(userId);
    for (const goal of userGoals) {
      await db.update(goals)
        .set({ currentAmount: "0", isCompleted: false })
        .where(eq(goals.id, goal.id));
    }
    
    // Note: Accounts, categories, goals, and crypto wallets are preserved
  }

  async updateAccountBalances(userId: number): Promise<void> {
    // Update all account balances based on transaction data
    const userAccounts = await this.getAccountsByUserId(userId);
    
    for (const account of userAccounts) {
      // Calculate account balance from all transactions
      const accountTransactions = await this.getTransactionsByAccountId(account.id);
      const calculatedBalance = accountTransactions.reduce((sum, transaction) => {
        return sum + parseFloat(transaction.amount);
      }, 0);
      
      // Update account balance
      await db.update(accounts)
        .set({ balance: calculatedBalance.toFixed(2) })
        .where(eq(accounts.id, account.id));
    }
  }

  async updateGoalAccountBalances(userId: number): Promise<void> {
    // First update all account balances
    await this.updateAccountBalances(userId);
    
    // Then update goal current amounts based on linked account balances
    const userGoals = await this.getGoalsByUserId(userId);
    const userAccounts = await this.getAccountsByUserId(userId);
    
    for (const goal of userGoals) {
      if (goal.linkedAccountId) {
        const linkedAccount = userAccounts.find(acc => acc.id === goal.linkedAccountId);
        if (linkedAccount) {
          // Update goal current amount with account balance
          await db.update(goals)
            .set({ currentAmount: linkedAccount.balance })
            .where(eq(goals.id, goal.id));
        }
      }
    }
  }

  // Goals
  async getGoalsByUserId(userId: number): Promise<Goal[]> {
    return await db.select().from(goals).where(eq(goals.userId, userId));
  }

  async createGoal(insertGoal: InsertGoal): Promise<Goal> {
    const [goal] = await db
      .insert(goals)
      .values(insertGoal)
      .returning();
    return goal;
  }

  async updateGoal(id: number, updates: Partial<Goal>): Promise<Goal> {
    const [goal] = await db
      .update(goals)
      .set(updates)
      .where(eq(goals.id, id))
      .returning();
    return goal;
  }

  // Allocations
  async getAllocationsByUserId(userId: number): Promise<Allocation[]> {
    return await db.select().from(allocations).where(eq(allocations.userId, userId));
  }

  async createAllocation(insertAllocation: InsertAllocation): Promise<Allocation> {
    const [allocation] = await db
      .insert(allocations)
      .values(insertAllocation)
      .returning();
    return allocation;
  }

  // Transfer Recommendations
  async getTransferRecommendationsByUserId(userId: number): Promise<TransferRecommendation[]> {
    return await db.select().from(transferRecommendations).where(eq(transferRecommendations.userId, userId));
  }

  async createTransferRecommendation(insertRecommendation: InsertTransferRecommendation): Promise<TransferRecommendation> {
    const [recommendation] = await db
      .insert(transferRecommendations)
      .values(insertRecommendation)
      .returning();
    return recommendation;
  }

  async updateTransferRecommendationStatus(id: number, status: string): Promise<TransferRecommendation> {
    const [recommendation] = await db
      .update(transferRecommendations)
      .set({ status })
      .where(eq(transferRecommendations.id, id))
      .returning();
    return recommendation;
  }

  // Crypto Wallets
  async getCryptoWalletsByUserId(userId: number): Promise<CryptoWallet[]> {
    return await db.select().from(cryptoWallets).where(eq(cryptoWallets.userId, userId));
  }

  async createCryptoWallet(insertWallet: InsertCryptoWallet): Promise<CryptoWallet> {
    const [wallet] = await db
      .insert(cryptoWallets)
      .values(insertWallet)
      .returning();
    return wallet;
  }

  // Zero Based Budgeting methods
  async getBudgetPeriodsByUserId(userId: number): Promise<BudgetPeriod[]> {
    return await db.select().from(budgetPeriods).where(eq(budgetPeriods.userId, userId)).orderBy(desc(budgetPeriods.startDate));
  }

  async getActiveBudgetPeriod(userId: number): Promise<BudgetPeriod | undefined> {
    const [period] = await db.select().from(budgetPeriods).where(
      and(eq(budgetPeriods.userId, userId), eq(budgetPeriods.isActive, true))
    );
    return period;
  }

  async createBudgetPeriod(insertBudgetPeriod: InsertBudgetPeriod): Promise<BudgetPeriod> {
    // Deactivate any existing active periods
    await db.update(budgetPeriods)
      .set({ isActive: false })
      .where(and(eq(budgetPeriods.userId, insertBudgetPeriod.userId), eq(budgetPeriods.isActive, true)));

    const [period] = await db.insert(budgetPeriods).values(insertBudgetPeriod).returning();
    return period;
  }

  async updateBudgetPeriod(id: number, updates: Partial<BudgetPeriod>): Promise<BudgetPeriod> {
    const [updated] = await db.update(budgetPeriods).set(updates).where(eq(budgetPeriods.id, id)).returning();
    return updated;
  }

  async getBudgetCategoriesByPeriod(budgetPeriodId: number): Promise<BudgetCategory[]> {
    return await db.select({
      id: budgetCategories.id,
      budgetPeriodId: budgetCategories.budgetPeriodId,
      categoryId: budgetCategories.categoryId,
      allocatedAmount: budgetCategories.allocatedAmount,
      spentAmount: budgetCategories.spentAmount,
      priority: budgetCategories.priority,
      notes: budgetCategories.notes,
      isFixed: budgetCategories.isFixed,
      categoryName: categories.name,
      categoryType: categories.type,
    })
    .from(budgetCategories)
    .leftJoin(categories, eq(budgetCategories.categoryId, categories.id))
    .where(eq(budgetCategories.budgetPeriodId, budgetPeriodId))
    .orderBy(budgetCategories.priority, categories.name);
  }

  async createBudgetCategory(insertBudgetCategory: InsertBudgetCategory): Promise<BudgetCategory> {
    const [budgetCategory] = await db.insert(budgetCategories).values(insertBudgetCategory).returning();
    return budgetCategory;
  }

  async updateBudgetCategory(id: number, updates: Partial<BudgetCategory>): Promise<BudgetCategory> {
    const [updated] = await db.update(budgetCategories).set(updates).where(eq(budgetCategories.id, id)).returning();
    return updated;
  }

  async getBudgetAccountsByPeriod(budgetPeriodId: number): Promise<BudgetAccount[]> {
    return await db.select({
      id: budgetAccounts.id,
      budgetPeriodId: budgetAccounts.budgetPeriodId,
      accountId: budgetAccounts.accountId,
      role: budgetAccounts.role,
      targetBalance: budgetAccounts.targetBalance,
      allocatedAmount: budgetAccounts.allocatedAmount,
      accountName: accounts.customName || accounts.accountHolderName,
      bankName: accounts.bankName || '',
      balance: accounts.balance || '0',
    })
    .from(budgetAccounts)
    .leftJoin(accounts, eq(budgetAccounts.accountId, accounts.id))
    .where(eq(budgetAccounts.budgetPeriodId, budgetPeriodId))
    .orderBy(budgetAccounts.role);
  }

  async createBudgetAccount(insertBudgetAccount: InsertBudgetAccount): Promise<BudgetAccount> {
    const [budgetAccount] = await db.insert(budgetAccounts).values(insertBudgetAccount).returning();
    return budgetAccount;
  }

  async updateBudgetAccount(id: number, updates: Partial<BudgetAccount>): Promise<BudgetAccount> {
    const [updated] = await db.update(budgetAccounts).set(updates).where(eq(budgetAccounts.id, id)).returning();
    return updated;
  }

  async calculateBudgetProgress(budgetPeriodId: number): Promise<{ totalAllocated: number; totalSpent: number; remainingToBudget: number; }> {
    const period = await db.select().from(budgetPeriods).where(eq(budgetPeriods.id, budgetPeriodId)).limit(1);
    if (!period.length) throw new Error('Budget period not found');

    const categories = await db.select().from(budgetCategories).where(eq(budgetCategories.budgetPeriodId, budgetPeriodId));
    
    const totalAllocated = categories.reduce((sum, cat) => sum + parseFloat(cat.allocatedAmount || '0'), 0);
    const totalSpent = categories.reduce((sum, cat) => sum + parseFloat(cat.spentAmount || '0'), 0);
    const totalIncome = parseFloat((period[0].totalIncome as string) || '0');
    
    return {
      totalAllocated,
      totalSpent,
      remainingToBudget: totalIncome - totalAllocated,
    };
  }

  async deleteBudgetCategory(id: number): Promise<void> {
    await db.delete(budgetCategories).where(eq(budgetCategories.id, id));
  }

  async getImportHistoryByUserId(userId: number): Promise<ImportHistory[]> {
    return await db.select().from(importHistory).where(eq(importHistory.userId, userId)).orderBy(desc(importHistory.importDate));
  }

  async createImportHistory(insertImportHistory: InsertImportHistory): Promise<ImportHistory> {
    const [result] = await db.insert(importHistory).values(insertImportHistory).returning();
    return result;
  }

  async getImportBatchesByUserId(userId: number): Promise<ImportBatch[]> {
    return await db.select().from(importBatches).where(eq(importBatches.userId, userId)).orderBy(desc(importBatches.batchDate));
  }

  async createImportBatch(insertImportBatch: InsertImportBatch): Promise<ImportBatch> {
    const [result] = await db.insert(importBatches).values(insertImportBatch).returning();
    return result;
  }

  async updateImportBatch(id: number, updates: Partial<ImportBatch>): Promise<ImportBatch> {
    const [result] = await db.update(importBatches).set(updates).where(eq(importBatches.id, id)).returning();
    return result;
  }

  async getImportHistoryByBatchId(batchId: number): Promise<ImportHistory[]> {
    return await db.select().from(importHistory).where(eq(importHistory.batchId, batchId)).orderBy(desc(importHistory.importDate));
  }

  async getTransactionHashesByUserId(userId: number): Promise<TransactionHash[]> {
    return await db.select().from(transactionHashes).where(eq(transactionHashes.userId, userId));
  }

  async createTransactionHash(insertTransactionHash: InsertTransactionHash): Promise<TransactionHash> {
    const [result] = await db.insert(transactionHashes).values(insertTransactionHash).returning();
    return result;
  }

  async createTransactionHashBatch(insertTransactionHashes: InsertTransactionHash[]): Promise<TransactionHash[]> {
    return await db.insert(transactionHashes).values(insertTransactionHashes).returning();
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }
}

export const storage = new DatabaseStorage();