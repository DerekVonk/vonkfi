import { Transaction, Category } from '@shared/schema';

export interface CategorySuggestion {
  categoryId: number;
  confidence: number;
  reason: string;
}

export class TransactionCategorizer {
  private merchantPatterns: Map<string, number> = new Map();
  private descriptionPatterns: Map<RegExp, number> = new Map();

  constructor(categories: Category[]) {
    this.initializePatterns(categories);
  }

  private initializePatterns(categories: Category[]) {
    // Find category IDs
    const incomeCategory = categories.find(c => c.name === 'Income')?.id || 1;
    const housingCategory = categories.find(c => c.name === 'Housing')?.id || 2;
    const foodCategory = categories.find(c => c.name === 'Food')?.id || 3;
    const transportCategory = categories.find(c => c.name === 'Transportation')?.id || 4;
    const utilitiesCategory = categories.find(c => c.name === 'Utilities')?.id || 5;
    const entertainmentCategory = categories.find(c => c.name === 'Entertainment')?.id || 6;
    const shoppingCategory = categories.find(c => c.name === 'Shopping')?.id || 7;
    const transferCategory = categories.find(c => c.name === 'Transfers')?.id || 8;

    // Common merchant patterns
    this.merchantPatterns.set('SALARY', incomeCategory);
    this.merchantPatterns.set('BONUS', incomeCategory);
    this.merchantPatterns.set('WAGES', incomeCategory);
    
    this.merchantPatterns.set('RENT', housingCategory);
    this.merchantPatterns.set('MORTGAGE', housingCategory);
    this.merchantPatterns.set('PROPERTY', housingCategory);
    
    this.merchantPatterns.set('SUPERMARKET', foodCategory);
    this.merchantPatterns.set('GROCERY', foodCategory);
    this.merchantPatterns.set('RESTAURANT', foodCategory);
    this.merchantPatterns.set('CAFE', foodCategory);
    this.merchantPatterns.set('MCDONALD', foodCategory);
    this.merchantPatterns.set('STARBUCKS', foodCategory);
    
    this.merchantPatterns.set('GAS', transportCategory);
    this.merchantPatterns.set('FUEL', transportCategory);
    this.merchantPatterns.set('PARKING', transportCategory);
    this.merchantPatterns.set('TAXI', transportCategory);
    this.merchantPatterns.set('UBER', transportCategory);
    
    this.merchantPatterns.set('ELECTRIC', utilitiesCategory);
    this.merchantPatterns.set('WATER', utilitiesCategory);
    this.merchantPatterns.set('INTERNET', utilitiesCategory);
    this.merchantPatterns.set('PHONE', utilitiesCategory);
    
    this.merchantPatterns.set('NETFLIX', entertainmentCategory);
    this.merchantPatterns.set('SPOTIFY', entertainmentCategory);
    this.merchantPatterns.set('CINEMA', entertainmentCategory);
    this.merchantPatterns.set('THEATER', entertainmentCategory);
    
    this.merchantPatterns.set('AMAZON', shoppingCategory);
    this.merchantPatterns.set('SHOP', shoppingCategory);
    this.merchantPatterns.set('STORE', shoppingCategory);

    // Description patterns
    this.descriptionPatterns.set(/TRANSFER|OVERSCHRIJVING|OVERBOEKING/i, transferCategory);
    this.descriptionPatterns.set(/SALARY|LOON|SALARIS/i, incomeCategory);
    this.descriptionPatterns.set(/RENT|HUUR|MIETE/i, housingCategory);
    this.descriptionPatterns.set(/GROCERY|LEBENSMITTEL|BOODSCHAPPEN/i, foodCategory);
  }

  suggestCategory(transaction: Transaction): CategorySuggestion | null {
    const merchant = transaction.merchant?.toUpperCase() || '';
    const description = transaction.description?.toUpperCase() || '';
    
    // Income detection
    if (transaction.isIncome && parseFloat(transaction.amount) > 0) {
      return {
        categoryId: 1, // Income category
        confidence: 0.9,
        reason: 'Positive amount suggests income'
      };
    }

    // Check merchant patterns
    for (const [pattern, categoryId] of Array.from(this.merchantPatterns.entries())) {
      if (merchant.includes(pattern) || description.includes(pattern)) {
        return {
          categoryId,
          confidence: 0.8,
          reason: `Matched merchant pattern: ${pattern}`
        };
      }
    }

    // Check description patterns
    for (const [pattern, categoryId] of Array.from(this.descriptionPatterns.entries())) {
      if (pattern.test(description)) {
        return {
          categoryId,
          confidence: 0.7,
          reason: `Matched description pattern`
        };
      }
    }

    // Default categorization based on amount and type
    const amount = Math.abs(parseFloat(transaction.amount));
    if (amount < 10) {
      return {
        categoryId: 7, // Shopping
        confidence: 0.3,
        reason: 'Small amount suggests discretionary spending'
      };
    } else if (amount > 1000) {
      return {
        categoryId: 2, // Housing
        confidence: 0.4,
        reason: 'Large amount suggests essential expense'
      };
    }

    return null;
  }

  learnFromCorrection(transaction: Transaction, correctCategoryId: number) {
    // Simple learning: add merchant to patterns
    if (transaction.merchant) {
      const merchantKey = transaction.merchant.toUpperCase();
      this.merchantPatterns.set(merchantKey, correctCategoryId);
    }
  }
}
