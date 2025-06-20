import { Transaction, Account, Goal, Category } from "@shared/schema";
import { addMonths, format, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

export interface FixedExpensePattern {
  merchantName: string;
  categoryId?: number;
  categoryName?: string;
  averageAmount: number;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  predictedNextAmount: number;
  predictedNextDate: Date;
  confidence: number; // 0-1 score
  variability: number; // coefficient of variation
  lastSeen: Date;
  transactionCount: number;
}

export interface VasteLastenPrediction {
  monthlyRequirement: number;
  seasonalAdjustment: number;
  confidenceScore: number;
  upcomingExpenses: {
    date: Date;
    amount: number;
    merchant: string;
    type: 'fixed' | 'variable';
  }[];
  recommendedBufferAmount: number;
  transferTiming: {
    recommendedDate: Date;
    amount: number;
    reason: string;
  }[];
}

export interface FixedExpenseAnomaly {
  transactionId: number;
  merchantName: string;
  expectedAmount: number;
  actualAmount: number;
  deviation: number;
  anomalyType: 'amount_spike' | 'amount_drop' | 'timing_shift' | 'new_expense';
  severity: 'low' | 'medium' | 'high';
  date: Date;
}

export class FixedExpenseAnalyzer {
  private readonly FIXED_EXPENSE_KEYWORDS = [
    'rent', 'mortgage', 'insurance', 'utilities', 'electric', 'gas', 'water',
    'internet', 'phone', 'subscription', 'netflix', 'spotify', 'gym',
    'lease', 'loan', 'payment', 'monthly', 'annual'
  ];

  private readonly VARIABILITY_THRESHOLD = 0.15; // 15% coefficient of variation for fixed expenses
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly SEASONAL_FACTORS = {
    1: 1.2,  // January - higher utilities
    2: 1.15, // February
    3: 1.0,  // March
    4: 0.95, // April
    5: 0.9,  // May
    6: 0.85, // June
    7: 0.8,  // July
    8: 0.8,  // August
    9: 0.9,  // September
    10: 1.0, // October
    11: 1.1, // November
    12: 1.25 // December - higher expenses
  };

  /**
   * Analyzes transaction history to identify fixed expense patterns
   */
  analyzeFixedExpensePatterns(
    transactions: Transaction[],
    categories: Category[],
    lookbackMonths: number = 12
  ): FixedExpensePattern[] {
    const cutoffDate = addMonths(new Date(), -lookbackMonths);
    const relevantTransactions = transactions.filter(tx => 
      new Date(tx.date) >= cutoffDate && 
      parseFloat(tx.amount) < 0 && // Only expenses
      !tx.isIncome
    );

    // Group transactions by merchant/description pattern
    const merchantGroups = this.groupTransactionsByMerchant(relevantTransactions);
    const patterns: FixedExpensePattern[] = [];

    for (const [merchantKey, merchantTransactions] of Object.entries(merchantGroups)) {
      const pattern = this.analyzeTransactionPattern(merchantKey, merchantTransactions, categories);
      
      // Only include if it shows fixed expense characteristics
      if (pattern && this.isLikelyFixedExpense(pattern, merchantTransactions)) {
        patterns.push(pattern);
      }
    }

    return patterns.sort((a, b) => b.averageAmount - a.averageAmount);
  }

  /**
   * Predicts future Vaste Lasten requirements with seasonal adjustments
   */
  predictVasteLastenRequirements(
    transactions: Transaction[],
    categories: Category[],
    targetMonth?: Date
  ): VasteLastenPrediction {
    const patterns = this.analyzeFixedExpensePatterns(transactions, categories);
    const fixedPatterns = patterns.filter(p => p.confidence >= this.CONFIDENCE_THRESHOLD);

    const targetDate = targetMonth || addMonths(new Date(), 1);
    const targetMonthNumber = targetDate.getMonth() + 1;
    const seasonalFactor = this.SEASONAL_FACTORS[targetMonthNumber as keyof typeof this.SEASONAL_FACTORS] || 1.0;

    // Calculate base monthly requirement
    const monthlyFixedExpenses = fixedPatterns
      .filter(p => p.frequency === 'monthly')
      .reduce((sum, p) => sum + p.predictedNextAmount, 0);

    // Add quarterly and yearly expenses (prorated)
    const quarterlyExpenses = fixedPatterns
      .filter(p => p.frequency === 'quarterly')
      .reduce((sum, p) => sum + (p.predictedNextAmount / 3), 0);

    const yearlyExpenses = fixedPatterns
      .filter(p => p.frequency === 'yearly')
      .reduce((sum, p) => sum + (p.predictedNextAmount / 12), 0);

    const baseRequirement = monthlyFixedExpenses + quarterlyExpenses + yearlyExpenses;
    const seasonalAdjustment = baseRequirement * (seasonalFactor - 1);
    const totalRequirement = baseRequirement + seasonalAdjustment;

    // Generate upcoming expenses for the next 3 months
    const upcomingExpenses = this.generateUpcomingExpenses(fixedPatterns, 3);

    // Calculate recommended buffer (2-3 months of fixed expenses)
    const recommendedBuffer = totalRequirement * 2.5;

    // Generate transfer timing recommendations
    const transferTiming = this.generateTransferTiming(fixedPatterns, totalRequirement);

    return {
      monthlyRequirement: baseRequirement,
      seasonalAdjustment,
      confidenceScore: this.calculateOverallConfidence(fixedPatterns),
      upcomingExpenses,
      recommendedBufferAmount: recommendedBuffer,
      transferTiming
    };
  }

  /**
   * Detects anomalies in fixed expenses
   */
  detectFixedExpenseAnomalies(
    transactions: Transaction[],
    patterns: FixedExpensePattern[]
  ): FixedExpenseAnomaly[] {
    const anomalies: FixedExpenseAnomaly[] = [];
    const recentTransactions = transactions.filter(tx => 
      new Date(tx.date) >= addMonths(new Date(), -3) && 
      parseFloat(tx.amount) < 0
    );

    for (const transaction of recentTransactions) {
      const matchingPattern = this.findMatchingPattern(transaction, patterns);
      
      if (matchingPattern) {
        const anomaly = this.checkForAnomaly(transaction, matchingPattern);
        if (anomaly) {
          anomalies.push(anomaly);
        }
      } else if (this.isLikelyNewFixedExpense(transaction)) {
        // Detect new fixed expenses
        anomalies.push({
          transactionId: transaction.id,
          merchantName: transaction.merchant || transaction.description || 'Unknown',
          expectedAmount: 0,
          actualAmount: Math.abs(parseFloat(transaction.amount)),
          deviation: 1,
          anomalyType: 'new_expense',
          severity: 'medium',
          date: new Date(transaction.date)
        });
      }
    }

    return anomalies.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private groupTransactionsByMerchant(transactions: Transaction[]): Record<string, Transaction[]> {
    const groups: Record<string, Transaction[]> = {};

    for (const transaction of transactions) {
      const key = this.generateMerchantKey(transaction);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(transaction);
    }

    return groups;
  }

  private generateMerchantKey(transaction: Transaction): string {
    const merchant = (transaction.merchant || '').toLowerCase().trim();
    const description = (transaction.description || '').toLowerCase().trim();
    
    // Use merchant if available and meaningful
    if (merchant && merchant.length > 3) {
      return merchant;
    }

    // Extract meaningful words from description
    const words = description.split(/\s+/).filter(word => 
      word.length > 3 && 
      !['payment', 'purchase', 'transaction', 'debit', 'card'].includes(word)
    );

    return words[0] || description.substring(0, 20) || 'unknown';
  }

  private analyzeTransactionPattern(
    merchantKey: string,
    transactions: Transaction[],
    categories: Category[]
  ): FixedExpensePattern | null {
    if (transactions.length < 2) return null;

    const amounts = transactions.map(tx => Math.abs(parseFloat(tx.amount)));
    const dates = transactions.map(tx => new Date(tx.date)).sort();
    
    const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const standardDeviation = this.calculateStandardDeviation(amounts);
    const variability = standardDeviation / averageAmount;

    // Determine frequency based on transaction intervals
    const frequency = this.determineFrequency(dates);
    
    // Predict next occurrence
    const { predictedAmount, predictedDate, confidence } = this.predictNextOccurrence(
      amounts, dates, frequency
    );

    const lastTransaction = transactions[transactions.length - 1];
    const category = categories.find(c => c.id === lastTransaction.categoryId);

    return {
      merchantName: merchantKey,
      categoryId: category?.id,
      categoryName: category?.name,
      averageAmount,
      frequency,
      predictedNextAmount: predictedAmount,
      predictedNextDate: predictedDate,
      confidence,
      variability,
      lastSeen: dates[dates.length - 1],
      transactionCount: transactions.length
    };
  }

  private isLikelyFixedExpense(pattern: FixedExpensePattern, transactions: Transaction[]): boolean {
    // Check multiple criteria for fixed expense classification
    const hasLowVariability = pattern.variability <= this.VARIABILITY_THRESHOLD;
    const hasRegularFrequency = ['monthly', 'quarterly', 'yearly'].includes(pattern.frequency);
    const hasMinimumOccurrences = transactions.length >= 3;
    const hasKeywords = this.containsFixedExpenseKeywords(pattern.merchantName);
    const hasReasonableAmount = pattern.averageAmount >= 10; // Minimum €10

    // Score-based classification
    let score = 0;
    if (hasLowVariability) score += 3;
    if (hasRegularFrequency) score += 2;
    if (hasMinimumOccurrences) score += 2;
    if (hasKeywords) score += 2;
    if (hasReasonableAmount) score += 1;

    return score >= 5; // Threshold for fixed expense classification
  }

  private containsFixedExpenseKeywords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.FIXED_EXPENSE_KEYWORDS.some(keyword => lowerText.includes(keyword));
  }

  private determineFrequency(dates: Date[]): 'monthly' | 'quarterly' | 'yearly' | 'irregular' {
    if (dates.length < 2) return 'irregular';

    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = differenceInDays(dates[i], dates[i - 1]);
      intervals.push(daysDiff);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const intervalVariation = this.calculateStandardDeviation(intervals) / avgInterval;

    // Allow some flexibility in interval detection
    if (avgInterval >= 350 && avgInterval <= 380 && intervalVariation < 0.3) return 'yearly';
    if (avgInterval >= 80 && avgInterval <= 100 && intervalVariation < 0.3) return 'quarterly';
    if (avgInterval >= 25 && avgInterval <= 35 && intervalVariation < 0.3) return 'monthly';
    
    return 'irregular';
  }

  private predictNextOccurrence(
    amounts: number[],
    dates: Date[],
    frequency: string
  ): { predictedAmount: number; predictedDate: Date; confidence: number } {
    const lastDate = dates[dates.length - 1];
    const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    
    // Predict next date based on frequency
    let nextDate: Date;
    switch (frequency) {
      case 'monthly':
        nextDate = addMonths(lastDate, 1);
        break;
      case 'quarterly':
        nextDate = addMonths(lastDate, 3);
        break;
      case 'yearly':
        nextDate = addMonths(lastDate, 12);
        break;
      default:
        // For irregular, use average interval
        const intervals = dates.slice(1).map((date, i) => 
          differenceInDays(date, dates[i])
        );
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        nextDate = new Date(lastDate.getTime() + avgInterval * 24 * 60 * 60 * 1000);
    }

    // Calculate confidence based on data quality
    const amountVariability = this.calculateStandardDeviation(amounts) / averageAmount;
    const dataQuality = Math.min(amounts.length / 6, 1); // More data = higher confidence
    const consistencyScore = Math.max(0, 1 - amountVariability * 2);
    
    const confidence = (dataQuality + consistencyScore) / 2;

    return {
      predictedAmount: averageAmount,
      predictedDate: nextDate,
      confidence: Math.min(confidence, 1)
    };
  }

  private generateUpcomingExpenses(
    patterns: FixedExpensePattern[],
    monthsAhead: number
  ): { date: Date; amount: number; merchant: string; type: 'fixed' | 'variable' }[] {
    const upcoming: { date: Date; amount: number; merchant: string; type: 'fixed' | 'variable' }[] = [];
    const endDate = addMonths(new Date(), monthsAhead);

    for (const pattern of patterns) {
      if (pattern.confidence < this.CONFIDENCE_THRESHOLD) continue;

      let currentDate = new Date(pattern.predictedNextDate);
      
      while (currentDate <= endDate) {
        upcoming.push({
          date: new Date(currentDate),
          amount: pattern.predictedNextAmount,
          merchant: pattern.merchantName,
          type: (pattern.variability <= this.VARIABILITY_THRESHOLD ? 'fixed' : 'variable') as 'fixed' | 'variable'
        });

        // Move to next occurrence
        switch (pattern.frequency) {
          case 'monthly':
            currentDate = addMonths(currentDate, 1);
            break;
          case 'quarterly':
            currentDate = addMonths(currentDate, 3);
            break;
          case 'yearly':
            currentDate = addMonths(currentDate, 12);
            break;
          default:
            currentDate = endDate; // Stop for irregular patterns
        }
      }
    }

    return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private generateTransferTiming(
    patterns: FixedExpensePattern[],
    monthlyRequirement: number
  ): { recommendedDate: Date; amount: number; reason: string }[] {
    const recommendations = [];
    const today = new Date();

    // Monthly transfer for regular fixed expenses
    const nextMonth = addMonths(today, 1);
    const monthStart = startOfMonth(nextMonth);
    const transferDate = new Date(monthStart.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before month start

    recommendations.push({
      recommendedDate: transferDate,
      amount: monthlyRequirement,
      reason: 'Monthly fixed expenses funding'
    });

    // Special transfers for large upcoming expenses
    const upcomingLarge = patterns.filter(p => 
      p.predictedNextAmount > monthlyRequirement * 0.5 && // Large expense
      p.frequency !== 'monthly' &&
      p.predictedNextDate <= addMonths(today, 2)
    );

    for (const expense of upcomingLarge) {
      const earlyTransferDate = new Date(expense.predictedNextDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      recommendations.push({
        recommendedDate: earlyTransferDate,
        amount: expense.predictedNextAmount,
        reason: `Upcoming ${expense.frequency} expense: ${expense.merchantName}`
      });
    }

    return recommendations.sort((a, b) => a.recommendedDate.getTime() - b.recommendedDate.getTime());
  }

  private calculateOverallConfidence(patterns: FixedExpensePattern[]): number {
    if (patterns.length === 0) return 0;
    
    const weightedConfidence = patterns.reduce((sum, pattern) => 
      sum + (pattern.confidence * pattern.averageAmount), 0
    );
    const totalAmount = patterns.reduce((sum, pattern) => sum + pattern.averageAmount, 0);
    
    return weightedConfidence / totalAmount;
  }

  private findMatchingPattern(
    transaction: Transaction, 
    patterns: FixedExpensePattern[]
  ): FixedExpensePattern | null {
    const merchantKey = this.generateMerchantKey(transaction);
    return patterns.find(p => p.merchantName === merchantKey) || null;
  }

  private checkForAnomaly(
    transaction: Transaction,
    pattern: FixedExpensePattern
  ): FixedExpenseAnomaly | null {
    const actualAmount = Math.abs(parseFloat(transaction.amount));
    const expectedAmount = pattern.predictedNextAmount;
    const deviation = Math.abs(actualAmount - expectedAmount) / expectedAmount;

    if (deviation <= 0.2) return null; // Within 20% is normal

    let severity: 'low' | 'medium' | 'high' = 'low';
    if (deviation > 0.5) severity = 'high';
    else if (deviation > 0.3) severity = 'medium';

    const anomalyType = actualAmount > expectedAmount ? 'amount_spike' : 'amount_drop';

    return {
      transactionId: transaction.id,
      merchantName: pattern.merchantName,
      expectedAmount,
      actualAmount,
      deviation,
      anomalyType,
      severity,
      date: new Date(transaction.date)
    };
  }

  private isLikelyNewFixedExpense(transaction: Transaction): boolean {
    const amount = Math.abs(parseFloat(transaction.amount));
    const merchantKey = this.generateMerchantKey(transaction);
    
    return amount >= 50 && // Minimum amount for significance
           this.containsFixedExpenseKeywords(merchantKey);
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
    return Math.sqrt(avgSquaredDiff);
  }
}