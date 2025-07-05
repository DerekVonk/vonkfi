/**
 * Utility functions for handling currency precision and financial calculations
 * Addresses floating-point precision issues and overflow problems
 */

/**
 * Currency precision configuration
 */
export const CURRENCY_CONFIG = {
  DECIMAL_PLACES: 2,
  MAX_SAFE_AMOUNT: 9007199254740.99, // JavaScript MAX_SAFE_INTEGER / 100 for cents precision
  MIN_TRANSFER_AMOUNT: 0.01,
  MAX_TRANSFER_AMOUNT: 1000000.00, // €1M default limit
} as const;

/**
 * Error types for currency operations
 */
export class CurrencyError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CurrencyError';
  }
}

/**
 * Converts a currency string or number to cents (integer) for precise calculations
 */
export function toCents(amount: string | number): number {
  if (typeof amount === 'string') {
    // Additional validation for string format
    if (amount.trim() === '') {
      throw new CurrencyError(`Invalid currency string: empty string`, 'INVALID_CURRENCY_STRING');
    }
    
    // Check for invalid patterns
    if (amount.includes('€') || amount.split('.').length > 2) {
      throw new CurrencyError(`Invalid currency string: ${amount}`, 'INVALID_CURRENCY_STRING');
    }
    
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) {
      throw new CurrencyError(`Invalid currency string: ${amount}`, 'INVALID_CURRENCY_STRING');
    }
    amount = parsed;
  }

  if (!isFinite(amount)) {
    throw new CurrencyError(`Amount is not finite: ${amount}`, 'INVALID_AMOUNT');
  }

  if (amount > CURRENCY_CONFIG.MAX_SAFE_AMOUNT) {
    throw new CurrencyError(`Amount exceeds maximum safe value: ${amount}`, 'AMOUNT_TOO_LARGE');
  }

  if (amount < -CURRENCY_CONFIG.MAX_SAFE_AMOUNT) {
    throw new CurrencyError(`Amount is below minimum safe value: ${amount}`, 'AMOUNT_TOO_SMALL');
  }

  // Round to avoid floating-point precision issues
  const cents = Math.round(amount * 100);
  
  if (!Number.isSafeInteger(cents)) {
    throw new CurrencyError(`Amount results in unsafe integer: ${amount}`, 'UNSAFE_INTEGER');
  }

  return cents;
}

/**
 * Converts cents (integer) back to currency string with proper precision
 */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new CurrencyError(`Cents value is not a safe integer: ${cents}`, 'UNSAFE_INTEGER');
  }

  return (cents / 100).toFixed(CURRENCY_CONFIG.DECIMAL_PLACES);
}

/**
 * Safely adds two currency amounts
 */
