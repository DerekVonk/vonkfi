import { Transaction, Account, Goal, TransferRecommendation, TransferPreference } from "@shared/schema";
import { FixedExpenseAnalyzer, VasteLastenPrediction, FixedExpensePattern } from "./fixedExpenseAnalyzer";
import { addMonths, startOfMonth, endOfMonth, format, differenceInDays } from "date-fns";

export interface IntelligentTransferRecommendation {
  id?: number;
  userId: number;
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'weekly' | 'monthly';
  type: 'vaste_lasten' | 'emergency_buffer' | 'goal_funding' | 'optimization';
  confidence: number;
  expectedImpact: {
    savingsRate: number;
    riskReduction: number;
    opportunityCost: number;
  };
  timing: {
    recommendedDate: Date;
    deadline?: Date;
    recurring?: 'monthly' | 'quarterly' | 'yearly';
  };
  metadata: {
    fixedExpensesCovered?: string[];
    goalContribution?: number;
    bufferOptimization?: boolean;
  };
}

export interface CashFlowOptimization {
  currentLiquidity: number;
  optimalLiquidity: number;
  excessCash: number;
  liquidityGap: number;
  recommendations: {
    action: 'transfer_to_savings' | 'build_buffer' | 'fund_goals' | 'maintain_current';
    amount: number;
    reason: string;
    timeframe: string;
  }[];
}

export interface AccountOptimization {
  accountId: number;
  accountName: string;
  currentBalance: number;
  optimalBalance: number;
  efficiency: number; // 0-1 score
  recommendations: string[];
}

export class IntelligentTransferOptimizer {
  private fixedExpenseAnalyzer: FixedExpenseAnalyzer;
  
  constructor() {
    this.fixedExpenseAnalyzer = new FixedExpenseAnalyzer();
  }

  /**
   * Generates intelligent transfer recommendations with AI-enhanced prioritization
   */
  async generateIntelligentRecommendations(
    userId: number,
    transactions: Transaction[],
    accounts: Account[],
    goals: Goal[],
    preferences: TransferPreference[],
    categories: any[]
  ): Promise<IntelligentTransferRecommendation[]> {
    const recommendations: IntelligentTransferRecommendation[] = [];

    // Analyze fixed expense patterns for Vaste Lasten optimization
    const vasteLastenPrediction = this.fixedExpenseAnalyzer.predictVasteLastenRequirements(
      transactions, categories
    );

    // Find the Vaste Lasten account
    const vasteLastenAccount = accounts.find(acc => 
      acc.role === 'vaste_lasten' || 
      acc.customName?.toLowerCase().includes('vaste lasten') ||
      acc.accountHolderName?.toLowerCase().includes('vaste lasten')
    );

    // Generate Vaste Lasten funding recommendations
    if (vasteLastenAccount) {
      const vasteLastenRecs = await this.generateVasteLastenRecommendations(
        userId, vasteLastenAccount, vasteLastenPrediction, accounts
      );
      recommendations.push(...vasteLastenRecs);
    }

    // Generate buffer optimization recommendations
    const bufferRecs = await this.generateBufferOptimizationRecommendations(
      userId, accounts, goals, transactions
    );
    recommendations.push(...bufferRecs);

    // Generate goal funding recommendations with AI prioritization
    const goalRecs = await this.generateAIEnhancedGoalRecommendations(
      userId, accounts, goals, transactions, preferences
    );
    recommendations.push(...goalRecs);

    // Generate liquidity optimization recommendations
    const liquidityRecs = await this.generateLiquidityOptimizationRecommendations(
      userId, accounts, transactions
    );
    recommendations.push(...liquidityRecs);

    // Apply intelligent prioritization
    return this.prioritizeRecommendations(recommendations, preferences);
  }

