/**
 * Comprehensive tests for currency validation and precision handling
 * Tests all edge cases identified in the analysis
 */

import { describe, it, expect } from 'vitest';
import { 
  toCents, 
  fromCents, 
  addCurrency, 
  subtractCurrency, 
  multiplyCurrency, 
  compareCurrency,
  validateTransferAmount,
  roundCurrency,
  calculatePercentage,
  distributeAmount,
  validateSum,
  CurrencyError,
  CURRENCY_CONFIG
} from '../../server/utils/currencyUtils';

describe('Currency Validation and Precision Handling', () => {
  
  describe('Basic Currency Conversion', () => {
    it('should convert valid currency amounts to cents correctly', () => {
      expect(toCents('100.50')).toBe(10050);
      expect(toCents(100.50)).toBe(10050);
      expect(toCents('0.01')).toBe(1);
      expect(toCents(0)).toBe(0);
    });

    it('should convert cents back to currency string correctly', () => {
      expect(fromCents(10050)).toBe('100.50');
      expect(fromCents(1)).toBe('0.01');
      expect(fromCents(0)).toBe('0.00');
    });

    it('should handle negative amounts correctly', () => {
      expect(toCents('-100.50')).toBe(-10050);
      expect(fromCents(-10050)).toBe('-100.50');
    });
  });

  describe('Floating-Point Precision Edge Cases', () => {
    it('should handle floating-point arithmetic precision issues', () => {
      // Classic floating-point issue: 0.1 + 0.2 = 0.30000000000000004
      const result = addCurrency('0.1', '0.2');
      expect(result).toBe('0.30');
    });

    it('should handle very small amounts correctly', () => {
      expect(toCents('0.001')).toBe(0); // Rounds to 0 cents
      expect(toCents('0.005')).toBe(1); // Rounds to 1 cent
      expect(toCents('0.004')).toBe(0); // Rounds to 0 cents
    });

    it('should handle repeated operations without accumulating errors', () => {
      let amount = '0.00';
      for (let i = 0; i < 100; i++) {
        amount = addCurrency(amount, '0.01');
      }
      expect(amount).toBe('1.00');
    });
  });

  describe('Currency Amount Limits and Overflow', () => {
    it('should reject amounts that exceed maximum safe value', () => {
      const maxSafeAmount = CURRENCY_CONFIG.MAX_SAFE_AMOUNT.toString();
      expect(() => toCents(maxSafeAmount)).not.toThrow();
      
      const exceedsMaxAmount = (CURRENCY_CONFIG.MAX_SAFE_AMOUNT + 1).toString();
      expect(() => toCents(exceedsMaxAmount)).toThrow(CurrencyError);
    });

    it('should handle very large but valid amounts', () => {
      const largeAmount = '9000000000000.99';
      expect(() => toCents(largeAmount)).not.toThrow();
      expect(fromCents(toCents(largeAmount))).toBe(largeAmount);
    });

    it('should prevent integer overflow in operations', () => {
      const largeAmount = '50000000000000.00'; // This should exceed the safe limit when doubled
      expect(() => addCurrency(largeAmount, largeAmount)).toThrow(CurrencyError);
    });
  });

  describe('Invalid Input Handling', () => {
    it('should reject invalid currency strings', () => {
      expect(() => toCents('invalid')).toThrow(CurrencyError);
      expect(() => toCents('')).toThrow(CurrencyError);
      expect(() => toCents('€100.50')).toThrow(CurrencyError);
      expect(() => toCents('100.50.50')).toThrow(CurrencyError);
    });

    it('should reject infinite and NaN values', () => {
      expect(() => toCents(Infinity)).toThrow(CurrencyError);
      expect(() => toCents(-Infinity)).toThrow(CurrencyError);
      expect(() => toCents(NaN)).toThrow(CurrencyError);
    });

    it('should reject unsafe integer values for cents', () => {
      const unsafeInt = Number.MAX_SAFE_INTEGER + 1;
      expect(() => fromCents(unsafeInt)).toThrow(CurrencyError);
      expect(() => fromCents(1.5)).toThrow(CurrencyError);
    });
  });

  describe('Currency Arithmetic Operations', () => {
    it('should perform addition correctly', () => {
      expect(addCurrency('100.50', '50.25')).toBe('150.75');
      expect(addCurrency('0.01', '0.01')).toBe('0.02');
      expect(addCurrency('-100.00', '50.00')).toBe('-50.00');
    });

    it('should perform subtraction correctly', () => {
      expect(subtractCurrency('100.50', '50.25')).toBe('50.25');
      expect(subtractCurrency('0.02', '0.01')).toBe('0.01');
      expect(subtractCurrency('50.00', '100.00')).toBe('-50.00');
    });

    it('should perform multiplication correctly', () => {
      expect(multiplyCurrency('100.00', 1.5)).toBe('150.00');
      expect(multiplyCurrency('33.33', 3)).toBe('99.99');
      expect(multiplyCurrency('0.01', 100)).toBe('1.00');
    });

    it('should handle multiplication by invalid factors', () => {
      expect(() => multiplyCurrency('100.00', Infinity)).toThrow(CurrencyError);
      expect(() => multiplyCurrency('100.00', NaN)).toThrow(CurrencyError);
    });
  });

  describe('Currency Comparison', () => {
    it('should compare currency amounts correctly', () => {
      expect(compareCurrency('100.50', '100.50')).toBe(0);
      expect(compareCurrency('100.51', '100.50')).toBe(1);
      expect(compareCurrency('100.49', '100.50')).toBe(-1);
    });

    it('should handle precision in comparisons', () => {
      // These should be equal after proper rounding
      expect(compareCurrency('100.001', '100.004')).toBe(0);
      expect(compareCurrency('100.005', '100.004')).toBe(1);
    });
  });

  describe('Transfer Amount Validation', () => {
    it('should validate correct transfer amounts', () => {
      const result = validateTransferAmount('100.50');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid transfer amounts', () => {
      expect(validateTransferAmount('0').valid).toBe(false);
      expect(validateTransferAmount('-100').valid).toBe(false);
      expect(validateTransferAmount('invalid').valid).toBe(false);
      expect(validateTransferAmount(NaN).valid).toBe(false);
      expect(validateTransferAmount(Infinity).valid).toBe(false);
    });

    it('should enforce minimum transfer amount', () => {
      const result = validateTransferAmount('0.001');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least');
    });

    it('should enforce maximum transfer amount', () => {
      const result = validateTransferAmount('2000000.00');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('Currency Rounding', () => {
    it('should round currency amounts correctly', () => {
      expect(roundCurrency('100.567')).toBe('100.57');
      expect(roundCurrency('100.562')).toBe('100.56');
      expect(roundCurrency('100.565')).toBe('100.56'); // Standard round-half-down in toFixed
    });

    it('should handle custom precision', () => {
      expect(roundCurrency('100.567', 1)).toBe('100.6');
      expect(roundCurrency('100.567', 0)).toBe('101');
    });
  });

  describe('Percentage Calculations', () => {
    it('should calculate percentages correctly', () => {
      expect(calculatePercentage('100.00', 10)).toBe('10.00');
      expect(calculatePercentage('100.00', 0)).toBe('0.00');
      expect(calculatePercentage('100.00', 100)).toBe('100.00');
    });

    it('should reject invalid percentages', () => {
      expect(() => calculatePercentage('100.00', -1)).toThrow(CurrencyError);
      expect(() => calculatePercentage('100.00', 101)).toThrow(CurrencyError);
    });
  });

  describe('Amount Distribution', () => {
    it('should distribute amounts proportionally', () => {
      const allocations = [
        { id: 'goal1', weight: 1 },
        { id: 'goal2', weight: 2 },
        { id: 'goal3', weight: 1 }
      ];
      
      const result = distributeAmount('100.00', allocations);
      
      expect(result).toHaveLength(3);
      expect(result[0].amount).toBe('25.00');
      expect(result[1].amount).toBe('50.00');
      expect(result[2].amount).toBe('25.00');
    });

    it('should handle rounding in distribution', () => {
      const allocations = [
        { id: 'goal1', weight: 1 },
        { id: 'goal2', weight: 1 },
        { id: 'goal3', weight: 1 }
      ];
      
      const result = distributeAmount('100.01', allocations);
      
      // Last allocation gets the remainder - use precise calculation
      const total = result.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      expect(Math.round(total * 100) / 100).toBe(100.01);
    });

    it('should handle edge cases in distribution', () => {
      expect(() => distributeAmount('100.00', [])).not.toThrow();
      expect(distributeAmount('100.00', [])).toHaveLength(0);
      
      expect(() => distributeAmount('100.00', [{ id: 'goal1', weight: 0 }])).toThrow(CurrencyError);
    });
  });

  describe('Sum Validation', () => {
    it('should validate correct sums', () => {
      const amounts = ['25.00', '25.00', '50.00'];
      expect(validateSum(amounts, '100.00')).toBe(true);
    });

    it('should handle small rounding differences', () => {
      const amounts = ['33.33', '33.33', '33.34'];
      expect(validateSum(amounts, '100.00')).toBe(true);
    });

    it('should reject incorrect sums', () => {
      const amounts = ['25.00', '25.00', '50.02']; // 2 cent difference exceeds tolerance
      expect(validateSum(amounts, '100.00')).toBe(false);
    });

    it('should handle invalid amounts gracefully', () => {
      const amounts = ['25.00', 'invalid', '50.00'];
      expect(validateSum(amounts, '100.00')).toBe(false);
    });
  });

  describe('Extreme Edge Cases', () => {
    it('should handle zero amounts correctly', () => {
      expect(toCents('0.00')).toBe(0);
      expect(fromCents(0)).toBe('0.00');
      expect(addCurrency('0.00', '0.00')).toBe('0.00');
      expect(subtractCurrency('0.00', '0.00')).toBe('0.00');
    });

    it('should handle very small non-zero amounts', () => {
      expect(validateTransferAmount('0.01').valid).toBe(true);
      expect(addCurrency('0.01', '0.01')).toBe('0.02');
    });

    it('should handle currency operations with different formats', () => {
      expect(addCurrency('100', '0.50')).toBe('100.50');
      expect(addCurrency('100.0', '0.50')).toBe('100.50');
      expect(addCurrency('100.00', '0.5')).toBe('100.50');
    });
  });
});