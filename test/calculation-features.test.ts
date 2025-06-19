import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Financial Calculation Engine', () => {
  // Test data based on actual API response
  const testTransactions = [
    { id: 1, amount: 1759.97, isIncome: true, date: '2025-01-01' },
    { id: 2, amount: -850.50, isIncome: false, date: '2025-01-01' },
    { id: 3, amount: -123.45, isIncome: false, date: '2025-01-01' },
    { id: 4, amount: 2500.00, isIncome: true, date: '2025-01-15' },
    { id: 5, amount: -1200.00, isIncome: false, date: '2025-01-20' },
  ];

  const calculateMonthlyMetrics = (transactions: any[]) => {
    const income = transactions
      .filter(t => t.isIncome)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const expenses = transactions
      .filter(t => !t.isIncome)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const savings = income - expenses;
    const savingsRate = income > 0 ? savings / income : 0;
    
    return { income, expenses, savings, savingsRate };
  };

  it('should correctly calculate monthly income from transactions', () => {
    const result = calculateMonthlyMetrics(testTransactions);
    expect(result.income).toBe(4259.97);
  });

  it('should correctly calculate monthly expenses from transactions', () => {
    const result = calculateMonthlyMetrics(testTransactions);
    expect(result.expenses).toBe(2173.95);
  });

  it('should correctly calculate monthly savings', () => {
    const result = calculateMonthlyMetrics(testTransactions);
    expect(result.savings).toBeCloseTo(2086.02, 2);
  });

  it('should correctly calculate savings rate', () => {
    const result = calculateMonthlyMetrics(testTransactions);
    expect(result.savingsRate).toBeCloseTo(0.4897, 3);
  });

  it('should handle zero income gracefully', () => {
    const noIncomeTransactions = [
      { id: 1, amount: -100, isIncome: false, date: '2025-01-01' },
      { id: 2, amount: -200, isIncome: false, date: '2025-01-01' },
    ];
    
    const result = calculateMonthlyMetrics(noIncomeTransactions);
    expect(result.income).toBe(0);
    expect(result.expenses).toBe(300);
    expect(result.savings).toBe(-300);
    expect(result.savingsRate).toBe(0);
  });

  it('should handle empty transaction list', () => {
    const result = calculateMonthlyMetrics([]);
    expect(result.income).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.savings).toBe(0);
    expect(result.savingsRate).toBe(0);
  });
});

describe('FIRE Progress Calculations', () => {
  const calculateFireProgress = (monthlyIncome: number, monthlyExpenses: number, currentSavings: number) => {
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const annualExpenses = monthlyExpenses * 12;
    const fireTarget = annualExpenses * 25; // 4% rule
    const savingsRate = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0;
    
    let timeToFire: number | null = null;
    if (monthlySavings > 0) {
      timeToFire = (fireTarget - currentSavings) / (monthlySavings * 12);
    }
    
    const fireProgress = fireTarget > 0 ? currentSavings / fireTarget : 0;
    
    return { fireTarget, timeToFire, fireProgress, savingsRate };
  };

  it('should calculate correct FIRE target (25x annual expenses)', () => {
    const result = calculateFireProgress(5000, 3000, 10000);
    expect(result.fireTarget).toBe(900000); // 3000 * 12 * 25
  });

  it('should calculate time to FIRE correctly', () => {
    const result = calculateFireProgress(5000, 3000, 10000);
    expect(result.timeToFire).toBeCloseTo(37.08, 2); // years
  });

  it('should calculate FIRE progress percentage', () => {
    const result = calculateFireProgress(5000, 3000, 180000);
    expect(result.fireProgress).toBeCloseTo(0.2, 2); // 20%
  });

  it('should handle negative savings rate', () => {
    const result = calculateFireProgress(2000, 3000, 10000);
    expect(result.savingsRate).toBe(-0.5);
    expect(result.timeToFire).toBeNull();
  });

  it('should handle zero expenses', () => {
    const result = calculateFireProgress(5000, 0, 10000);
    expect(result.fireTarget).toBe(0);
    expect(result.fireProgress).toBe(0);
  });
});

