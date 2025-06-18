import { Transaction, Goal, Account } from '@shared/schema';

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

export interface AllocationRecommendation {
  pocketMoney: number;
  essentialExpenses: number;
  bufferAllocation: number;
  excessForGoals: number;
  goalAllocations: { goalId: number; amount: number }[];
}

export class FireCalculator {
  private readonly POCKET_MONEY_PER_ADULT = 150; // €150 per adult
  private readonly BUFFER_MIN = 3000; // €3,000
  private readonly BUFFER_MAX = 4000; // €4,000
  private readonly FIRE_TARGET_MULTIPLE = 25; // 25x annual expenses

  calculateMetrics(
    transactions: Transaction[],
    goals: Goal[],
    accounts: Account[],
    numberOfAdults: number = 2
  ): FireMetrics {
    // Calculate 6-month income volatility
    const last6Months = this.getLast6MonthsData(transactions);
    const monthlyIncomes = this.calculateMonthlyIncomes(last6Months);
    const monthlyExpenses = this.calculateMonthlyExpenses(last6Months);
    
    const avgIncome = monthlyIncomes.reduce((sum, income) => sum + income, 0) / monthlyIncomes.length;
    const avgExpenses = monthlyExpenses.reduce((sum, exp) => sum + exp, 0) / monthlyExpenses.length;
    
    const incomeStdDev = this.calculateStandardDeviation(monthlyIncomes);
    const coefficientOfVariation = incomeStdDev / avgIncome;
    
    let volatilityScore: 'low' | 'medium' | 'high' = 'low';
    if (coefficientOfVariation > 0.2) volatilityScore = 'high';
    else if (coefficientOfVariation > 0.1) volatilityScore = 'medium';

    // Calculate current buffer
    const emergencyFundGoal = goals.find(g => g.name.toLowerCase().includes('emergency'));
    const currentBuffer = emergencyFundGoal ? parseFloat(emergencyFundGoal.currentAmount) : 0;
    
    let bufferStatus: 'below' | 'optimal' | 'above' = 'optimal';
    if (currentBuffer < this.BUFFER_MIN) bufferStatus = 'below';
    else if (currentBuffer > this.BUFFER_MAX) bufferStatus = 'above';

    // Calculate FIRE progress
    const annualExpenses = avgExpenses * 12;
    const fireTarget = annualExpenses * this.FIRE_TARGET_MULTIPLE;
    const totalSavings = goals.reduce((sum, goal) => sum + parseFloat(goal.currentAmount), 0);
    const fireProgress = Math.min(totalSavings / fireTarget, 1);

    // Calculate time to FIRE
    const savingsRate = (avgIncome - avgExpenses) / avgIncome;
    const timeToFire = this.calculateTimeToFire(savingsRate, fireProgress);

    // Generate monthly breakdown
    const monthlyBreakdown = this.generateMonthlyBreakdown(last6Months);
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM format

    return {
      monthlyIncome: avgIncome || 0,
      monthlyExpenses: avgExpenses || 0,
      savingsRate: isNaN(savingsRate) ? 0 : savingsRate,
      fireProgress,
      timeToFire,
      currentMonth,
      monthlyBreakdown,
      bufferStatus: {
        current: currentBuffer,
        target: (this.BUFFER_MIN + this.BUFFER_MAX) / 2,
        status: bufferStatus,
      },
      volatility: {
        average: avgIncome,
        standardDeviation: incomeStdDev,
        coefficientOfVariation,
        score: volatilityScore,
      },
    };
  }

  calculateAllocationRecommendation(
    monthlyIncome: number,
    monthlyExpenses: number,
    currentBuffer: number,
    goals: Goal[],
    numberOfAdults: number = 2
  ): AllocationRecommendation {
    const totalPocketMoney = this.POCKET_MONEY_PER_ADULT * numberOfAdults;
    
    // Calculate buffer need
    const bufferTarget = (this.BUFFER_MIN + this.BUFFER_MAX) / 2;
    const bufferNeed = Math.max(0, bufferTarget - currentBuffer);
    const bufferAllocation = Math.min(bufferNeed, monthlyIncome * 0.1); // Max 10% to buffer
    
    // Calculate excess after fixed costs
    const excess = monthlyIncome - monthlyExpenses - totalPocketMoney - bufferAllocation;
    
    if (excess <= 0) {
      return {
        pocketMoney: totalPocketMoney,
        essentialExpenses: monthlyExpenses,
        bufferAllocation,
        excessForGoals: 0,
        goalAllocations: [],
      };
    }

    // Allocate excess to goals based on priority and target dates
    const activeGoals = goals.filter(g => !g.isCompleted);
    const goalAllocations = this.allocateToGoals(excess, activeGoals);

    return {
      pocketMoney: totalPocketMoney,
      essentialExpenses: monthlyExpenses,
      bufferAllocation,
      excessForGoals: excess,
      goalAllocations,
    };
  }

