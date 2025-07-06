import { describe, it, expect } from 'vitest';
import { FireCalculator } from '../../server/services/fireCalculations';
import { Transaction, Goal, Account } from '../../shared/schema';

describe('FireCalculator with Internal Transfer Filtering', () => {
  let fireCalculator: FireCalculator;
  let mockAccounts: Account[];
  let mockGoals: Goal[];

  beforeEach(() => {
    fireCalculator = new FireCalculator();
    
    mockAccounts = [
      {
        id: 1,
        userId: 1,
        iban: 'NL91ABNA0417164300',
        bic: 'ABNANL2A',
        accountHolderName: 'John Doe',
        bankName: 'ABN AMRO',
        customName: 'Checking Account',
        accountType: 'checking',
        role: 'spending',
        balance: '1500.00',
        discoveredDate: new Date(),
        lastSeenDate: new Date(),
        isActive: true
      },
      {
        id: 2,
        userId: 1,
        iban: 'NL32RABO0300065264',
        bic: 'RABONL2U',
        accountHolderName: 'John Doe',
        bankName: 'Rabobank',
        customName: 'Savings Account',
        accountType: 'savings',
        role: 'emergency',
        balance: '5000.00',
        discoveredDate: new Date(),
        lastSeenDate: new Date(),
        isActive: true
      }
    ] as Account[];

    mockGoals = [
      {
        id: 1,
        userId: 1,
        name: 'Emergency Fund',
        targetAmount: '10000.00',
        currentAmount: '5000.00',
        linkedAccountId: 2,
        targetDate: '2025-12-31',
        priority: 1,
        isCompleted: false
      }
    ] as Goal[];
  });

  describe('calculateMetrics with internal transfer filtering', () => {
    it('should exclude internal transfers from income calculations', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 3);

      const transactions: Transaction[] = [
        // Regular income
        {
          id: 1,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '3000.00',
          currency: 'EUR',
          description: 'Salary',
          isIncome: true,
          reference: 'SAL001',
          counterpartyIban: null,
          counterpartyName: 'Employer Inc',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'credit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Internal transfer marked as income (should be excluded)
        {
          id: 2,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '500.00',
          currency: 'EUR',
          description: 'Transfer from savings',
          isIncome: true,
          reference: 'INTERNAL_TRANSFER_001',
          counterpartyIban: 'NL32RABO0300065264', // User's own account
          counterpartyName: 'John Doe',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Regular expense
        {
          id: 3,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '-200.00',
          currency: 'EUR',
          description: 'Groceries',
          isIncome: false,
          reference: 'PUR001',
          counterpartyIban: null,
          counterpartyName: 'Supermarket',
          merchant: 'Albert Heijn',
          categoryId: null,
          statementId: null,
          transactionType: 'debit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Internal transfer marked as expense (should be excluded)
        {
          id: 4,
          accountId: 2,
          date: sixMonthsAgo,
          amount: '-500.00',
          currency: 'EUR',
          description: 'Transfer to checking',
          isIncome: false,
          reference: 'INTERNAL_TRANSFER_001',
          counterpartyIban: 'NL91ABNA0417164300', // User's own account
          counterpartyName: 'John Doe',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        }
      ] as Transaction[];

      const metrics = fireCalculator.calculateMetrics(transactions, mockGoals, mockAccounts, 2);

      // Should only count regular income (€3000), not internal transfer (€500)
      expect(metrics.monthlyIncome).toBe(3000);
      
      // Should only count regular expense (€200), not internal transfer (€500)
      expect(metrics.monthlyExpenses).toBe(200);
      
      // Savings rate should be calculated correctly: (3000 - 200) / 3000 = 0.9333...
      expect(metrics.savingsRate).toBeCloseTo(0.9333, 3);
    });

    it('should exclude already marked internal transfers', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 3);

      const transactions: Transaction[] = [
        // Regular income
        {
          id: 1,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '3000.00',
          currency: 'EUR',
          description: 'Salary',
          isIncome: true,
          reference: 'SAL001',
          counterpartyIban: null,
          counterpartyName: 'Employer Inc',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'credit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Pre-marked internal transfer (should be excluded)
        {
          id: 2,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '1000.00',
          currency: 'EUR',
          description: 'Transfer from savings',
          isIncome: true,
          reference: 'TRF001',
          counterpartyIban: null,
          counterpartyName: null,
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: true, // Already marked
          matchedTransferId: 3,
          transferDetectionConfidence: 'high',
          transferFee: null
        },
        // Matching internal transfer (should be excluded)
        {
          id: 3,
          accountId: 2,
          date: sixMonthsAgo,
          amount: '-1000.00',
          currency: 'EUR',
          description: 'Transfer to checking',
          isIncome: false,
          reference: 'TRF001',
          counterpartyIban: null,
          counterpartyName: null,
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: true, // Already marked
          matchedTransferId: 2,
          transferDetectionConfidence: 'high',
          transferFee: null
        }
      ] as Transaction[];

      const metrics = fireCalculator.calculateMetrics(transactions, mockGoals, mockAccounts, 2);

      // Should only count regular income (€3000), not internal transfer (€1000)
      expect(metrics.monthlyIncome).toBe(3000);
      
      // Should not count any expenses (internal transfer excluded)
      expect(metrics.monthlyExpenses).toBe(0);
      
      // Savings rate should be 100% since no real expenses
      expect(metrics.savingsRate).toBe(1);
    });

    it('should generate monthly breakdown excluding internal transfers', () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const transactions: Transaction[] = [
        // Month 1: Regular transactions
        {
          id: 1,
          accountId: 1,
          date: threeMonthsAgo,
          amount: '3000.00',
          currency: 'EUR',
          description: 'Salary',
          isIncome: true,
          reference: 'SAL001',
          counterpartyIban: null,
          counterpartyName: 'Employer Inc',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'credit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        {
          id: 2,
          accountId: 1,
          date: threeMonthsAgo,
          amount: '-1000.00',
          currency: 'EUR',
          description: 'Rent',
          isIncome: false,
          reference: 'RENT001',
          counterpartyIban: null,
          counterpartyName: 'Landlord',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'debit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Month 1: Internal transfer (should be excluded)
        {
          id: 3,
          accountId: 1,
          date: threeMonthsAgo,
          amount: '500.00',
          currency: 'EUR',
          description: 'Transfer from savings',
          isIncome: true,
          reference: 'INTERNAL_TRANSFER_001',
          counterpartyIban: 'NL32RABO0300065264',
          counterpartyName: 'John Doe',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Month 2: Regular transactions
        {
          id: 4,
          accountId: 1,
          date: twoMonthsAgo,
          amount: '3000.00',
          currency: 'EUR',
          description: 'Salary',
          isIncome: true,
          reference: 'SAL002',
          counterpartyIban: null,
          counterpartyName: 'Employer Inc',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'credit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        {
          id: 5,
          accountId: 1,
          date: twoMonthsAgo,
          amount: '-800.00',
          currency: 'EUR',
          description: 'Utilities',
          isIncome: false,
          reference: 'UTIL001',
          counterpartyIban: null,
          counterpartyName: 'Utility Company',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'debit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        }
      ] as Transaction[];

      const metrics = fireCalculator.calculateMetrics(transactions, mockGoals, mockAccounts, 2);

      expect(metrics.monthlyBreakdown).toHaveLength(2);
      
      // Find the breakdown for the first month
      const month1Key = threeMonthsAgo.toISOString().substring(0, 7);
      const month1Breakdown = metrics.monthlyBreakdown.find(m => m.month === month1Key);
      expect(month1Breakdown).toBeDefined();
      expect(month1Breakdown!.income).toBe(3000); // Only salary, not internal transfer
      expect(month1Breakdown!.expenses).toBe(1000); // Only rent
      expect(month1Breakdown!.savings).toBe(2000); // 3000 - 1000

      // Find the breakdown for the second month
      const month2Key = twoMonthsAgo.toISOString().substring(0, 7);
      const month2Breakdown = metrics.monthlyBreakdown.find(m => m.month === month2Key);
      expect(month2Breakdown).toBeDefined();
      expect(month2Breakdown!.income).toBe(3000); // Only salary
      expect(month2Breakdown!.expenses).toBe(800); // Only utilities
      expect(month2Breakdown!.savings).toBe(2200); // 3000 - 800
    });
  });

  describe('transfer detection edge cases', () => {
    it('should handle transfers with fees correctly', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 3);

      const transactions: Transaction[] = [
        // Outgoing transfer with fee
        {
          id: 1,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '-502.50', // €500 + €2.50 fee
          currency: 'EUR',
          description: 'Transfer to savings',
          isIncome: false,
          reference: 'TRF001',
          counterpartyIban: null,
          counterpartyName: null,
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // Incoming transfer (exact amount)
        {
          id: 2,
          accountId: 2,
          date: sixMonthsAgo,
          amount: '500.00',
          currency: 'EUR',
          description: 'Transfer from checking',
          isIncome: true,
          reference: 'TRF001',
          counterpartyIban: null,
          counterpartyName: null,
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        }
      ] as Transaction[];

      const metrics = fireCalculator.calculateMetrics(transactions, mockGoals, mockAccounts, 2);

      // Both transfers should be excluded from calculations
      expect(metrics.monthlyIncome).toBe(0);
      expect(metrics.monthlyExpenses).toBe(0);
      expect(metrics.savingsRate).toBe(0); // No income, so savings rate is 0
    });

    it('should handle multi-currency transfers', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 3);

      const transactions: Transaction[] = [
        // Regular EUR income
        {
          id: 1,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '3000.00',
          currency: 'EUR',
          description: 'Salary',
          isIncome: true,
          reference: 'SAL001',
          counterpartyIban: null,
          counterpartyName: 'Employer Inc',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'credit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        },
        // USD transfer with conversion (different amounts due to exchange rate)
        {
          id: 2,
          accountId: 1,
          date: sixMonthsAgo,
          amount: '-1000.00',
          currency: 'EUR',
          description: 'Transfer to USD account',
          isIncome: false,
          reference: 'INTERNAL_TRANSFER_USD_001',
          counterpartyIban: 'NL32RABO0300065264',
          counterpartyName: 'John Doe',
          merchant: null,
          categoryId: null,
          statementId: null,
          transactionType: 'transfer',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        }
      ] as Transaction[];

      const metrics = fireCalculator.calculateMetrics(transactions, mockGoals, mockAccounts, 2);

      // Should only count regular income, not the currency transfer
      expect(metrics.monthlyIncome).toBe(3000);
      expect(metrics.monthlyExpenses).toBe(0);
      expect(metrics.savingsRate).toBe(1);
    });
  });
});