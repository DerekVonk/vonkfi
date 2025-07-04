import { pgTable, text, serial, integer, boolean, decimal, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  iban: text("iban").notNull(),
  bic: text("bic"),
  accountHolderName: text("account_holder_name").notNull(),
  bankName: text("bank_name"),
  customName: text("custom_name"),
  accountType: text("account_type"), // checking, savings, investment
  role: text("role"), // income, spending, emergency, goal-specific
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0"),
  discoveredDate: timestamp("discovered_date").defaultNow(),
  lastSeenDate: timestamp("last_seen_date").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  date: timestamp("date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("EUR"),
  description: text("description"),
  merchant: text("merchant"),
  categoryId: integer("category_id"),
  isIncome: boolean("is_income").default(false),
  counterpartyIban: text("counterparty_iban"),
  counterpartyName: text("counterparty_name"),
  reference: text("reference"),
  statementId: text("statement_id"),
  transactionType: text("transaction_type"), // credit, debit, transfer
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // essential, discretionary, income, transfer
  parentId: integer("parent_id"),
  color: text("color"),
  icon: text("icon"),
  isSystemCategory: boolean("is_system_category").default(false),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 12, scale: 2 }).default("0"),
  linkedAccountId: integer("linked_account_id"),
  targetDate: text("target_date"),
  priority: integer("priority").default(1),
  isCompleted: boolean("is_completed").default(false),
});

export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  categoryId: integer("category_id"),
  goalId: integer("goal_id"),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
  fixedAmount: decimal("fixed_amount", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").default(true),
});

// Zero Based Budgeting tables
export const budgetPeriods = pgTable("budget_periods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(), // "January 2025", "Q1 2025"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalIncome: decimal("total_income", { precision: 12, scale: 2 }).default("0"),
  totalAllocated: decimal("total_allocated", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const budgetCategories = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  budgetPeriodId: integer("budget_period_id").notNull(),
  categoryId: integer("category_id").notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 12, scale: 2 }).notNull(),
  spentAmount: decimal("spent_amount", { precision: 12, scale: 2 }).default("0"),
  priority: integer("priority").default(1), // 1=needs, 2=wants, 3=savings
  notes: text("notes"),
  isFixed: boolean("is_fixed").default(false), // for fixed expenses
});

export const budgetAccounts = pgTable("budget_accounts", {
  id: serial("id").primaryKey(),
  budgetPeriodId: integer("budget_period_id").notNull(),
  accountId: integer("account_id").notNull(),
  role: text("role").notNull(), // "income", "fixed_expenses", "variable_expenses", "savings"
  targetBalance: decimal("target_balance", { precision: 12, scale: 2 }),
  allocatedAmount: decimal("allocated_amount", { precision: 12, scale: 2 }).default("0"),
});

export const bufferHistory = pgTable("buffer_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: timestamp("date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(), // below, optimal, above
});

export const transferRecommendations = pgTable("transfer_recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: timestamp("date").defaultNow(),
  fromAccountId: integer("from_account_id").notNull(),
  toAccountId: integer("to_account_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").default("pending"), // pending, completed, skipped
  goalId: integer("goal_id"),
});

export const transferExecutions = pgTable("transfer_executions", {
  id: serial("id").primaryKey(),
  recommendationId: integer("recommendation_id").notNull(),
  executedDate: timestamp("executed_date").defaultNow(),
  confirmedByUser: boolean("confirmed_by_user").default(true),
});

export const accountBalances = pgTable("account_balances", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  date: timestamp("date").notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull(),
  sourceStatementId: text("source_statement_id"),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  settings: jsonb("settings").notNull(),
});

export const cryptoWallets = pgTable("crypto_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  currency: text("currency").notNull(), // BTC, ETH, etc.
  provider: text("provider"), // exchange name or "self-custody"
  isActive: boolean("is_active").default(true),
});

export const cryptoTransactions = pgTable("crypto_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull(),
  date: timestamp("date").notNull(),
  type: text("type").notNull(), // buy, sell, transfer_in, transfer_out
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  price: decimal("price", { precision: 12, scale: 2 }),
  fiatAmount: decimal("fiat_amount", { precision: 12, scale: 2 }),
  txHash: text("tx_hash"),
});

