import { 
  users, accounts, transactions, categories, goals, allocations, 
  bufferHistory, transferRecommendations, transferExecutions,
  accountBalances, userSettings, cryptoWallets, cryptoTransactions,
  type User, type InsertUser, type Account, type InsertAccount,
  type Transaction, type InsertTransaction, type Category, type InsertCategory,
  type Goal, type InsertGoal, type Allocation, type InsertAllocation,
  type TransferRecommendation, type InsertTransferRecommendation,
  type CryptoWallet, type InsertCryptoWallet
} from "@shared/schema";

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

  // Transactions
  getTransactionsByAccountId(accountId: number): Promise<Transaction[]>;
  getTransactionsByUserId(userId: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransactionCategory(id: number, categoryId: number): Promise<Transaction>;

  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;

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

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private accounts: Map<number, Account> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private categories: Map<number, Category> = new Map();
  private goals: Map<number, Goal> = new Map();
  private allocations: Map<number, Allocation> = new Map();
  private transferRecommendations: Map<number, TransferRecommendation> = new Map();
  private cryptoWallets: Map<number, CryptoWallet> = new Map();
  
  private currentUserId = 1;
  private currentAccountId = 1;
  private currentTransactionId = 1;
  private currentCategoryId = 1;
  private currentGoalId = 1;
  private currentAllocationId = 1;
  private currentTransferRecommendationId = 1;
  private currentCryptoWalletId = 1;

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Create default categories
    const defaultCategories: Category[] = [
      { id: 1, name: "Income", type: "income", parentId: null, color: "#2E7D32", icon: "fas fa-arrow-up", isSystemCategory: true },
      { id: 2, name: "Housing", type: "essential", parentId: null, color: "#1565C0", icon: "fas fa-home", isSystemCategory: true },
      { id: 3, name: "Food", type: "essential", parentId: null, color: "#FF6B35", icon: "fas fa-utensils", isSystemCategory: true },
      { id: 4, name: "Transportation", type: "essential", parentId: null, color: "#9C27B0", icon: "fas fa-car", isSystemCategory: true },
      { id: 5, name: "Utilities", type: "essential", parentId: null, color: "#607D8B", icon: "fas fa-bolt", isSystemCategory: true },
      { id: 6, name: "Entertainment", type: "discretionary", parentId: null, color: "#E91E63", icon: "fas fa-gamepad", isSystemCategory: true },
      { id: 7, name: "Shopping", type: "discretionary", parentId: null, color: "#FF9800", icon: "fas fa-shopping-bag", isSystemCategory: true },
      { id: 8, name: "Transfers", type: "transfer", parentId: null, color: "#00BCD4", icon: "fas fa-exchange-alt", isSystemCategory: true },
    ];

    defaultCategories.forEach(category => {
      this.categories.set(category.id, category);
    });
    this.currentCategoryId = 9;
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // Accounts
  async getAccountsByUserId(userId: number): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(account => account.userId === userId);
  }

  async getAccountByIban(iban: string): Promise<Account | undefined> {
    return Array.from(this.accounts.values()).find(account => account.iban === iban);
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const id = this.currentAccountId++;
    const now = new Date();
    const account: Account = { 
      ...insertAccount,
      id, 
      discoveredDate: now, 
      lastSeenDate: now,
      isActive: true,
      role: insertAccount.role || null,
      bic: insertAccount.bic || null,
      bankName: insertAccount.bankName || null,
      customName: insertAccount.customName || null,
      accountType: insertAccount.accountType || null
    };
    this.accounts.set(id, account);
    return account;
  }

  async updateAccount(id: number, updates: Partial<Account>): Promise<Account> {
    const account = this.accounts.get(id);
    if (!account) throw new Error("Account not found");
    
    const updated = { ...account, ...updates };
    this.accounts.set(id, updated);
    return updated;
  }

  // Transactions
  async getTransactionsByAccountId(accountId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(tx => tx.accountId === accountId);
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    const userAccounts = await this.getAccountsByUserId(userId);
    const accountIds = userAccounts.map(acc => acc.id);
    return Array.from(this.transactions.values()).filter(tx => accountIds.includes(tx.accountId));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const transaction: Transaction = { 
      ...insertTransaction, 
      id,
      currency: insertTransaction.currency || null,
      description: insertTransaction.description || null,
      merchant: insertTransaction.merchant || null,
      categoryId: insertTransaction.categoryId || null,
      isIncome: insertTransaction.isIncome || null,
      counterpartyIban: insertTransaction.counterpartyIban || null,
      counterpartyName: insertTransaction.counterpartyName || null,
      reference: insertTransaction.reference || null,
      statementId: insertTransaction.statementId || null
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async updateTransactionCategory(id: number, categoryId: number): Promise<Transaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) throw new Error("Transaction not found");
    
    const updated = { ...transaction, categoryId };
    this.transactions.set(id, updated);
    return updated;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = this.currentCategoryId++;
    const category: Category = { 
      ...insertCategory, 
      id,
      color: insertCategory.color || null,
      parentId: insertCategory.parentId || null,
      icon: insertCategory.icon || null,
      isSystemCategory: insertCategory.isSystemCategory || null
    };
    this.categories.set(id, category);
    return category;
  }

  // Goals
  async getGoalsByUserId(userId: number): Promise<Goal[]> {
    return Array.from(this.goals.values()).filter(goal => goal.userId === userId);
  }

  async createGoal(insertGoal: InsertGoal): Promise<Goal> {
    const id = this.currentGoalId++;
    const goal: Goal = { 
      ...insertGoal, 
      id,
      currentAmount: insertGoal.currentAmount || null,
      linkedAccountId: insertGoal.linkedAccountId || null,
      targetDate: insertGoal.targetDate || null,
      priority: insertGoal.priority || null,
      isCompleted: insertGoal.isCompleted || null
    };
    this.goals.set(id, goal);
    return goal;
  }

  async updateGoal(id: number, updates: Partial<Goal>): Promise<Goal> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error("Goal not found");
    
    const updated = { ...goal, ...updates };
    this.goals.set(id, updated);
    return updated;
  }

  // Allocations
  async getAllocationsByUserId(userId: number): Promise<Allocation[]> {
    return Array.from(this.allocations.values()).filter(allocation => allocation.userId === userId);
  }

  async createAllocation(insertAllocation: InsertAllocation): Promise<Allocation> {
    const id = this.currentAllocationId++;
    const allocation: Allocation = { 
      ...insertAllocation, 
      id,
      isActive: insertAllocation.isActive || null,
      categoryId: insertAllocation.categoryId || null,
      goalId: insertAllocation.goalId || null,
      fixedAmount: insertAllocation.fixedAmount || null
    };
    this.allocations.set(id, allocation);
    return allocation;
  }

  // Transfer Recommendations
  async getTransferRecommendationsByUserId(userId: number): Promise<TransferRecommendation[]> {
    return Array.from(this.transferRecommendations.values()).filter(rec => rec.userId === userId);
  }

  async createTransferRecommendation(insertRecommendation: InsertTransferRecommendation): Promise<TransferRecommendation> {
    const id = this.currentTransferRecommendationId++;
    const recommendation: TransferRecommendation = { 
      ...insertRecommendation, 
      id, 
      date: new Date(),
      status: "pending",
      goalId: insertRecommendation.goalId || null
    };
    this.transferRecommendations.set(id, recommendation);
    return recommendation;
  }

  async updateTransferRecommendationStatus(id: number, status: string): Promise<TransferRecommendation> {
    const recommendation = this.transferRecommendations.get(id);
    if (!recommendation) throw new Error("Transfer recommendation not found");
    
    const updated = { ...recommendation, status };
    this.transferRecommendations.set(id, updated);
    return updated;
  }

  // Crypto Wallets
  async getCryptoWalletsByUserId(userId: number): Promise<CryptoWallet[]> {
    return Array.from(this.cryptoWallets.values()).filter(wallet => wallet.userId === userId);
  }

  async createCryptoWallet(insertWallet: InsertCryptoWallet): Promise<CryptoWallet> {
    const id = this.currentCryptoWalletId++;
    const wallet: CryptoWallet = { 
      ...insertWallet, 
      id,
      isActive: insertWallet.isActive || null,
      provider: insertWallet.provider || null
    };
    this.cryptoWallets.set(id, wallet);
    return wallet;
  }
}

export const storage = new MemStorage();