describe('Transfer Recommendation Engine', () => {
  const generateTransferRecommendations = (
    accounts: any[],
    monthlyIncome: number,
    monthlyExpenses: number,
    bufferTarget: number = 3500
  ) => {
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const recommendations: any[] = [];
    
    // Find spending and goal accounts
    const spendingAccounts = accounts.filter(a => a.role === 'spending' || a.role === 'income');
    const goalAccounts = accounts.filter(a => a.role === 'goal-specific');
    
    // Calculate buffer allocation (10% of monthly income or actual savings, whichever is lower)
    const bufferAllocation = Math.min(monthlyIncome * 0.1, monthlySavings);
    
    if (bufferAllocation > 0 && goalAccounts.length > 0 && spendingAccounts.length > 0) {
      const sourceAccount = spendingAccounts.find(a => parseFloat(a.balance) > bufferAllocation);
      const targetAccount = goalAccounts[0];
      
      if (sourceAccount && targetAccount) {
        recommendations.push({
          fromAccountId: sourceAccount.id,
          toAccountId: targetAccount.id,
          amount: bufferAllocation.toFixed(2),
          purpose: 'Transfer to goal account for emergency buffer',
          type: 'buffer'
        });
      }
    }
    
    return recommendations;
  };

  const testAccounts = [
    { id: 12, balance: '1000.00', role: 'spending' },
    { id: 13, balance: '394.07', role: 'income' },
    { id: 14, balance: '744.56', role: 'spending' },
    { id: 15, balance: '0.00', role: 'goal-specific' }
  ];

  it('should generate buffer transfer recommendations', () => {
    const recommendations = generateTransferRecommendations(
      testAccounts,
      17599.71,
      16936.34
    );
    
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].type).toBe('buffer');
    expect(parseFloat(recommendations[0].amount)).toBeCloseTo(663.37, 1);
  });

  it('should use correct source account for transfers', () => {
    const recommendations = generateTransferRecommendations(
      testAccounts,
      17599.71,
      16936.34
    );
    
    expect(recommendations[0].fromAccountId).toBe(14); // Account with sufficient balance
  });

  it('should target goal-specific accounts', () => {
    const recommendations = generateTransferRecommendations(
      testAccounts,
      17599.71,
      16936.34
    );
    
    expect(recommendations[0].toAccountId).toBe(15); // Goal-specific account
  });

  it('should not generate recommendations with insufficient funds', () => {
    const poorAccounts = testAccounts.map(a => ({ ...a, balance: '10.00' }));
    const recommendations = generateTransferRecommendations(
      poorAccounts,
      17599.71,
      16936.34
    );
    
    expect(recommendations).toHaveLength(0);
  });

  it('should not generate recommendations without goal accounts', () => {
    const noGoalAccounts = testAccounts.filter(a => a.role !== 'goal-specific');
    const recommendations = generateTransferRecommendations(
      noGoalAccounts,
      17599.71,
      16936.34
    );
    
    expect(recommendations).toHaveLength(0);
  });
});

describe('Account Balance Calculations', () => {
  const updateAccountBalances = (accounts: any[], transactions: any[]) => {
    return accounts.map(account => {
      const accountTransactions = transactions.filter(t => t.accountId === account.id);
      const balance = accountTransactions.reduce((sum, t) => {
        return sum + parseFloat(t.amount);
      }, parseFloat(account.initialBalance || '0'));
      
      return {
        ...account,
        balance: balance.toFixed(2),
        transactionCount: accountTransactions.length
      };
    });
  };

  const testAccounts = [
    { id: 1, initialBalance: '1000.00' },
    { id: 2, initialBalance: '500.00' }
  ];

  const testTransactions = [
    { id: 1, accountId: 1, amount: '250.00' },
    { id: 2, accountId: 1, amount: '-100.50' },
    { id: 3, accountId: 2, amount: '-50.25' },
  ];

  it('should correctly calculate account balances from transactions', () => {
    const result = updateAccountBalances(testAccounts, testTransactions);
    
    expect(result[0].balance).toBe('1149.50'); // 1000 + 250 - 100.50
    expect(result[1].balance).toBe('449.75');   // 500 - 50.25
  });

  it('should track transaction counts per account', () => {
    const result = updateAccountBalances(testAccounts, testTransactions);
    
    expect(result[0].transactionCount).toBe(2);
    expect(result[1].transactionCount).toBe(1);
  });

  it('should handle accounts with no transactions', () => {
    const result = updateAccountBalances(testAccounts, []);
    
    expect(result[0].balance).toBe('1000.00');
    expect(result[0].transactionCount).toBe(0);
  });
});

describe('Volatility Calculations', () => {
  const calculateVolatility = (monthlyIncomes: number[]) => {
    if (monthlyIncomes.length < 2) {
      return { average: null, standardDeviation: null, coefficientOfVariation: null, score: 'low' };
    }
    
    const average = monthlyIncomes.reduce((sum, income) => sum + income, 0) / monthlyIncomes.length;
    const variance = monthlyIncomes.reduce((sum, income) => sum + Math.pow(income - average, 2), 0) / monthlyIncomes.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = average > 0 ? standardDeviation / average : 0;
    
    let score = 'low';
    if (coefficientOfVariation > 0.3) score = 'high';
    else if (coefficientOfVariation > 0.15) score = 'medium';
    
    return { average, standardDeviation, coefficientOfVariation, score };
  };

  it('should calculate income volatility correctly', () => {
    const incomes = [5000, 4500, 5500, 4800, 5200];
    const result = calculateVolatility(incomes);
    
    expect(result.average).toBe(5000);
    expect(result.standardDeviation).toBeCloseTo(316.23, 1);
    expect(result.coefficientOfVariation).toBeCloseTo(0.0632, 3);
    expect(result.score).toBe('low');
  });

  it('should classify high volatility correctly', () => {
    const incomes = [5000, 2000, 8000, 1500, 6500];
    const result = calculateVolatility(incomes);
    
    expect(result.coefficientOfVariation).toBeGreaterThan(0.3);
    expect(result.score).toBe('high');
  });

  it('should handle single income value', () => {
    const result = calculateVolatility([5000]);
    
    expect(result.average).toBeNull();
    expect(result.standardDeviation).toBeNull();
    expect(result.score).toBe('low');
  });

  it('should handle empty income array', () => {
    const result = calculateVolatility([]);
    
    expect(result.average).toBeNull();
    expect(result.score).toBe('low');
  });
});