  /**
   * Generates AI-enhanced Vaste Lasten funding recommendations
   */
  private async generateVasteLastenRecommendations(
    userId: number,
    vasteLastenAccount: Account,
    prediction: VasteLastenPrediction,
    accounts: Account[]
  ): Promise<IntelligentTransferRecommendation[]> {
    const recommendations: IntelligentTransferRecommendation[] = [];
    const currentBalance = parseFloat(vasteLastenAccount.balance || '0');
    const checkingAccount = accounts.find(acc => acc.role === 'checking');

    if (!checkingAccount) return recommendations;

    // Monthly funding recommendation
    const monthlyShortfall = prediction.monthlyRequirement - currentBalance;
    if (monthlyShortfall > 0) {
      recommendations.push({
        userId,
        fromAccountId: checkingAccount.id,
        toAccountId: vasteLastenAccount.id,
        amount: monthlyShortfall.toFixed(2),
        reason: `Fund Vaste Lasten for monthly fixed expenses (€${prediction.monthlyRequirement.toFixed(2)} required)`,
        priority: 'high',
        urgency: 'weekly',
        type: 'vaste_lasten',
        confidence: prediction.confidenceScore,
        expectedImpact: {
          savingsRate: 0.02, // Improves cash flow management
          riskReduction: 0.8, // High risk reduction for fixed expenses
          opportunityCost: 0.01 // Low opportunity cost
        },
        timing: {
          recommendedDate: new Date(),
          deadline: startOfMonth(addMonths(new Date(), 1)),
          recurring: 'monthly'
        },
        metadata: {
          fixedExpensesCovered: prediction.upcomingExpenses.map(exp => exp.merchant),
          bufferOptimization: true
        }
      });
    }

    // Seasonal adjustment recommendation
    if (Math.abs(prediction.seasonalAdjustment) > 50) {
      const adjustmentAmount = Math.abs(prediction.seasonalAdjustment);
      const isIncrease = prediction.seasonalAdjustment > 0;
      
      recommendations.push({
        userId,
        fromAccountId: checkingAccount.id,
        toAccountId: vasteLastenAccount.id,
        amount: adjustmentAmount.toFixed(2),
        reason: `Seasonal adjustment for ${isIncrease ? 'higher' : 'lower'} winter expenses`,
        priority: 'medium',
        urgency: 'monthly',
        type: 'vaste_lasten',
        confidence: prediction.confidenceScore * 0.8,
        expectedImpact: {
          savingsRate: 0.01,
          riskReduction: 0.6,
          opportunityCost: 0.02
        },
        timing: {
          recommendedDate: addMonths(new Date(), 1),
          recurring: 'yearly'
        },
        metadata: {
          bufferOptimization: true
        }
      });
    }

    // Buffer optimization recommendation
    const bufferGap = prediction.recommendedBufferAmount - currentBalance;
    if (bufferGap > 100) { // Only recommend if gap is significant
      recommendations.push({
        userId,
        fromAccountId: checkingAccount.id,
        toAccountId: vasteLastenAccount.id,
        amount: Math.min(bufferGap, 500).toFixed(2), // Max €500 per transfer
        reason: `Build Vaste Lasten buffer to recommended level (€${prediction.recommendedBufferAmount.toFixed(2)})`,
        priority: 'medium',
        urgency: 'monthly',
        type: 'emergency_buffer',
        confidence: 0.9,
        expectedImpact: {
          savingsRate: 0.005,
          riskReduction: 0.7,
          opportunityCost: 0.02
        },
        timing: {
          recommendedDate: addMonths(new Date(), 1),
          recurring: 'monthly'
        },
        metadata: {
          bufferOptimization: true
        }
      });
    }

    return recommendations;
  }

