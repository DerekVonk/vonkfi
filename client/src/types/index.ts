export interface DashboardData {
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  fireMetrics: FireMetrics;
  transferRecommendations: TransferRecommendation[];
}

export interface Account {
  id: number;
  iban: string;
  customName: string | null;
  accountType: string;
  role: string | null;
  bankName: string | null;
  accountHolderName: string;
  balance: string | null;
}

export interface Transaction {
  id: number;
  date: string;
  amount: string;
  description: string | null;
  merchant: string | null;
  categoryId: number | null;
  isIncome: boolean;
}

export interface Goal {
  id: number;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  isCompleted: boolean;
  linkedAccountId: number | null;
}

export interface FireMetrics {
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  fireProgress: number;
  timeToFire: number;
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

export interface TransferRecommendation {
  id: number;
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  purpose: string;
  status: string;
  goalId: number | null;
}

export interface Category {
  id: number;
  name: string;
  type: string;
  color: string | null;
  icon: string | null;
}
