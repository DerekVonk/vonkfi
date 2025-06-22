import React, { memo, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { api } from '../lib/api';

// Optimized interfaces
interface Account {
  id: number;
  customName: string;
  balance: string;
  role: string;
}

interface Transaction {
  id: number;
  date: string;
  amount: string;
  description: string;
  merchant?: string;
}

interface Goal {
  id: number;
  name: string;
  target: number;
  linkedAccountId?: number;
}

interface FireMetrics {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  fireProgress: number;
  yearsToFire: number;
}

interface DashboardData {
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  fireMetrics: FireMetrics;
}

// Memoized account card component
const AccountCard = memo(({ account }: { account: Account }) => {
  const balance = useMemo(() => parseFloat(account.balance), [account.balance]);
  const formattedBalance = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR'
    }).format(balance),
    [balance]
  );

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {account.customName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formattedBalance}</div>
        <p className="text-xs text-muted-foreground capitalize">{account.role}</p>
      </CardContent>
    </Card>
  );
});

AccountCard.displayName = 'AccountCard';

// Memoized transaction item component
const TransactionItem = memo(({ transaction }: { transaction: Transaction }) => {
  const amount = useMemo(() => parseFloat(transaction.amount), [transaction.amount]);
  const isIncome = useMemo(() => amount > 0, [amount]);
  
  const formattedAmount = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      signDisplay: 'always'
    }).format(amount),
    [amount]
  );

  const formattedDate = useMemo(() => 
    new Date(transaction.date).toLocaleDateString('en-EU', {
      month: 'short',
      day: 'numeric'
    }),
    [transaction.date]
  );

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {transaction.merchant || transaction.description}
        </p>
        <p className="text-xs text-muted-foreground">{formattedDate}</p>
      </div>
      <div className={`text-sm font-medium ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
        {formattedAmount}
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';

// Memoized goal progress component
const GoalProgress = memo(({ goal, accounts }: { goal: Goal; accounts: Account[] }) => {
  const linkedAccount = useMemo(() => 
    accounts.find(acc => acc.id === goal.linkedAccountId),
    [accounts, goal.linkedAccountId]
  );

  const currentBalance = useMemo(() => 
    linkedAccount ? parseFloat(linkedAccount.balance) : 0,
    [linkedAccount]
  );

  const progress = useMemo(() => 
    Math.min((currentBalance / goal.target) * 100, 100),
    [currentBalance, goal.target]
  );

  const formattedCurrent = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(currentBalance),
    [currentBalance]
  );

  const formattedTarget = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(goal.target),
    [goal.target]
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">{goal.name}</h4>
        <span className="text-xs text-muted-foreground">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-orange-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formattedCurrent}</span>
        <span>{formattedTarget}</span>
      </div>
    </div>
  );
});

GoalProgress.displayName = 'GoalProgress';

// Memoized FIRE metrics component
const FireMetricsCard = memo(({ metrics }: { metrics: FireMetrics }) => {
  const formattedBalance = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(metrics.totalBalance),
    [metrics.totalBalance]
  );

  const formattedIncome = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(metrics.monthlyIncome),
    [metrics.monthlyIncome]
  );

  const formattedExpenses = useMemo(() => 
    new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(metrics.monthlyExpenses),
    [metrics.monthlyExpenses]
  );

  const savingsRatePercentage = useMemo(() => 
    Math.round(metrics.savingsRate * 100),
    [metrics.savingsRate]
  );

  const fireProgressPercentage = useMemo(() => 
    Math.round(metrics.fireProgress * 100),
    [metrics.fireProgress]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>FIRE Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Balance</p>
            <p className="text-lg font-bold">{formattedBalance}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly Income</p>
            <p className="text-lg font-bold text-green-600">{formattedIncome}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly Expenses</p>
            <p className="text-lg font-bold text-red-600">{formattedExpenses}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className="text-lg font-bold text-orange-500">{savingsRatePercentage}%</p>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">FIRE Progress</span>
            <span className="text-sm text-muted-foreground">{fireProgressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-orange-400 to-orange-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(fireProgressPercentage, 100)}%` }}
            />
          </div>
          {metrics.yearsToFire > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {Math.round(metrics.yearsToFire)} years to FIRE
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

FireMetricsCard.displayName = 'FireMetricsCard';

// Loading skeleton component
const DashboardSkeleton = memo(() => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div>
                  <Skeleton className="h-4 w-40 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  </div>
));

DashboardSkeleton.displayName = 'DashboardSkeleton';

// Main optimized dashboard component
const OptimizedDashboard = memo(({ userId }: { userId: number }) => {
  // Use React Query for optimized data fetching with caching
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard', userId],
    queryFn: async () => {
      const response = await fetch(api.getDashboard(userId), { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      return response.json();
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Memoized account cards to prevent unnecessary re-renders
  const accountCards = useMemo(() => {
    if (!data?.accounts) return null;
    
    return data.accounts.map(account => (
      <AccountCard key={account.id} account={account} />
    ));
  }, [data?.accounts]);

  // Memoized transaction list
  const transactionList = useMemo(() => {
    if (!data?.transactions) return null;
    
    return data.transactions.slice(0, 10).map(transaction => (
      <TransactionItem key={transaction.id} transaction={transaction} />
    ));
  }, [data?.transactions]);

  // Memoized goal progress components
  const goalProgress = useMemo(() => {
    if (!data?.goals || !data?.accounts) return null;
    
    return data.goals.map(goal => (
      <GoalProgress 
        key={goal.id} 
        goal={goal} 
        accounts={data.accounts}
      />
    ));
  }, [data?.goals, data?.accounts]);

  // Error handling
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-red-600">Failed to load dashboard data</p>
        <button 
          onClick={handleRetry}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Overview */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Account Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accountCards}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {transactionList}
            </div>
          </CardContent>
        </Card>

        {/* FIRE Metrics */}
        <FireMetricsCard metrics={data.fireMetrics} />
      </div>

      {/* Goals Progress */}
      {data.goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Goals Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {goalProgress}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

OptimizedDashboard.displayName = 'OptimizedDashboard';

export default OptimizedDashboard;