  private getLast6MonthsData(transactions: Transaction[]): Transaction[] {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return transactions.filter(tx => new Date(tx.date) >= sixMonthsAgo);
  }

  private calculateMonthlyIncomes(transactions: Transaction[]): number[] {
    const monthlyData = new Map<string, number>();
    
    transactions
      .filter(tx => tx.isIncome)
      .forEach(tx => {
        const monthKey = new Date(tx.date).toISOString().substring(0, 7); // YYYY-MM
        const current = monthlyData.get(monthKey) || 0;
        monthlyData.set(monthKey, current + Math.abs(parseFloat(tx.amount)));
      });
    
    return Array.from(monthlyData.values());
  }

  private calculateMonthlyExpenses(transactions: Transaction[]): number[] {
    const monthlyData = new Map<string, number>();
    
    transactions
      .filter(tx => !tx.isIncome && parseFloat(tx.amount) < 0)
      .forEach(tx => {
        const monthKey = new Date(tx.date).toISOString().substring(0, 7); // YYYY-MM
        const current = monthlyData.get(monthKey) || 0;
        monthlyData.set(monthKey, current + Math.abs(parseFloat(tx.amount)));
      });
    
    return Array.from(monthlyData.values());
  }

  private generateMonthlyBreakdown(transactions: Transaction[]): { month: string; income: number; expenses: number; savings: number; }[] {
    const monthlyData = new Map<string, { income: number; expenses: number; }>();
    
    transactions.forEach(tx => {
      const monthKey = new Date(tx.date).toISOString().substring(0, 7); // YYYY-MM
      const current = monthlyData.get(monthKey) || { income: 0, expenses: 0 };
      
      if (tx.isIncome) {
        current.income += Math.abs(parseFloat(tx.amount));
      } else {
        current.expenses += Math.abs(parseFloat(tx.amount));
      }
      
      monthlyData.set(monthKey, current);
    });
    
    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        income: data.income,
        expenses: data.expenses,
        savings: data.income - data.expenses,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
    return Math.sqrt(avgSquaredDiff);
  }

  private calculateTimeToFire(savingsRate: number, currentProgress: number): number {
    if (savingsRate <= 0) return Infinity;
    
    // Simplified FIRE calculation using 4% rule
    const yearsToFire = Math.log(1 + (1 - currentProgress) * this.FIRE_TARGET_MULTIPLE * 0.04 / savingsRate) / Math.log(1.07); // Assuming 7% returns
    return Math.max(0, yearsToFire);
  }

  private allocateToGoals(excessAmount: number, goals: Goal[]): { goalId: number; amount: number }[] {
    const allocations: { goalId: number; amount: number }[] = [];
    let remainingAmount = excessAmount;

    // Sort goals by priority and urgency
    const sortedGoals = goals.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      
      // If same priority, prioritize by target date
      if (a.targetDate && b.targetDate) {
        return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
      }
      
      return 0;
    });

    // Allocate proportionally based on remaining target amounts
    const goalDeficits = sortedGoals.map(goal => ({
      goalId: goal.id,
      deficit: Math.max(0, parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount)),
    })).filter(g => g.deficit > 0);

    const totalDeficit = goalDeficits.reduce((sum, g) => sum + g.deficit, 0);

    if (totalDeficit > 0) {
      for (const goal of goalDeficits) {
        const proportion = goal.deficit / totalDeficit;
        const allocation = Math.min(remainingAmount * proportion, goal.deficit);
        
        if (allocation > 0) {
          allocations.push({
            goalId: goal.goalId,
            amount: Math.round(allocation * 100) / 100, // Round to cents
          });
          remainingAmount -= allocation;
        }
      }
    }

    return allocations;
  }
}
