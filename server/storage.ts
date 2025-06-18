import { 
  users, accounts, transactions, categories, goals, allocations, 
  transferRecommendations, cryptoWallets,
  type User, type InsertUser, type Account, type InsertAccount,
  type Transaction, type InsertTransaction, type Category, type InsertCategory,
  type Goal, type InsertGoal, type Allocation, type InsertAllocation,
  type TransferRecommendation, type InsertTransferRecommendation,
  type CryptoWallet, type InsertCryptoWallet
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray } from "drizzle-orm";

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

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async clearUserData(userId: number): Promise<void> {
    // Clear only imported bank statement data and calculated metrics
    // Preserve user configurations: accounts, categories, goals, crypto wallets
    
    // Get user's accounts
    const userAccounts = await this.getAccountsByUserId(userId);
    const accountIds = userAccounts.map(acc => acc.id);
    
    // Delete transactions (imported bank statement data)
    if (accountIds.length > 0) {
      await db.delete(transactions).where(inArray(transactions.accountId, accountIds));
    }
    
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
}

export const storage = new DatabaseStorage();