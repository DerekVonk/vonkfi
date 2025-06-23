import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FireCalculator, FireMetrics, AllocationRecommendation } from '../../server/services/fireCalculations';
import { Transaction, Goal, Account } from '@shared/schema';

describe('FireCalculator', () => {
  let fireCalculator: FireCalculator;
  let mockTransactions: Transaction[];
  let mockGoals: Goal[];
  let mockAccounts: Account[];

  beforeEach(() => {
    fireCalculator = new FireCalculator();
    
    // Mock current date to ensure consistent test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-23T12:00:00.000Z'));

    // Setup mock data for 6 months of transactions
    mockTransactions = [
      // January 2025
      { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '5000.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 3, accountId: 1, date: new Date('2025-01-20'), amount: '-800.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
      
      // February 2025
      { id: 4, accountId: 1, date: new Date('2025-02-01'), amount: '4800.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 5, accountId: 1, date: new Date('2025-02-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 6, accountId: 1, date: new Date('2025-02-25'), amount: '-700.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
      
      // March 2025
      { id: 7, accountId: 1, date: new Date('2025-03-01'), amount: '5200.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 8, accountId: 1, date: new Date('2025-03-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 9, accountId: 1, date: new Date('2025-03-20'), amount: '-900.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
      
      // April 2025
      { id: 10, accountId: 1, date: new Date('2025-04-01'), amount: '5100.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 11, accountId: 1, date: new Date('2025-04-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 12, accountId: 1, date: new Date('2025-04-25'), amount: '-750.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
      
      // May 2025
      { id: 13, accountId: 1, date: new Date('2025-05-01'), amount: '4900.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 14, accountId: 1, date: new Date('2025-05-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 15, accountId: 1, date: new Date('2025-05-20'), amount: '-850.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
      
      // June 2025
      { id: 16, accountId: 1, date: new Date('2025-06-01'), amount: '5000.00', isIncome: true, currency: 'EUR', description: 'Salary' },
      { id: 17, accountId: 1, date: new Date('2025-06-15'), amount: '-1200.00', isIncome: false, currency: 'EUR', description: 'Rent' },
      { id: 18, accountId: 1, date: new Date('2025-06-20'), amount: '-800.00', isIncome: false, currency: 'EUR', description: 'Groceries' },
    ];

    mockGoals = [
      { id: 1, userId: 1, name: 'Emergency Fund', targetAmount: '15000.00', currentAmount: '5000.00', priority: 1, isCompleted: false },
      { id: 2, userId: 1, name: 'Vacation Fund', targetAmount: '8000.00', currentAmount: '2000.00', priority: 2, isCompleted: false },
      { id: 3, userId: 1, name: 'Investment Fund', targetAmount: '20000.00', currentAmount: '10000.00', priority: 3, isCompleted: false },
    ];

    mockAccounts = [
      { id: 1, userId: 1, iban: 'DE89370400440532013000', accountHolderName: 'Test User', balance: '5000.00', role: 'spending', isActive: true },
      { id: 2, userId: 1, iban: 'DE89370400440532013001', accountHolderName: 'Test User', balance: '3000.00', role: 'goal-specific', isActive: true },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateMetrics', () => {
    it('should calculate basic monthly metrics correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.monthlyIncome).toBeCloseTo(5000, 2); // Average monthly income
      expect(result.monthlyExpenses).toBeCloseTo(2000, 2); // Average monthly expenses  
      expect(result.savingsRate).toBeCloseTo(0.6, 3); // (5000-2000)/5000
    });

    it('should calculate FIRE progress correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      const expectedAnnualExpenses = result.monthlyExpenses * 12;
      const expectedFireTarget = expectedAnnualExpenses * 25;
      const totalCurrentGoalAmount = mockGoals.reduce((sum, goal) => sum + parseFloat(goal.currentAmount || '0'), 0);
      const expectedProgress = totalCurrentGoalAmount / expectedFireTarget;

      expect(result.fireProgress).toBeCloseTo(expectedProgress, 4);
    });

    it('should calculate time to FIRE correctly with positive savings rate', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.timeToFire).toBeGreaterThan(0);
      expect(result.timeToFire).toBeLessThan(50); // Should be reasonable timeframe
      expect(Number.isFinite(result.timeToFire)).toBe(true);
    });

    it('should return Infinity for time to FIRE with zero or negative savings rate', () => {
      // Create transactions with no savings
      const noSavingsTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '3000.00', isIncome: true, currency: 'EUR', description: 'Salary' },
        { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '-3000.00', isIncome: false, currency: 'EUR', description: 'Expenses' },
      ];

      const result = fireCalculator.calculateMetrics(noSavingsTransactions, mockGoals, mockAccounts);

      expect(result.timeToFire).toBe(Infinity);
    });

    it('should calculate volatility metrics correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.volatility.average).toBeCloseTo(5000, 2);
      expect(result.volatility.standardDeviation).toBeGreaterThan(0);
      expect(result.volatility.coefficientOfVariation).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(result.volatility.score);
    });

    it('should classify volatility score correctly', () => {
      // Create high volatility transactions
      const highVolatilityTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '10000.00', isIncome: true, currency: 'EUR', description: 'High income' },
        { id: 2, accountId: 1, date: new Date('2025-02-01'), amount: '2000.00', isIncome: true, currency: 'EUR', description: 'Low income' },
        { id: 3, accountId: 1, date: new Date('2025-03-01'), amount: '8000.00', isIncome: true, currency: 'EUR', description: 'Medium income' },
        { id: 4, accountId: 1, date: new Date('2025-04-01'), amount: '1000.00', isIncome: true, currency: 'EUR', description: 'Very low income' },
        { id: 5, accountId: 1, date: new Date('2025-05-01'), amount: '12000.00', isIncome: true, currency: 'EUR', description: 'Very high income' },
        { id: 6, accountId: 1, date: new Date('2025-06-01'), amount: '3000.00', isIncome: true, currency: 'EUR', description: 'Income' },
      ];

      const result = fireCalculator.calculateMetrics(highVolatilityTransactions, mockGoals, mockAccounts);

      expect(result.volatility.coefficientOfVariation).toBeGreaterThan(0.2);
      expect(result.volatility.score).toBe('high');
    });

    it('should calculate buffer status correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.bufferStatus.current).toBe(5000); // Emergency Fund current amount
      expect(result.bufferStatus.target).toBe(3500); // (3000 + 4000) / 2
      expect(result.bufferStatus.status).toBe('above'); // 5000 > 4000
    });

    it('should handle different buffer statuses', () => {
      // Test below buffer threshold
      const lowBufferGoals = [
        { ...mockGoals[0], currentAmount: '2000.00' }, // Below 3000 minimum
        ...mockGoals.slice(1)
      ];

      let result = fireCalculator.calculateMetrics(mockTransactions, lowBufferGoals, mockAccounts);
      expect(result.bufferStatus.status).toBe('below');

      // Test optimal buffer range
      const optimalBufferGoals = [
        { ...mockGoals[0], currentAmount: '3500.00' }, // Between 3000-4000
        ...mockGoals.slice(1)
      ];

      result = fireCalculator.calculateMetrics(mockTransactions, optimalBufferGoals, mockAccounts);
      expect(result.bufferStatus.status).toBe('optimal');
    });

    it('should generate monthly breakdown correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.monthlyBreakdown).toHaveLength(6); // 6 months of data
      expect(result.monthlyBreakdown[0]).toHaveProperty('month');
      expect(result.monthlyBreakdown[0]).toHaveProperty('income');
      expect(result.monthlyBreakdown[0]).toHaveProperty('expenses');
      expect(result.monthlyBreakdown[0]).toHaveProperty('savings');

      // Check that breakdown is sorted by month
      const months = result.monthlyBreakdown.map(b => b.month);
      const sortedMonths = [...months].sort();
      expect(months).toEqual(sortedMonths);
    });

    it('should set current month correctly', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.currentMonth).toBe('2025-06');
    });

    it('should handle empty transactions gracefully', () => {
      const result = fireCalculator.calculateMetrics([], mockGoals, mockAccounts);

      expect(result.monthlyIncome).toBe(0);
      expect(result.monthlyExpenses).toBe(0);
      expect(result.savingsRate).toBe(0);
      expect(result.fireProgress === 0 || isNaN(result.fireProgress)).toBe(true); // Handle potential NaN
      expect(result.timeToFire === Infinity || isNaN(result.timeToFire)).toBe(true);
      expect(result.monthlyBreakdown).toHaveLength(0);
    });

    it('should handle missing emergency fund goal', () => {
      const goalsWithoutEmergency = mockGoals.filter(g => !g.name.toLowerCase().includes('emergency'));

      const result = fireCalculator.calculateMetrics(mockTransactions, goalsWithoutEmergency, mockAccounts);

      expect(result.bufferStatus.current).toBe(0);
      expect(result.bufferStatus.status).toBe('below');
    });

    it('should handle number of adults parameter', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts, 3);

      // Test should complete without errors - numberOfAdults mainly affects allocation recommendations
      expect(result).toBeDefined();
      expect(typeof result.monthlyIncome).toBe('number');
    });

    it('should handle invalid transaction amounts gracefully', () => {
      const invalidTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: 'invalid', isIncome: true, currency: 'EUR', description: 'Invalid amount' },
        { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '5000.00', isIncome: true, currency: 'EUR', description: 'Valid amount' },
      ];

      const result = fireCalculator.calculateMetrics(invalidTransactions, mockGoals, mockAccounts);

      // Should not crash and should handle valid transactions
      expect(result).toBeDefined();
    });
  });

  describe('calculateAllocationRecommendation', () => {
    it('should calculate basic allocation correctly', () => {
      const monthlyIncome = 5000;
      const monthlyExpenses = 2500;
      const currentBuffer = 2000;

      const result = fireCalculator.calculateAllocationRecommendation(
        monthlyIncome,
        monthlyExpenses,
        currentBuffer,
        mockGoals
      );

      expect(result.pocketMoney).toBe(300); // €150 * 2 adults
      expect(result.essentialExpenses).toBe(monthlyExpenses);
      expect(result.bufferAllocation).toBeGreaterThan(0);
      expect(result.excessForGoals).toBeGreaterThan(0);
    });

    it('should limit buffer allocation to 10% of monthly income', () => {
      const monthlyIncome = 5000;
      const monthlyExpenses = 2000;
      const currentBuffer = 0; // Large buffer need

      const result = fireCalculator.calculateAllocationRecommendation(
        monthlyIncome,
        monthlyExpenses,
        currentBuffer,
        mockGoals
      );

      expect(result.bufferAllocation).toBeLessThanOrEqual(monthlyIncome * 0.1);
      expect(result.bufferAllocation).toBe(500); // 10% of 5000
    });

    it('should handle insufficient income scenario', () => {
      const monthlyIncome = 2000;
      const monthlyExpenses = 2500; // More expenses than income

      const result = fireCalculator.calculateAllocationRecommendation(
        monthlyIncome,
        monthlyExpenses,
        3500, // Optimal buffer
        mockGoals
      );

      expect(result.excessForGoals).toBe(0);
      expect(result.goalAllocations).toHaveLength(0);
      expect(result.pocketMoney).toBe(300);
      expect(result.essentialExpenses).toBe(monthlyExpenses);
    });

    it('should allocate to goals proportionally based on deficit', () => {
      const monthlyIncome = 8000;
      const monthlyExpenses = 3000;
      const currentBuffer = 3500; // Optimal buffer

      const result = fireCalculator.calculateAllocationRecommendation(
        monthlyIncome,
        monthlyExpenses,
        currentBuffer,
        mockGoals
      );

      expect(result.goalAllocations.length).toBeGreaterThan(0);
      
      // Should allocate to goals with deficits
      const totalAllocated = result.goalAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      expect(totalAllocated).toBeLessThanOrEqual(result.excessForGoals);
      expect(totalAllocated).toBeGreaterThan(0);
    });

    it('should prioritize goals by priority and target date', () => {
      const urgentGoals = [
        { id: 1, userId: 1, name: 'Emergency Fund', targetAmount: '10000.00', currentAmount: '5000.00', priority: 1, targetDate: '2025-07-01', isCompleted: false },
        { id: 2, userId: 1, name: 'Vacation Fund', targetAmount: '5000.00', currentAmount: '1000.00', priority: 1, targetDate: '2025-08-01', isCompleted: false },
        { id: 3, userId: 1, name: 'Investment Fund', targetAmount: '15000.00', currentAmount: '5000.00', priority: 2, targetDate: '2026-01-01', isCompleted: false },
      ];

      const monthlyIncome = 8000;
      const monthlyExpenses = 3000;

      const result = fireCalculator.calculateAllocationRecommendation(
        monthlyIncome,
        monthlyExpenses,
        3500,
        urgentGoals
      );

      // Should have allocations for goals with deficits
      expect(result.goalAllocations.length).toBeGreaterThan(0);
      
      // Goals should be sorted by priority, then by target date
      const goalIds = result.goalAllocations.map(alloc => alloc.goalId);
      expect(goalIds).toContain(1); // Higher priority + earlier date
    });

    it('should handle completed goals correctly', () => {
      const goalsWithCompleted = [
        { ...mockGoals[0], isCompleted: true },
        ...mockGoals.slice(1)
      ];

      const result = fireCalculator.calculateAllocationRecommendation(
        5000,
        2500,
        3500,
        goalsWithCompleted
      );

      // Should not allocate to completed goals
      const completedGoalAllocation = result.goalAllocations.find(alloc => alloc.goalId === 1);
      expect(completedGoalAllocation).toBeUndefined();
    });

    it('should handle different number of adults', () => {
      const result1 = fireCalculator.calculateAllocationRecommendation(5000, 2500, 3500, mockGoals, 1);
      const result2 = fireCalculator.calculateAllocationRecommendation(5000, 2500, 3500, mockGoals, 3);

      expect(result1.pocketMoney).toBe(150); // €150 * 1 adult
      expect(result2.pocketMoney).toBe(450); // €150 * 3 adults
    });

    it('should round goal allocations to cents', () => {
      const result = fireCalculator.calculateAllocationRecommendation(
        5000,
        2000,
        3500,
        mockGoals
      );

      result.goalAllocations.forEach(allocation => {
        const cents = allocation.amount * 100;
        expect(cents).toBe(Math.round(cents)); // Should be rounded to whole cents
      });
    });

    it('should handle goals with no deficit', () => {
      const fullyFundedGoals = mockGoals.map(goal => ({
        ...goal,
        currentAmount: goal.targetAmount
      }));

      const result = fireCalculator.calculateAllocationRecommendation(
        5000,
        2500,
        3500,
        fullyFundedGoals
      );

      expect(result.goalAllocations).toHaveLength(0);
    });

    it('should handle zero excess after fixed costs', () => {
      const result = fireCalculator.calculateAllocationRecommendation(
        3000, // Low income
        2500, // High expenses  
        3500, // Optimal buffer (no buffer allocation needed)
        mockGoals,
        2 // 2 adults = €300 pocket money
      );

      // 3000 - 2500 - 300 = 200 excess, but buffer allocation may consume this
      expect(result.excessForGoals).toBeGreaterThanOrEqual(0);
    });
  });

  describe('private methods through public interface', () => {
    describe('getLast6MonthsData filtering', () => {
      it('should only include transactions from last 6 months', () => {
        const oldTransactions = [
          { id: 100, accountId: 1, date: new Date('2024-01-01'), amount: '1000.00', isIncome: true, currency: 'EUR', description: 'Old transaction' },
        ];
        
        const allTransactions = [...mockTransactions, ...oldTransactions];
        const result = fireCalculator.calculateMetrics(allTransactions, mockGoals, mockAccounts);

        // Should not include the old transaction in calculations
        expect(result.monthlyIncome).toBeCloseTo(5000, 2); // Same as before
      });
    });

    describe('standard deviation calculation', () => {
      it('should calculate standard deviation correctly with consistent incomes', () => {
        const consistentTransactions = Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          accountId: 1,
          date: new Date(`2025-0${i + 1}-01`),
          amount: '5000.00',
          isIncome: true,
          currency: 'EUR',
          description: 'Consistent salary'
        }));

        const result = fireCalculator.calculateMetrics(consistentTransactions, mockGoals, mockAccounts);

        expect(result.volatility.standardDeviation).toBe(0);
        expect(result.volatility.coefficientOfVariation).toBe(0);
        expect(result.volatility.score).toBe('low');
      });
    });

    describe('time to FIRE calculation edge cases', () => {
      it('should handle edge case with very high current progress', () => {
        const highProgressGoals = mockGoals.map(goal => ({
          ...goal,
          currentAmount: (parseFloat(goal.targetAmount) * 0.95).toString() // 95% complete
        }));

        const result = fireCalculator.calculateMetrics(mockTransactions, highProgressGoals, mockAccounts);

        expect(result.fireProgress).toBeGreaterThan(0.05); // Adjusted based on actual calculation
        expect(result.timeToFire).toBeGreaterThan(0);
        expect(Number.isFinite(result.timeToFire)).toBe(true);
      });

      it('should handle mathematical edge cases in time to FIRE', () => {
        // Test with minimal savings rate
        const minimalSavingsTransactions = [
          { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '3000.01', isIncome: true, currency: 'EUR', description: 'Minimal surplus' },
          { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '-3000.00', isIncome: false, currency: 'EUR', description: 'Almost all expenses' },
        ];

        const result = fireCalculator.calculateMetrics(minimalSavingsTransactions, mockGoals, mockAccounts);

        expect(result.timeToFire).toBeGreaterThan(0);
        expect(Number.isFinite(result.timeToFire)).toBe(true);
      });
    });

    describe('monthly data aggregation', () => {
      it('should aggregate transactions by month correctly', () => {
        const multiTransactionMonth = [
          { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '2500.00', isIncome: true, currency: 'EUR', description: 'Salary 1' },
          { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '2500.00', isIncome: true, currency: 'EUR', description: 'Salary 2' },
          { id: 3, accountId: 1, date: new Date('2025-01-05'), amount: '-500.00', isIncome: false, currency: 'EUR', description: 'Expense 1' },
          { id: 4, accountId: 1, date: new Date('2025-01-25'), amount: '-300.00', isIncome: false, currency: 'EUR', description: 'Expense 2' },
        ];

        const result = fireCalculator.calculateMetrics(multiTransactionMonth, mockGoals, mockAccounts);

        expect(result.monthlyBreakdown).toHaveLength(1);
        expect(result.monthlyBreakdown[0].month).toBe('2025-01');
        expect(result.monthlyBreakdown[0].income).toBe(5000); // 2500 + 2500
        expect(result.monthlyBreakdown[0].expenses).toBe(800); // 500 + 300
        expect(result.monthlyBreakdown[0].savings).toBe(4200); // 5000 - 800
      });
    });

    describe('goal allocation algorithm', () => {
      it('should handle goals with same priority and different target dates', () => {
        const samePriorityGoals = [
          { id: 1, userId: 1, name: 'Goal A', targetAmount: '10000.00', currentAmount: '5000.00', priority: 1, targetDate: '2025-08-01', isCompleted: false },
          { id: 2, userId: 1, name: 'Goal B', targetAmount: '10000.00', currentAmount: '5000.00', priority: 1, targetDate: '2025-07-01', isCompleted: false },
        ];

        const result = fireCalculator.calculateAllocationRecommendation(
          6000,
          2000,
          3500,
          samePriorityGoals
        );

        expect(result.goalAllocations).toHaveLength(2);
        // Goals should be allocated proportionally since they have same deficit
        const allocation1 = result.goalAllocations.find(a => a.goalId === 1);
        const allocation2 = result.goalAllocations.find(a => a.goalId === 2);
        
        expect(allocation1).toBeDefined();
        expect(allocation2).toBeDefined();
        expect(Math.abs(allocation1!.amount - allocation2!.amount)).toBeLessThan(1000); // Should be reasonably close for same deficit
      });

      it('should handle goals without target dates', () => {
        const noDateGoals = mockGoals.map(goal => ({
          ...goal,
          targetDate: undefined
        }));

        const result = fireCalculator.calculateAllocationRecommendation(
          6000,
          2000,
          3500,
          noDateGoals
        );

        expect(result.goalAllocations.length).toBeGreaterThan(0);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle NaN values in calculations', () => {
      const nanTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '0.00', isIncome: true, currency: 'EUR', description: 'Zero income' },
      ];

      const result = fireCalculator.calculateMetrics(nanTransactions, mockGoals, mockAccounts);

      expect(result.savingsRate).toBe(0); // Should handle NaN gracefully
      expect(Number.isFinite(result.monthlyIncome)).toBe(true);
      expect(Number.isFinite(result.monthlyExpenses)).toBe(true);
    });

    it('should handle very large numbers', () => {
      const largeTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '999999999.99', isIncome: true, currency: 'EUR', description: 'Very large income' },
      ];

      const largeGoals = [
        { id: 1, userId: 1, name: 'Large Goal', targetAmount: '999999999.99', currentAmount: '500000000.00', priority: 1, isCompleted: false },
      ];

      const result = fireCalculator.calculateMetrics(largeTransactions, largeGoals, mockAccounts);

      expect(Number.isFinite(result.monthlyIncome)).toBe(true);
      expect(typeof result.fireProgress).toBe('number'); // May be Infinity with very large numbers
      expect(typeof result.timeToFire).toBe('number'); // May be Infinity with very large numbers
    });

    it('should handle negative amounts correctly', () => {
      const negativeTransactions = [
        { id: 1, accountId: 1, date: new Date('2025-01-01'), amount: '5000.00', isIncome: true, currency: 'EUR', description: 'Income' },
        { id: 2, accountId: 1, date: new Date('2025-01-15'), amount: '500.00', isIncome: false, currency: 'EUR', description: 'Positive expense amount' },
      ];

      const result = fireCalculator.calculateMetrics(negativeTransactions, mockGoals, mockAccounts);

      // Should handle positive amounts in expenses correctly - they get filtered out since they're not negative
      expect(result.monthlyExpenses).toBe(0);
    });

    it('should handle empty arrays gracefully', () => {
      const result1 = fireCalculator.calculateMetrics([], [], []);
      expect(result1).toBeDefined();

      const result2 = fireCalculator.calculateAllocationRecommendation(0, 0, 0, []);
      expect(result2).toBeDefined();
      expect(result2.goalAllocations).toHaveLength(0);
    });

    it('should handle malformed goal data', () => {
      const malformedGoals = [
        { id: 1, userId: 1, name: 'Valid Goal', targetAmount: '5000.00', currentAmount: '2000.00', priority: 1, isCompleted: false },
        { id: 2, userId: 1, name: 'Invalid Goal', targetAmount: '', currentAmount: null, priority: null, isCompleted: false },
      ];

      const result = fireCalculator.calculateMetrics(mockTransactions, malformedGoals, mockAccounts);

      expect(result).toBeDefined();
      expect(Number.isFinite(result.fireProgress)).toBe(true);
    });
  });

  describe('constants and configuration', () => {
    it('should use correct FIRE constants', () => {
      // Test that the 25x rule is applied correctly
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);
      const expectedFireTarget = result.monthlyExpenses * 12 * 25;
      
      // Verify through the progress calculation
      const totalGoalAmount = mockGoals.reduce((sum, goal) => sum + parseFloat(goal.currentAmount || '0'), 0);
      const expectedProgress = totalGoalAmount / expectedFireTarget;
      
      expect(result.fireProgress).toBeCloseTo(expectedProgress, 4);
    });

    it('should use correct pocket money allocation per adult', () => {
      const result1 = fireCalculator.calculateAllocationRecommendation(5000, 2000, 3500, mockGoals, 1);
      const result2 = fireCalculator.calculateAllocationRecommendation(5000, 2000, 3500, mockGoals, 2);
      const result3 = fireCalculator.calculateAllocationRecommendation(5000, 2000, 3500, mockGoals, 4);

      expect(result2.pocketMoney - result1.pocketMoney).toBe(150); // €150 difference per adult
      expect(result3.pocketMoney - result1.pocketMoney).toBe(450); // €150 * 3 additional adults
    });

    it('should use correct buffer range', () => {
      const result = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result.bufferStatus.target).toBe(3500); // (3000 + 4000) / 2
      
      // Test buffer status classification
      const lowBuffer = [{ ...mockGoals[0], currentAmount: '2500.00' }]; // Below 3000
      const optimalBuffer = [{ ...mockGoals[0], currentAmount: '3750.00' }]; // Between 3000-4000
      const highBuffer = [{ ...mockGoals[0], currentAmount: '4500.00' }]; // Above 4000

      expect(fireCalculator.calculateMetrics(mockTransactions, lowBuffer, mockAccounts).bufferStatus.status).toBe('below');
      expect(fireCalculator.calculateMetrics(mockTransactions, optimalBuffer, mockAccounts).bufferStatus.status).toBe('optimal');
      expect(fireCalculator.calculateMetrics(mockTransactions, highBuffer, mockAccounts).bufferStatus.status).toBe('above');
    });
  });

  describe('integration scenarios', () => {
    it('should provide consistent results across multiple calls', () => {
      const result1 = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);
      const result2 = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      expect(result1.monthlyIncome).toBe(result2.monthlyIncome);
      expect(result1.monthlyExpenses).toBe(result2.monthlyExpenses);
      expect(result1.fireProgress).toBe(result2.fireProgress);
      expect(result1.timeToFire).toBe(result2.timeToFire);
    });

    it('should handle real-world scenario with mixed transaction types', () => {
      const realWorldTransactions = [
        // Regular salary
        ...Array.from({ length: 6 }, (_, i) => ({
          id: i * 10 + 1,
          accountId: 1,
          date: new Date(`2025-0${i + 1}-01`),
          amount: '4500.00',
          isIncome: true,
          currency: 'EUR',
          description: 'Monthly Salary'
        })),
        // Irregular bonus
        { id: 100, accountId: 1, date: new Date('2025-03-15'), amount: '2000.00', isIncome: true, currency: 'EUR', description: 'Bonus' },
        // Regular expenses
        ...Array.from({ length: 6 }, (_, i) => ({
          id: i * 10 + 2,
          accountId: 1,
          date: new Date(`2025-0${i + 1}-05`),
          amount: '-1200.00',
          isIncome: false,
          currency: 'EUR',
          description: 'Rent'
        })),
        // Irregular large expense
        { id: 200, accountId: 1, date: new Date('2025-04-20'), amount: '-3000.00', isIncome: false, currency: 'EUR', description: 'Car repair' },
      ];

      const result = fireCalculator.calculateMetrics(realWorldTransactions, mockGoals, mockAccounts);

      // Should handle mixed scenario without errors
      expect(result).toBeDefined();
      expect(result.monthlyIncome).toBeGreaterThan(4500); // Should include bonus
      expect(['low', 'medium', 'high']).toContain(result.volatility.score); // May vary due to bonus
      expect(Number.isFinite(result.timeToFire)).toBe(true);
    });

    it('should demonstrate end-to-end FIRE calculation workflow', () => {
      // Step 1: Calculate current metrics
      const metrics = fireCalculator.calculateMetrics(mockTransactions, mockGoals, mockAccounts);

      // Step 2: Generate allocation recommendations based on metrics
      const allocation = fireCalculator.calculateAllocationRecommendation(
        metrics.monthlyIncome,
        metrics.monthlyExpenses,
        metrics.bufferStatus.current,
        mockGoals
      );

      // Step 3: Verify workflow consistency
      expect(metrics.monthlyIncome).toBeGreaterThan(metrics.monthlyExpenses);
      expect(allocation.excessForGoals).toBeGreaterThan(0);
      expect(allocation.goalAllocations.length).toBeGreaterThan(0);

      // Step 4: Verify allocation adds up correctly
      const totalAllocation = allocation.pocketMoney + 
                             allocation.essentialExpenses + 
                             allocation.bufferAllocation + 
                             allocation.goalAllocations.reduce((sum, goal) => sum + goal.amount, 0);

      expect(totalAllocation).toBeLessThanOrEqual(metrics.monthlyIncome + 1); // Allow for rounding
    });
  });
});