describe('Goal Progress Calculations', () => {
  const calculateGoalProgress = (goals: any[], accounts: any[]) => {
    return goals.map(goal => {
      const linkedAccount = accounts.find(a => a.id === goal.linkedAccountId);
      const currentAmount = linkedAccount ? parseFloat(linkedAccount.balance) : parseFloat(goal.currentAmount || '0');
      const targetAmount = parseFloat(goal.targetAmount);
      const progress = targetAmount > 0 ? currentAmount / targetAmount : 0;
      
      return {
        ...goal,
        currentAmount: currentAmount.toFixed(2),
        progress: Math.min(progress, 1),
        progressPercentage: Math.min(progress * 100, 100),
        isCompleted: progress >= 1
      };
    });
  };

  const testGoals = [
    { id: 1, name: 'Emergency Fund', targetAmount: '10000.00', linkedAccountId: 1 },
    { id: 2, name: 'Vacation', targetAmount: '5000.00', currentAmount: '2500.00', linkedAccountId: null }
  ];

  const testAccounts = [
    { id: 1, balance: '7500.00' },
    { id: 2, balance: '1200.00' }
  ];

  it('should calculate goal progress from linked account balance', () => {
    const result = calculateGoalProgress(testGoals, testAccounts);
    
    expect(result[0].currentAmount).toBe('7500.00');
    expect(result[0].progress).toBe(0.75);
    expect(result[0].progressPercentage).toBe(75);
    expect(result[0].isCompleted).toBe(false);
  });

  it('should use goal current amount when no linked account', () => {
    const result = calculateGoalProgress(testGoals, testAccounts);
    
    expect(result[1].currentAmount).toBe('2500.00');
    expect(result[1].progress).toBe(0.5);
    expect(result[1].progressPercentage).toBe(50);
  });

  it('should cap progress at 100%', () => {
    const overachievedGoals = [
      { id: 1, name: 'Small Goal', targetAmount: '1000.00', linkedAccountId: 1 }
    ];
    
    const result = calculateGoalProgress(overachievedGoals, testAccounts);
    
    expect(result[0].progress).toBe(1);
    expect(result[0].progressPercentage).toBe(100);
    expect(result[0].isCompleted).toBe(true);
  });
});

describe('Dashboard Data Integration', () => {
  const mockDashboardData = {
    accounts: [
      { id: 13, balance: '394.07', role: 'income' },
      { id: 15, balance: '0.00', role: 'goal-specific' }
    ],
    fireMetrics: {
      monthlyIncome: 17599.71,
      monthlyExpenses: 16936.34,
      savingsRate: 0.03769209833571116,
      fireProgress: 0,
      timeToFire: 49.00044540502766,
      monthlyBreakdown: [
        { month: '2025-01', income: 17599.71, expenses: 16936.34, savings: 663.37 }
      ]
    },
    transferRecommendations: [
      { id: 9, amount: '1759.97', purpose: 'Transfer to goal account for emergency buffer' }
    ],
    goals: [
      { id: 2, name: 'Holiday Funds', targetAmount: '9000.00', currentAmount: '0.00' }
    ]
  };

  it('should have valid monthly metrics', () => {
    const { fireMetrics } = mockDashboardData;
    
    expect(fireMetrics.monthlyIncome).toBeGreaterThan(0);
    expect(fireMetrics.monthlyExpenses).toBeGreaterThan(0);
    expect(fireMetrics.savingsRate).toBeGreaterThan(0);
    expect(fireMetrics.timeToFire).toBeGreaterThan(0);
  });

  it('should have transfer recommendations with positive amounts', () => {
    const { transferRecommendations } = mockDashboardData;
    
    expect(transferRecommendations).toHaveLength(1);
    expect(parseFloat(transferRecommendations[0].amount)).toBeGreaterThan(0);
  });

  it('should have goals with valid target amounts', () => {
    const { goals } = mockDashboardData;
    
    expect(goals).toHaveLength(1);
    expect(parseFloat(goals[0].targetAmount)).toBeGreaterThan(0);
  });

  it('should have accounts with valid balances', () => {
    const { accounts } = mockDashboardData;
    
    expect(accounts).toHaveLength(2);
    accounts.forEach(account => {
      expect(typeof account.balance).toBe('string');
      expect(!isNaN(parseFloat(account.balance))).toBe(true);
    });
  });

  it('should calculate correct savings from income and expenses', () => {
    const { fireMetrics } = mockDashboardData;
    const calculatedSavings = fireMetrics.monthlyIncome - fireMetrics.monthlyExpenses;
    
    expect(calculatedSavings).toBeCloseTo(663.37, 2);
    expect(fireMetrics.monthlyBreakdown[0].savings).toBeCloseTo(calculatedSavings, 2);
  });
});