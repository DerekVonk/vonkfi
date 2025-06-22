/**
 * Utility types and functions for handling common TypeScript patterns
 * used throughout the VonkFi application
 */

// Null-safe number parsing utility
export function safeParseFloat(value: string | number | null | undefined, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Currency formatting utility that handles null values
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'EUR',
  locale: string = 'en-EU'
): string {
  const num = safeParseFloat(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(num);
}

// Type guard for checking if a value is not null or undefined
export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Safe array iteration for Map.entries() when downlevelIteration is not available
export function safeMapEntries<K, V>(map: Map<K, V>): [K, V][] {
  return Array.from(map.entries());
}

// Status handling utilities for common enum-like string properties
export type StatusType = string | null | undefined;

export function getStatusColor(status: StatusType, defaultClass: string = 'bg-gray-100 text-gray-800'): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'in_progress': return 'bg-blue-100 text-blue-800';
    case 'failed':
    case 'error': return 'bg-red-100 text-red-800';
    case 'skipped': return 'bg-gray-100 text-gray-800';
    default: return defaultClass;
  }
}

// Account type handling
export function getAccountDisplayName(account: { customName?: string | null; accountHolderName?: string }): string {
  return account.customName || account.accountHolderName || 'Unknown Account';
}

// Session type extensions (can be imported where needed)
export interface ExtendedSessionData {
  userId?: number;
  username?: string;
  loginTime?: Date;
  csrfToken?: string;
}