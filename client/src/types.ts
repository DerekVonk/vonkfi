// Import and re-export types from shared schema
import type {
  User,
  InsertUser,
  Account,
  InsertAccount,
  Transaction,
  InsertTransaction,
  Category,
  InsertCategory,
  Goal,
  InsertGoal,
  Allocation,
  InsertAllocation,
  TransferRecommendation,
  InsertTransferRecommendation,
  CryptoWallet,
  InsertCryptoWallet,
  BudgetPeriod,
  InsertBudgetPeriod,
  BudgetCategory,
  InsertBudgetCategory,
  BudgetAccount,
  InsertBudgetAccount,
  ImportBatch,
  InsertImportBatch,
  ImportHistory,
  InsertImportHistory,
  TransactionHash,
  InsertTransactionHash,
  TransferPreference,
  InsertTransferPreference,
} from '@shared/schema';

export type {
  User,
  InsertUser,
  Account,
  InsertAccount,
  Transaction,
  InsertTransaction,
  Category,
  InsertCategory,
  Goal,
  InsertGoal,
  Allocation,
  InsertAllocation,
  TransferRecommendation,
  InsertTransferRecommendation,
  CryptoWallet,
  InsertCryptoWallet,
  BudgetPeriod,
  InsertBudgetPeriod,
  BudgetCategory,
  InsertBudgetCategory,
  BudgetAccount,
  InsertBudgetAccount,
  ImportBatch,
  InsertImportBatch,
  ImportHistory,
  InsertImportHistory,
  TransactionHash,
  InsertTransactionHash,
  TransferPreference,
  InsertTransferPreference,
};

// Dashboard-specific types
export interface FireMetrics {
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  fireProgress: number;
  timeToFire: number;
  netWorth: number;
  currentMonth: string;
  monthlyBreakdown: {
    month: string;
    income: number;
    expenses: number;
    savings: number;
  }[];
  bufferStatus: {
    current: number;
    target: number;
    status: 'below' | 'optimal' | 'above';
  };
  volatility: {
    average: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    score: 'low' | 'medium' | 'high';
  };
}

export interface DashboardData {
  accounts: Account[];
  goals: Goal[];
  transferRecommendations: TransferRecommendation[];
  fireMetrics: FireMetrics;
  monthlyData: {
    income: number;
    expenses: number;
    savings: number;
    month: string;
  }[];
}