  /**
   * Generates buffer optimization recommendations across all accounts
   */
  private async generateBufferOptimizationRecommendations(
    userId: number,
    accounts: Account[],
    goals: Goal[],
    transactions: Transaction[]
  ): Promise<IntelligentTransferRecommendation[]> {
    const recommendations: IntelligentTransferRecommendation[] = [];
    const emergencyFund = goals.find(g => g.name.toLowerCase().includes('emergency'));
    const checkingAccount = accounts.find(acc => acc.role === 'checking');
    
    if (!emergencyFund || !checkingAccount) return recommendations;

    const currentEmergency = parseFloat(emergencyFund.currentAmount || '0');
    const targetEmergency = parseFloat(emergencyFund.targetAmount || '0');
    const emergencyGap = targetEmergency - currentEmergency;

    // Calculate monthly expenses for emergency fund sizing
    const recentTransactions = transactions.filter(tx => 
      new Date(tx.date) >= addMonths(new Date(), -3) && 
      parseFloat(tx.amount) < 0
    );
    const monthlyExpenses = Math.abs(
      recentTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) / 3
    );

    // Recommend emergency fund building if below 3 months of expenses
    if (currentEmergency < monthlyExpenses * 3 && emergencyGap > 100) {
      const recommendedAmount = Math.min(emergencyGap, monthlyExpenses * 0.5);
      
      recommendations.push({
        userId,
        fromAccountId: checkingAccount.id,
        toAccountId: emergencyFund.linkedAccountId || checkingAccount.id,
        amount: recommendedAmount.toFixed(2),
        reason: `Build emergency fund to 3 months of expenses (€${(monthlyExpenses * 3).toFixed(2)})`,
        priority: 'high',
        urgency: 'monthly',
        type: 'emergency_buffer',
        confidence: 0.95,
        expectedImpact: {
          savingsRate: 0.03,
          riskReduction: 0.9,
          opportunityCost: 0.01
        },
        timing: {
          recommendedDate: new Date(),
          recurring: 'monthly'
        },
        metadata: {
          goalContribution: recommendedAmount
        }
      });
    }