export function addCurrency(a: string | number, b: string | number): string {
  const centsA = toCents(a);
  const centsB = toCents(b);
  
  const result = centsA + centsB;
  
  if (!Number.isSafeInteger(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    throw new CurrencyError(`Addition overflow: ${a} + ${b}`, 'ADDITION_OVERFLOW');
  }

  return fromCents(result);
}

/**
 * Safely subtracts two currency amounts
 */
export function subtractCurrency(a: string | number, b: string | number): string {
  const centsA = toCents(a);
  const centsB = toCents(b);
  
  const result = centsA - centsB;
  
  if (!Number.isSafeInteger(result)) {
    throw new CurrencyError(`Subtraction overflow: ${a} - ${b}`, 'SUBTRACTION_OVERFLOW');
  }

  return fromCents(result);
}

/**
 * Safely multiplies a currency amount by a factor
 */
export function multiplyCurrency(amount: string | number, factor: number): string {
  if (!isFinite(factor)) {
    throw new CurrencyError(`Invalid multiplication factor: ${factor}`, 'INVALID_FACTOR');
  }

  const cents = toCents(amount);
  const result = Math.round(cents * factor);
  
  if (!Number.isSafeInteger(result)) {
    throw new CurrencyError(`Multiplication overflow: ${amount} * ${factor}`, 'MULTIPLICATION_OVERFLOW');
  }

  return fromCents(result);
}

/**
 * Compares two currency amounts
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareCurrency(a: string | number, b: string | number): number {
  const centsA = toCents(a);
  const centsB = toCents(b);
  
  if (centsA < centsB) return -1;
  if (centsA > centsB) return 1;
  return 0;
}

/**
 * Validates if an amount is suitable for transfer
 */
export function validateTransferAmount(amount: string | number): { valid: boolean; error?: string } {
  try {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(numericAmount)) {
      return { valid: false, error: 'Amount is not a valid number' };
    }

    if (!isFinite(numericAmount)) {
      return { valid: false, error: 'Amount must be finite' };
    }

    if (numericAmount <= 0) {
      return { valid: false, error: 'Amount must be positive' };
    }

    if (numericAmount < CURRENCY_CONFIG.MIN_TRANSFER_AMOUNT) {
      return { valid: false, error: `Amount must be at least €${CURRENCY_CONFIG.MIN_TRANSFER_AMOUNT}` };
    }

    if (numericAmount > CURRENCY_CONFIG.MAX_TRANSFER_AMOUNT) {
      return { valid: false, error: `Amount exceeds maximum transfer limit of €${CURRENCY_CONFIG.MAX_TRANSFER_AMOUNT}` };
    }

    // Test conversion to ensure precision is maintained
    toCents(numericAmount);

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof CurrencyError ? error.message : 'Invalid currency amount' 
    };
  }
}

/**
 * Rounds a currency amount to the specified precision
 */
export function roundCurrency(amount: string | number, precision: number = CURRENCY_CONFIG.DECIMAL_PLACES): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numericAmount) || !isFinite(numericAmount)) {
    throw new CurrencyError(`Invalid amount for rounding: ${amount}`, 'INVALID_AMOUNT');
  }

  return numericAmount.toFixed(precision);
}

/**
 * Safely calculates percentage of an amount
 */
export function calculatePercentage(amount: string | number, percentage: number): string {
  if (percentage < 0 || percentage > 100) {
    throw new CurrencyError(`Invalid percentage: ${percentage}`, 'INVALID_PERCENTAGE');
  }

  return multiplyCurrency(amount, percentage / 100);
}

/**
 * Distributes an amount proportionally across multiple allocations
 */
export function distributeAmount(
  totalAmount: string | number,
  allocations: { id: string | number; weight: number }[]
): { id: string | number; amount: string }[] {
  if (allocations.length === 0) {
    return [];
  }

  const totalWeight = allocations.reduce((sum, alloc) => sum + alloc.weight, 0);
  
  if (totalWeight <= 0) {
    throw new CurrencyError('Total allocation weight must be positive', 'INVALID_ALLOCATION_WEIGHT');
  }

  const totalCents = toCents(totalAmount);
  let distributedCents = 0;
  const results: { id: string | number; amount: string }[] = [];

  // Distribute proportionally, rounding down
  for (let i = 0; i < allocations.length; i++) {
    const allocation = allocations[i];
    let allocationCents: number;

    if (i === allocations.length - 1) {
      // Last allocation gets remaining amount to avoid rounding errors
      allocationCents = totalCents - distributedCents;
    } else {
      allocationCents = Math.floor((totalCents * allocation.weight) / totalWeight);
    }

    distributedCents += allocationCents;
    
    results.push({
      id: allocation.id,
      amount: fromCents(allocationCents)
    });
  }

  return results;
}

/**
 * Validates that a set of amounts sum to a total (within precision tolerance)
 */
export function validateSum(amounts: (string | number)[], expectedTotal: string | number): boolean {
  try {
    const totalCents = amounts.reduce((sum, amount) => sum + toCents(amount), 0);
    const expectedCents = toCents(expectedTotal);
    
    // Allow for small rounding differences (1 cent tolerance)
    return Math.abs(totalCents - expectedCents) <= 1;
  } catch {
    return false;
  }
}