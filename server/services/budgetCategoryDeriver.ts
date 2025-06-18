import { Transaction, Category } from "@shared/schema";

export interface DerivedBudgetCategory {
  name: string;
  totalAmount: number;
  transactionCount: number;
  priority: number; // 1=Need, 2=Want, 3=Save
  isFixed: boolean;
  categoryId?: number;
  merchants: string[];
  averageTransaction: number;
}

export class BudgetCategoryDeriver {
  private essentialKeywords = [
    'rent', 'mortgage', 'insurance', 'utilities', 'electric', 'gas', 'water',
    'internet', 'phone', 'grocery', 'supermarket', 'medication', 'doctor',
    'hospital', 'fuel', 'petrol', 'transportation', 'public transport'
  ];

  private savingsKeywords = [
    'investment', 'savings', 'pension', 'retirement', 'deposit', 'transfer'
  ];

  deriveBudgetCategories(
    transactions: Transaction[], 
    categories: Category[],
    startDate: Date,
    endDate: Date
  ): DerivedBudgetCategory[] {
    // Filter transactions for the specified period and exclude income
    const periodTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate >= startDate && 
             transactionDate <= endDate && 
             parseFloat(t.amount) < 0; // Only expenses
    });

    // Group transactions by merchant and description patterns
    const merchantGroups = this.groupTransactionsByMerchant(periodTransactions);
    const derivedCategories: DerivedBudgetCategory[] = [];

    for (const [merchantPattern, merchantTransactions] of Object.entries(merchantGroups)) {
      const totalAmount = Math.abs(merchantTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0));
      const transactionCount = merchantTransactions.length;
      const averageTransaction = totalAmount / transactionCount;

      // Determine priority based on merchant/description analysis
      const priority = this.determinePriority(merchantPattern, merchantTransactions);
      
      // Check if it's a fixed expense (regular monthly amount)
      const isFixed = this.isFixedExpense(merchantTransactions);

      // Try to match with existing categories
      const matchedCategory = this.matchWithExistingCategory(merchantPattern, categories);

      const derivedCategory: DerivedBudgetCategory = {
        name: this.generateCategoryName(merchantPattern, matchedCategory),
        totalAmount,
        transactionCount,
        priority,
        isFixed,
        categoryId: matchedCategory?.id,
        merchants: [...new Set(merchantTransactions.map(t => t.merchant || '').filter(Boolean))],
        averageTransaction
      };

      derivedCategories.push(derivedCategory);
    }

    // Merge similar categories and sort by total amount
    return this.mergeSimilarCategories(derivedCategories)
      .sort((a, b) => b.totalAmount - a.totalAmount);
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
    const merchant = transaction.merchant?.toLowerCase() || '';
    const description = transaction.description?.toLowerCase() || '';
    
    // Use merchant if available, otherwise use first meaningful word from description
    if (merchant) {
      return merchant;
    }

    // Extract meaningful words from description
    const words = description.split(/\s+/).filter(word => 
      word.length > 3 && 
      !['payment', 'purchase', 'transaction', 'debit'].includes(word)
    );

    return words[0] || 'miscellaneous';
  }

  private determinePriority(merchantPattern: string, transactions: Transaction[]): number {
    const text = merchantPattern.toLowerCase();
    const descriptions = transactions.map(t => t.description?.toLowerCase() || '').join(' ');
    
    // Check for essential expenses (Need = 1)
    if (this.essentialKeywords.some(keyword => 
      text.includes(keyword) || descriptions.includes(keyword)
    )) {
      return 1;
    }

    // Check for savings/investments (Save = 3)
    if (this.savingsKeywords.some(keyword => 
      text.includes(keyword) || descriptions.includes(keyword)
    )) {
      return 3;
    }

    // Default to discretionary spending (Want = 2)
    return 2;
  }

  private isFixedExpense(transactions: Transaction[]): boolean {
    if (transactions.length < 2) return false;

    // Check if amounts are similar (within 10% variance)
    const amounts = transactions.map(t => Math.abs(parseFloat(t.amount)));
    const average = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const variance = amounts.every(amt => Math.abs(amt - average) / average < 0.1);

    // Check if transactions occur regularly (monthly pattern)
    const dates = transactions.map(t => new Date(t.date)).sort();
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const regularInterval = Math.abs(averageInterval - 30) < 7; // Within a week of monthly

    return variance && regularInterval;
  }

  private matchWithExistingCategory(merchantPattern: string, categories: Category[]): Category | undefined {
    const text = merchantPattern.toLowerCase();
    
    return categories.find(category => {
      const categoryName = category.name.toLowerCase();
      return text.includes(categoryName) || categoryName.includes(text);
    });
  }

  private generateCategoryName(merchantPattern: string, matchedCategory?: Category): string {
    if (matchedCategory) {
      return matchedCategory.name;
    }

    // Capitalize and clean up merchant pattern
    return merchantPattern
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim();
  }

  private mergeSimilarCategories(categories: DerivedBudgetCategory[]): DerivedBudgetCategory[] {
    const merged: DerivedBudgetCategory[] = [];
    
    for (const category of categories) {
      const similar = merged.find(existing => 
        this.areSimilarCategories(existing.name, category.name)
      );

      if (similar) {
        // Merge into existing category
        similar.totalAmount += category.totalAmount;
        similar.transactionCount += category.transactionCount;
        similar.merchants = [...new Set([...similar.merchants, ...category.merchants])];
        similar.averageTransaction = similar.totalAmount / similar.transactionCount;
      } else {
        merged.push(category);
      }
    }

    return merged;
  }

  private areSimilarCategories(name1: string, name2: string): boolean {
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
    const n1 = normalize(name1);
    const n2 = normalize(name2);

    // Check if one is contained in the other
    return n1.includes(n2) || n2.includes(n1) || 
           this.calculateSimilarity(n1, n2) > 0.7;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}