// Import batches - groups related file imports together
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  batchDate: timestamp("batch_date").defaultNow(),
  totalFiles: integer("total_files").default(0),
  totalTransactions: integer("total_transactions").default(0),
  accountsAffected: text("accounts_affected").array(), // Array of account IBANs
  status: text("status").default("completed"), // processing, completed, failed
  notes: text("notes"),
});

// Individual file imports within batches
export const importHistory = pgTable("import_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  batchId: integer("batch_id").references(() => importBatches.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  statementId: text("statement_id"),
  importDate: timestamp("import_date").defaultNow(),
  accountsFound: integer("accounts_found").default(0),
  transactionsImported: integer("transactions_imported").default(0),
  duplicatesSkipped: integer("duplicates_skipped").default(0),
  status: text("status").default("completed"), // processing, completed, failed
  errorMessage: text("error_message"),
});

// Transaction deduplication tracking
export const transactionHashes = pgTable("transaction_hashes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  transactionId: integer("transaction_id").references(() => transactions.id).notNull(),
  hash: text("hash").notNull(), // SHA-256 hash of transaction key fields
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueHash: unique("unique_user_hash").on(table.userId, table.hash),
}));

// Transfer destination preferences
export const transferPreferences = pgTable("transfer_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  preferenceType: text("preference_type").notNull(), // 'buffer', 'goal', 'investment'
  priority: integer("priority").notNull(), // 1=highest priority
  accountId: integer("account_id").references(() => accounts.id),
  accountRole: text("account_role"), // 'emergency', 'savings', 'checking', etc.
  goalPattern: text("goal_pattern"), // regex pattern to match goal names
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueUserTypePriority: unique("unique_user_type_priority").on(table.userId, table.preferenceType, table.priority),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, discoveredDate: true, lastSeenDate: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true });
export const insertAllocationSchema = createInsertSchema(allocations).omit({ id: true });
export const insertTransferRecommendationSchema = createInsertSchema(transferRecommendations).omit({ id: true, date: true });
export const insertCryptoWalletSchema = createInsertSchema(cryptoWallets).omit({ id: true });
export const insertBudgetPeriodSchema = createInsertSchema(budgetPeriods).omit({ id: true, createdAt: true });
export const insertBudgetCategorySchema = createInsertSchema(budgetCategories).omit({ id: true });
export const insertBudgetAccountSchema = createInsertSchema(budgetAccounts).omit({ id: true });
export const insertImportBatchSchema = createInsertSchema(importBatches).omit({ id: true, batchDate: true });
export const insertImportHistorySchema = createInsertSchema(importHistory).omit({ id: true, importDate: true });
export const insertTransactionHashSchema = createInsertSchema(transactionHashes).omit({ id: true, createdAt: true });
export const insertTransferPreferenceSchema = createInsertSchema(transferPreferences).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Allocation = typeof allocations.$inferSelect;
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;
export type TransferRecommendation = typeof transferRecommendations.$inferSelect;
export type InsertTransferRecommendation = z.infer<typeof insertTransferRecommendationSchema>;
export type CryptoWallet = typeof cryptoWallets.$inferSelect;
export type InsertCryptoWallet = z.infer<typeof insertCryptoWalletSchema>;
export type BudgetPeriod = typeof budgetPeriods.$inferSelect;
export type InsertBudgetPeriod = z.infer<typeof insertBudgetPeriodSchema>;
export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetAccount = typeof budgetAccounts.$inferSelect;
export type InsertBudgetAccount = z.infer<typeof insertBudgetAccountSchema>;
export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportHistory = typeof importHistory.$inferSelect;
export type InsertImportHistory = z.infer<typeof insertImportHistorySchema>;
export type TransactionHash = typeof transactionHashes.$inferSelect;
export type InsertTransactionHash = z.infer<typeof insertTransactionHashSchema>;
export type TransferPreference = typeof transferPreferences.$inferSelect;
export type InsertTransferPreference = z.infer<typeof insertTransferPreferenceSchema>;
