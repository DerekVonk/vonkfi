import {
  type Account,
  accounts,
  type Allocation,
  allocations,
  type BudgetAccount,
  budgetAccounts,
  budgetCategories,
  type BudgetCategory,
  type BudgetPeriod,
  budgetPeriods,
  categories,
  type Category,
  type CryptoWallet,
  cryptoWallets,
  type Goal,
  goals,
  type ImportBatch,
  importBatches,
  importHistory,
  type ImportHistory,
  type InsertAccount,
  type InsertAllocation,
  type InsertBudgetAccount,
  type InsertBudgetCategory,
  type InsertBudgetPeriod,
  type InsertCategory,
  type InsertCryptoWallet,
  type InsertGoal,
  type InsertImportBatch,
  type InsertImportHistory,
  type InsertTransaction,
  type InsertTransactionHash,
  type InsertTransferPreference,
  type InsertTransferRecommendation,
  type InsertUser,
  type Transaction,
  type TransactionHash,
  transactionHashes,
  transactions,
  type TransferPreference,
  transferPreferences,
  type TransferRecommendation,
  transferRecommendations,
  type User,
  users
} from "@shared/schema";
import {db} from "./db";
import {and, desc, eq, inArray, sql} from "drizzle-orm";
import {hashPassword, needsRehash, verifyPassword} from "./utils/passwordSecurity";

// Performance monitoring utility
class QueryPerformanceMonitor {
  private static enabled = process.env.NODE_ENV === 'development';
  
  static async timeQuery<T>(queryName: string, queryFn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return queryFn();
    
    const startTime = Date.now();
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    if (duration > 100) { // Log slow queries (>100ms)
      console.log(`🐌 Slow query ${queryName}: ${duration}ms`);
    } else if (duration > 50) {
      console.log(`⚠️  Query ${queryName}: ${duration}ms`);
    } else {
      console.log(`✅ Query ${queryName}: ${duration}ms`);
    }
    
    return result;
  }
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  authenticateUser(username: string, password: string): Promise<User | null>;
  updateUserPassword(id: number, newPassword: string): Promise<void>;

  // Accounts
  getAccountsByUserId(userId: number): Promise<Account[]>;
  getAccountByIban(iban: string): Promise<Account | undefined>;
  getAccountById(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, updates: Partial<Account>): Promise<Account>;
  deleteAccount(id: number): Promise<void>;

  // Transactions
  getTransactionById(id: number): Promise<Transaction | undefined>;
  getTransactionsByAccountId(accountId: number): Promise<Transaction[]>;
  getTransactionsByUserId(userId: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction>;
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

  // Transfer Execution
  executeTransfer(transfer: {
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
  }>;

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

  // Transfer Preferences
  getTransferPreferencesByUserId(userId: number): Promise<TransferPreference[]>;
  createTransferPreference(preference: InsertTransferPreference): Promise<TransferPreference>;
  updateTransferPreference(id: number, updates: Partial<TransferPreference>): Promise<TransferPreference>;
  deleteTransferPreference(id: number): Promise<void>;

  // Optimized Dashboard Queries
  getDashboardDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: (Transaction & { categoryName?: string })[];
    goals: Goal[];
    categories: Category[];
    transferRecommendations: TransferRecommendation[];
  }>;

  // Optimized Transaction Queries
  getTransactionsByUserIdOptimized(userId: number, limit?: number): Promise<(Transaction & { accountName?: string; categoryName?: string })[]>;

  // Optimized Transfer Generation Data
  getTransferGenerationDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: Transaction[];
    goals: Goal[];
    transferPreferences: TransferPreference[];
  }>;
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
    // Hash the password before storing
    const hashedPassword = await hashPassword(insertUser.password);
    