    return recommendations;
  }

  /**
   * Generates AI-enhanced goal funding recommendations
   */
  private async generateAIEnhancedGoalRecommendations(
    userId: number,
    accounts: Account[],
    goals: Goal[],
    transactions: Transaction[],
    preferences: TransferPreference[]
  ): Promise<IntelligentTransferRecommendation[]> {
    const recommendations: IntelligentTransferRecommendation[] = [];
    const checkingAccount = accounts.find(acc => acc.role === 'checking');
    
    if (!checkingAccount) return recommendations;

    // Calculate available funds for goal funding
    const checkingBalance = parseFloat(checkingAccount.balance || '0');
    const reserveAmount = 1000; // Keep minimum in checking
    const availableForGoals = Math.max(0, checkingBalance - reserveAmount);

    // Analyze goal priority based on AI scoring
    const scoredGoals = goals
      .filter(goal => {
        const current = parseFloat(goal.currentAmount || '0');
        const target = parseFloat(goal.targetAmount || '0');
        return current < target; // Only incomplete goals
      })
      .map(goal => ({
        goal,
        priority: this.calculateGoalPriority(goal, transactions, preferences),
        gap: parseFloat(goal.targetAmount || '0') - parseFloat(goal.currentAmount || '0')
      }))
      .sort((a, b) => b.priority - a.priority);

    // Generate recommendations for top priority goals
    let remainingFunds = availableForGoals;
    for (const { goal, priority, gap } of scoredGoals.slice(0, 3)) {
      if (remainingFunds <= 100) break; // Stop if insufficient funds

      const recommendedAmount = Math.min(gap, remainingFunds * 0.3, 1000); // Max 30% of available or €1000
      
      if (recommendedAmount >= 50) { // Minimum €50 transfer
        recommendations.push({
          userId,
          fromAccountId: checkingAccount.id,
          toAccountId: goal.linkedAccountId || checkingAccount.id,
          amount: recommendedAmount.toFixed(2),
          reason: `Contribute to ${goal.name} goal (${((parseFloat(goal.currentAmount || '0') + recommendedAmount) / parseFloat(goal.targetAmount || '1') * 100).toFixed(1)}% complete)`,
          priority: priority > 0.8 ? 'high' : priority > 0.5 ? 'medium' : 'low',
          urgency: 'monthly',
          type: 'goal_funding',
          confidence: 0.85,
          expectedImpact: {
            savingsRate: 0.02,
            riskReduction: 0.3,
            opportunityCost: 0.03
          },
          timing: {
            recommendedDate: new Date(),
            recurring: 'monthly'
          },
          metadata: {
            goalContribution: recommendedAmount
          }
        });

        remainingFunds -= recommendedAmount;
      }
    }

    return recommendations;
  }

  /**
   * Generates liquidity optimization recommendations
   */
  private async generateLiquidityOptimizationRecommendations(
    userId: number,
    accounts: Account[],
    transactions: Transaction[]
  ): Promise<IntelligentTransferRecommendation[]> {
    const recommendations: IntelligentTransferRecommendation[] = [];
    const checkingAccount = accounts.find(acc => acc.role === 'checking');
    const savingsAccount = accounts.find(acc => acc.role === 'savings');
    
    if (!checkingAccount || !savingsAccount) return recommendations;

    const checkingBalance = parseFloat(checkingAccount.balance || '0');
    const savingsBalance = parseFloat(savingsAccount.balance || '0');

    // Calculate optimal checking balance based on spending patterns
    const monthlySpending = this.calculateMonthlySpending(transactions);
    const optimalChecking = monthlySpending * 1.5; // 1.5 months of spending
    const excessChecking = checkingBalance - optimalChecking;

    // Recommend moving excess to savings
    if (excessChecking > 200) {
      recommendations.push({
        userId,
        fromAccountId: checkingAccount.id,
        toAccountId: savingsAccount.id,
        amount: (excessChecking * 0.8).toFixed(2), // Move 80% of excess
        reason: `Optimize liquidity: move excess checking funds to savings`,
        priority: 'low',
        urgency: 'monthly',
        type: 'optimization',
        confidence: 0.9,
        expectedImpact: {
          savingsRate: 0.005,
          riskReduction: 0.1,
          opportunityCost: -0.02 // Positive impact by earning more interest
        },
        timing: {
          recommendedDate: addMonths(new Date(), 1),
        },
        metadata: {}
      });
    }

    // Recommend building checking if too low
    if (checkingBalance < optimalChecking * 0.7 && savingsBalance > 1000) {
      const transferAmount = Math.min(optimalChecking - checkingBalance, savingsBalance * 0.3);
      
      recommendations.push({
        userId,
        fromAccountId: savingsAccount.id,
        toAccountId: checkingAccount.id,
        amount: transferAmount.toFixed(2),
        reason: `Build checking account to optimal level for monthly expenses`,
        priority: 'medium',
        urgency: 'weekly',
        type: 'optimization',
        confidence: 0.85,
        expectedImpact: {
          savingsRate: -0.002,
          riskReduction: 0.4,
          opportunityCost: 0.01
        },
        timing: {
          recommendedDate: new Date(),
        },
        metadata: {}
      });
    }

    return recommendations;
  }

  /**
   * Applies intelligent prioritization to recommendations
   */
  private prioritizeRecommendations(
    recommendations: IntelligentTransferRecommendation[],
    preferences: TransferPreference[]
  ): IntelligentTransferRecommendation[] {
    return recommendations
      .map(rec => ({
        ...rec,
        score: this.calculateRecommendationScore(rec, preferences)
      }))
      .sort((a, b) => {
        // Primary sort: by urgency
        const urgencyOrder = { immediate: 3, weekly: 2, monthly: 1 };
        const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        
        // Secondary sort: by priority
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Tertiary sort: by calculated score
        return (b as any).score - (a as any).score;
      })
      .map(({ score, ...rec }) => rec); // Remove score from final output
  }

  /**
   * Calculates AI-based goal priority score
   */
  private calculateGoalPriority(
    goal: Goal,
    transactions: Transaction[],
    preferences: TransferPreference[]
  ): number {
    let score = 0;

    // Target date urgency
    if (goal.targetDate) {
      const daysToTarget = differenceInDays(new Date(goal.targetDate), new Date());
      if (daysToTarget <= 365) score += 0.3; // Within 1 year
      if (daysToTarget <= 180) score += 0.2; // Within 6 months
    }

    // Progress-based scoring
    const progress = parseFloat(goal.currentAmount || '0') / parseFloat(goal.targetAmount || '1');
    if (progress > 0.8) score += 0.2; // Close to completion
    if (progress > 0.5) score += 0.1; // Halfway there

    // Goal type priority (inferred from name)
    const goalName = goal.name.toLowerCase();
    if (goalName.includes('emergency')) score += 0.4;
    if (goalName.includes('house') || goalName.includes('home')) score += 0.3;
    if (goalName.includes('retirement') || goalName.includes('pension')) score += 0.2;
    if (goalName.includes('vacation') || goalName.includes('holiday')) score += 0.1;

    // User preference alignment
    const matchingPreference = preferences.find(pref => 
      pref.goalPattern && new RegExp(pref.goalPattern, 'i').test(goal.name)
    );
    if (matchingPreference) {
      score += (5 - (matchingPreference.priority || 5)) * 0.1; // Higher priority = lower number
    }

    return Math.min(score, 1); // Cap at 1.0
  }

  /**
   * Calculates recommendation score for prioritization
   */
  private calculateRecommendationScore(
    recommendation: IntelligentTransferRecommendation,
    preferences: TransferPreference[]
  ): number {
    let score = 0;

    // Impact-based scoring
    score += recommendation.expectedImpact.savingsRate * 10;
    score += recommendation.expectedImpact.riskReduction * 5;
    score -= recommendation.expectedImpact.opportunityCost * 3;

    // Confidence weight
    score *= recommendation.confidence;

    // Type-based scoring
    const typeScores = {
      vaste_lasten: 10,
      emergency_buffer: 8,
      goal_funding: 6,
      optimization: 4
    };
    score += typeScores[recommendation.type] || 0;

    // Amount-based scoring (larger amounts get slightly higher scores)
    const amount = parseFloat(recommendation.amount);
    score += Math.min(amount / 1000, 2); // Max 2 points for amount

    return score;
  }

  /**
   * Calculates average monthly spending from recent transactions
   */
  private calculateMonthlySpending(transactions: Transaction[]): number {
    const recentTransactions = transactions.filter(tx => 
      new Date(tx.date) >= addMonths(new Date(), -3) && 
      parseFloat(tx.amount) < 0 && 
      !tx.isIncome
    );

    const totalSpending = Math.abs(
      recentTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
    );

    return totalSpending / 3; // Average over 3 months
  }

  /**
   * Optimizes cash flow across all accounts
   */
  async optimizeCashFlow(
    accounts: Account[],
    transactions: Transaction[],
    goals: Goal[]
  ): Promise<CashFlowOptimization> {
    const checkingAccount = accounts.find(acc => acc.role === 'checking');
    const currentLiquidity = checkingAccount ? parseFloat(checkingAccount.balance || '0') : 0;
    
    const monthlySpending = this.calculateMonthlySpending(transactions);
    const optimalLiquidity = monthlySpending * 1.5;
    
    const excessCash = Math.max(0, currentLiquidity - optimalLiquidity);
    const liquidityGap = Math.max(0, optimalLiquidity - currentLiquidity);

    const recommendations = [];

    if (excessCash > 200) {
      recommendations.push({
        action: 'transfer_to_savings' as const,
        amount: excessCash * 0.8,
        reason: 'Move excess liquidity to savings for better returns',
        timeframe: 'This month'
      });
    } else if (liquidityGap > 200) {
      recommendations.push({
        action: 'build_buffer' as const,
        amount: liquidityGap,
        reason: 'Build checking account buffer for monthly expenses',
        timeframe: 'Next 2 weeks'
      });
    } else {
      recommendations.push({
        action: 'maintain_current' as const,
        amount: 0,
        reason: 'Liquidity levels are optimal',
        timeframe: 'Continue monitoring'
      });
    }

    return {
      currentLiquidity,
      optimalLiquidity,
      excessCash,
      liquidityGap,
      recommendations
    };
  }
}