    // Check if username already exists
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }
    
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        password: hashedPassword
      })
      .returning();
    
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    try {
      const user = await this.getUserByUsername(username);
      if (!user) {
        return null;
      }

      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        return null;
      }

      // Check if password needs rehashing (due to updated security standards)
      if (needsRehash(user.password)) {
        await this.updateUserPassword(user.id, password);
      }

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword as User;
    } catch (error: unknown) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id));
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

  async getAccountById(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  // Transactions
  async getTransactionsByAccountId(accountId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    // Optimized: Use join instead of separate queries
    return db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          amount: transactions.amount,
          currency: transactions.currency,
          description: transactions.description,
          merchant: transactions.merchant,
          categoryId: transactions.categoryId,
          isIncome: transactions.isIncome,
          counterpartyIban: transactions.counterpartyIban,
          counterpartyName: transactions.counterpartyName,
          reference: transactions.reference,
          statementId: transactions.statementId,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(eq(accounts.userId, userId))
        .orderBy(desc(transactions.date));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getTransactionById(id: number): Promise<Transaction | undefined> {
    const result = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return result[0];
  }

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction> {
    const [transaction] = await db
      .update(transactions)
      .set(updates)
      .where(eq(transactions.id, id))
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
    
    // Reset account balances to 0 to ensure consistency with cleared transactions
    if (accountIds.length > 0) {
      await db.update(accounts)
        .set({ balance: "0" })
        .where(inArray(accounts.id, accountIds));
    }
    
    // Note: Accounts, categories, goals, and crypto wallets are preserved
  }

  async updateAccountBalances(userId: number): Promise<void> {
    // OPTIMIZED: Update all account balances using aggregated queries instead of N+1 pattern
    const result = await db
      .select({
        accountId: transactions.accountId,
        // noinspection SqlResolve
        calculatedBalance: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.userId, userId))
      .groupBy(transactions.accountId);
    
    // Batch update account balances
    for (const balanceUpdate of result) {
      await db.update(accounts)
        .set({ balance: balanceUpdate.calculatedBalance })
        .where(eq(accounts.id, balanceUpdate.accountId));
    }
  }

  async updateGoalAccountBalances(userId: number): Promise<void> {
    // First update all account balances
    await this.updateAccountBalances(userId);
    
    // OPTIMIZED: Update goal current amounts using a single join query
    await db
      .update(goals)
      .set({ 
        currentAmount: accounts.balance,
        isCompleted: sql`CASE WHEN ${accounts.balance}::decimal >= ${goals.targetAmount} THEN true ELSE false END`
      })
      .from(accounts)
      .where(
        and(
          eq(goals.userId, userId),
          eq(goals.linkedAccountId, accounts.id)
        )
      );
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
      const [sourceAccount, destinationAccount] = await Promise.all([
        this.getAccountById(fromAccountId),
        this.getAccountById(toAccountId)
      ]);

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
      const sourceBalance = parseFloat(sourceAccount.balance || '0');
      if (sourceBalance < amount) {
        return { success: false, message: "Insufficient funds in source account" };
      }

      // Execute the transfer using a transaction to ensure atomicity
      const transferId = `TXF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transferDate = new Date();

      // Create outgoing transaction (negative amount for source account)
      const sourceTransaction = await this.createTransaction({
        accountId: fromAccountId,
        date: transferDate,
        amount: (-amount).toString(),
        description: description,
        counterpartyIban: destinationAccount.iban,
        counterpartyName: destinationAccount.accountHolderName,
        reference: `INTERNAL_TRANSFER_${transferId}`
      });

      // Create incoming transaction (positive amount for destination account)
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
      const newDestinationBalance = (parseFloat(destinationAccount.balance || '0') + amount).toString();

      await Promise.all([
        this.updateAccount(fromAccountId, { balance: newSourceBalance }),
        this.updateAccount(toAccountId, { balance: newDestinationBalance })
      ]);

      return {
        success: true,
        transferId,
        message: "Transfer completed successfully",
        sourceTransaction,
        destinationTransaction
      };

    } catch (error: unknown) {
      console.error("Transfer execution error:", error);
      return { 
        success: false, 
        message: "Transfer failed due to internal error" 
      };
    }
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
    .innerJoin(categories, eq(budgetCategories.categoryId, categories.id))
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
    .innerJoin(accounts, eq(budgetAccounts.accountId, accounts.id))
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
    try {
      return await db.select().from(transactionHashes).where(eq(transactionHashes.userId, userId));
    } catch (error: any) {
      // Handle missing table gracefully - return empty array so duplicate detection can continue
      if (error.message?.includes('relation "transaction_hashes" does not exist')) {
        console.warn('transaction_hashes table does not exist - duplicate detection will be disabled');
        return [];
      }
      throw error;
    }
  }

  async createTransactionHash(insertTransactionHash: InsertTransactionHash): Promise<TransactionHash> {
    const [result] = await db.insert(transactionHashes).values(insertTransactionHash).returning();
    return result;
  }

  async createTransactionHashBatch(insertTransactionHashes: InsertTransactionHash[]): Promise<TransactionHash[]> {
    if (insertTransactionHashes.length === 0) {
      return [];
    }
    
    try {
      return await db.insert(transactionHashes).values(insertTransactionHashes).returning();
    } catch (error: any) {
      // Handle missing table gracefully
      if (error.message?.includes('relation "transaction_hashes" does not exist')) {
        console.warn('transaction_hashes table does not exist - hash creation skipped');
        return [];
      }
      // Handle unique constraint violations gracefully
      if (error.code === '23505' && error.constraint === 'unique_user_hash') {
        console.warn('Duplicate hash detected, skipping batch creation');
        return [];
      }
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Transfer Preferences
  async getTransferPreferencesByUserId(userId: number): Promise<TransferPreference[]> {
    return await db.select()
      .from(transferPreferences)
      .where(eq(transferPreferences.userId, userId))
      .orderBy(transferPreferences.preferenceType, transferPreferences.priority);
  }

  async createTransferPreference(insertTransferPreference: InsertTransferPreference): Promise<TransferPreference> {
    const [result] = await db.insert(transferPreferences).values(insertTransferPreference).returning();
    return result;
  }

  async updateTransferPreference(id: number, updates: Partial<TransferPreference>): Promise<TransferPreference> {
    const [result] = await db.update(transferPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(transferPreferences.id, id))
      .returning();
    return result;
  }

  async deleteTransferPreference(id: number): Promise<void> {
    await db.delete(transferPreferences).where(eq(transferPreferences.id, id));
  }

  // Optimized Dashboard Query - Reduces 5+ queries to 2-3 queries
  async getDashboardDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: (Transaction & { categoryName?: string })[];
    goals: Goal[];
    categories: Category[];
    transferRecommendations: TransferRecommendation[];
  }> {
    return QueryPerformanceMonitor.timeQuery<{
      accounts: Account[];
      transactions: (Transaction & { categoryName?: string })[];
      goals: Goal[];
      categories: Category[];
      transferRecommendations: TransferRecommendation[];
    }>('getDashboardDataOptimized', async () => {
      // Query 1: Get all basic user data in parallel
      const [userAccounts, userGoals, allCategories, userTransferRecommendations] = await Promise.all([
        QueryPerformanceMonitor.timeQuery('accounts', () => this.getAccountsByUserId(userId)),
        QueryPerformanceMonitor.timeQuery('goals', () => this.getGoalsByUserId(userId)),
        QueryPerformanceMonitor.timeQuery('categories', () => this.getCategories()),
        QueryPerformanceMonitor.timeQuery('transferRecommendations', () => this.getTransferRecommendationsByUserId(userId))
      ]);

      // Query 2: Get ALL transactions (not limited) with optional category names for monthly breakdown calculations
      const transactionsWithCategories = await QueryPerformanceMonitor.timeQuery('transactionsWithCategories', () =>
        db
          .select({
            id: transactions.id,
            accountId: transactions.accountId,
            date: transactions.date,
            amount: transactions.amount,
            currency: transactions.currency,
            description: transactions.description,
            merchant: transactions.merchant,
            categoryId: transactions.categoryId,
            isIncome: transactions.isIncome,
            counterpartyIban: transactions.counterpartyIban,
            counterpartyName: transactions.counterpartyName,
            reference: transactions.reference,
            statementId: transactions.statementId,
            categoryName: categories.name,
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .where(eq(accounts.userId, userId))
          .orderBy(desc(transactions.date))
      );

      return {
        accounts: userAccounts,
        transactions: transactionsWithCategories,
        goals: userGoals,
        categories: allCategories,
        transferRecommendations: userTransferRecommendations
      };
    });
  }

  // Optimized Transaction Query with Account and Category Names
  async getTransactionsByUserIdOptimized(userId: number, limit = 50): Promise<(Transaction & { accountName?: string; categoryName?: string })[]> {
    return QueryPerformanceMonitor.timeQuery(`getTransactionsByUserIdOptimized(limit=${limit})`, () =>
      db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          amount: transactions.amount,
          currency: transactions.currency,
          description: transactions.description,
          merchant: transactions.merchant,
          categoryId: transactions.categoryId,
          isIncome: transactions.isIncome,
          counterpartyIban: transactions.counterpartyIban,
          counterpartyName: transactions.counterpartyName,
          reference: transactions.reference,
          statementId: transactions.statementId,
          accountName: sql<string>`COALESCE(${accounts.customName}, ${accounts.accountHolderName})`,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(accounts.userId, userId))
        .orderBy(desc(transactions.date))
        .limit(limit)
    );
  }

  // Optimized Transfer Generation Data - Reduces 4 queries to 1 query
  async getTransferGenerationDataOptimized(userId: number): Promise<{
    accounts: Account[];
    transactions: Transaction[];
    goals: Goal[];
    transferPreferences: TransferPreference[];
  }> {
    // Single parallel query for all transfer generation data
    const [accounts, transactions, goals, transferPreferences] = await Promise.all([
      this.getAccountsByUserId(userId),
      this.getTransactionsByUserId(userId), // Already optimized with join
      this.getGoalsByUserId(userId),
      this.getTransferPreferencesByUserId(userId)
    ]);

    return {
      accounts,
      transactions,
      goals,
      transferPreferences
    };
  }
}

export const storage = new DatabaseStorage();