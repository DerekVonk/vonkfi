/**
 * Comprehensive tests for transfer validation edge cases
 * Tests all critical edge cases identified in the analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransferValidator, TransferValidationContext } from '../../server/validation/transferValidation';
import { Account, Goal, Transaction, TransferPreference } from '@shared/schema';

describe('Transfer Validation Edge Cases', () => {
  let validator: TransferValidator;
  let mockContext: TransferValidationContext;

  beforeEach(() => {
    validator = new TransferValidator();
    
    // Setup basic mock context
    mockContext = {
      userId: 1,
      accounts: [
        {
          id: 1,
          userId: 1,
          iban: 'NL91ABNA0417164300',
          role: 'income',
          balance: '5000.00',
          accountHolderName: 'Test User',
          customName: 'Main Account'
        },
        {
          id: 2,
          userId: 1,
          iban: 'NL92ABNA0417164301',
          role: 'savings',
          balance: '2000.00',
          accountHolderName: 'Test User',
          customName: 'Savings Account'
        }
      ] as Account[],
      goals: [
        {
          id: 1,
          userId: 1,
          name: 'Emergency Fund',
          targetAmount: '10000.00',
          currentAmount: '2000.00',
          priority: 1,
          isCompleted: false,
          linkedAccountId: 2
        }
      ] as Goal[],
      transactions: [
        {
          id: 1,
          accountId: 1,
          amount: '3000.00',
          description: 'Salary',
          date: '2025-06-01',
          transactionId: 'SAL001',
          type: 'credit',
          categoryId: 2,
          isIncome: true
        },
        {
          id: 2,
          accountId: 1,
          amount: '-1000.00',
          description: 'Rent',
          date: '2025-06-02',
          transactionId: 'RENT001',
          type: 'debit',
          categoryId: 3,
          isIncome: false
        }
      ] as Transaction[],
      transferPreferences: [] as TransferPreference[]
    };
  });

  describe('Account Validation Edge Cases', () => {
    it('should handle empty account list', async () => {
      const context = { ...mockContext, accounts: [] };
      const result = await validator.validateContext(context);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No accounts found for user');
    });

    it('should detect duplicate account IDs', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0] },
          { ...mockContext.accounts[0], iban: 'NL93DIFFERENT123456' } // Same ID, different IBAN
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate account ID'))).toBe(true);
    });

    it('should detect duplicate IBANs', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0] },
          { ...mockContext.accounts[0], id: 999 } // Different ID, same IBAN
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate IBAN'))).toBe(true);
    });

    it('should detect accounts not belonging to user', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], userId: 999 } // Different user
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('does not belong to user'))).toBe(true);
    });

    it('should warn about negative balances', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], balance: '-100.00' }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('negative balance'))).toBe(true);
    });

    it('should handle invalid balance formats', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], balance: 'invalid' }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid balance'))).toBe(true);
    });

    it('should warn when no income account exists', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], role: 'checking' },
          { ...mockContext.accounts[1] }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('No income account found'))).toBe(true);
    });
  });

  describe('Goal Validation Edge Cases', () => {
    it('should handle empty goals list', async () => {
      const context = { ...mockContext, goals: [] };
      const result = await validator.validateContext(context);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No goals found for user');
    });

    it('should detect goals with impossible states', async () => {
      const context = {
        ...mockContext,
        goals: [
          {
            ...mockContext.goals[0],
            currentAmount: '15000.00', // More than target
            targetAmount: '10000.00',
            isCompleted: false
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('current amount exceeds target'))).toBe(true);
    });

    it('should detect completed goals with incorrect amounts', async () => {
      const context = {
        ...mockContext,
        goals: [
          {
            ...mockContext.goals[0],
            currentAmount: '5000.00', // Less than target
            targetAmount: '10000.00',
            isCompleted: true
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('marked complete but current amount is less'))).toBe(true);
    });

    it('should detect goals linked to non-existent accounts', async () => {
      const context = {
        ...mockContext,
        goals: [
          {
            ...mockContext.goals[0],
            linkedAccountId: 999 // Non-existent account
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('linked to non-existent account'))).toBe(true);
    });

    it('should warn about past target dates for incomplete goals', async () => {
      const context = {
        ...mockContext,
        goals: [
          {
            ...mockContext.goals[0],
            targetDate: '2023-01-01', // Past date
            isCompleted: false
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('target date is in the past'))).toBe(true);
    });

    it('should handle invalid goal amounts', async () => {
      const context = {
        ...mockContext,
        goals: [
          {
            ...mockContext.goals[0],
            currentAmount: 'invalid',
            targetAmount: '-100.00'
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid current amount'))).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid target amount'))).toBe(true);
    });
  });

  describe('Transaction Validation Edge Cases', () => {
    it('should handle empty transaction list', async () => {
      const context = { ...mockContext, transactions: [] };
      const result = await validator.validateContext(context);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No transactions found');
    });

    it('should detect transactions referencing non-existent accounts', async () => {
      const context = {
        ...mockContext,
        transactions: [
          {
            ...mockContext.transactions[0],
            accountId: 999 // Non-existent account
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('references non-existent account'))).toBe(true);
    });

    it('should warn about future-dated transactions', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      
      const context = {
        ...mockContext,
        transactions: [
          {
            ...mockContext.transactions[0],
            date: futureDate.toISOString().split('T')[0]
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('future-dated transactions'))).toBe(true);
    });

    it('should detect invalid transaction amounts', async () => {
      const context = {
        ...mockContext,
        transactions: [
          {
            ...mockContext.transactions[0],
            amount: 'invalid'
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid amount'))).toBe(true);
    });

    it('should warn about duplicate transaction IDs', async () => {
      const context = {
        ...mockContext,
        transactions: [
          { ...mockContext.transactions[0], transactionId: 'DUPLICATE' },
          { ...mockContext.transactions[1], transactionId: 'DUPLICATE' }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('Duplicate transaction ID'))).toBe(true);
    });
  });

  describe('Data Consistency Validation', () => {
    it('should detect account balance mismatches', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], balance: '1000.00' } // Balance doesn't match transaction sum
        ],
        transactions: [
          { ...mockContext.transactions[0], amount: '3000.00' },
          { ...mockContext.transactions[1], amount: '-1000.00' }
          // Sum should be 2000.00, but balance is 1000.00
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes('balance mismatch'))).toBe(true);
    });

    it('should detect goal amount mismatches with linked accounts', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[1], balance: '3000.00' } // Account balance
        ],
        goals: [
          { 
            ...mockContext.goals[0], 
            currentAmount: '2000.00', // Goal amount doesn't match account
            linkedAccountId: 2 
          }
        ]
      };
      
      const result = await validator.validateContext(context);
      expect(result.warnings.some(w => w.includes("doesn't match linked account balance"))).toBe(true);
    });
  });

  describe('Transfer Request Validation', () => {
    it('should validate basic transfer requirements', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '100.00',
        purpose: 'Test transfer'
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.valid).toBe(true);
    });

    it('should reject self-transfers', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 1, // Same account
        amount: '100.00',
        purpose: 'Self transfer'
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot transfer to the same account');
    });

    it('should reject transfers with insufficient funds', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '10000.00', // More than account balance
        purpose: 'Large transfer'
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Insufficient funds'))).toBe(true);
    });

    it('should reject transfers to completed goals', async () => {
      const context = {
        ...mockContext,
        goals: [
          { ...mockContext.goals[0], isCompleted: true }
        ]
      };
      
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '100.00',
        purpose: 'Transfer to completed goal',
        goalId: 1
      };
      
      const result = await validator.validateTransferRequest(request, context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Cannot transfer to completed goal'))).toBe(true);
    });

    it('should warn when transfer would exceed goal target', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '9000.00', // Would exceed goal target when added to current
        purpose: 'Large goal transfer',
        goalId: 1
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.warnings.some(w => w.includes('would exceed goal target'))).toBe(true);
    });

    it('should warn about transfers that leave very low balance', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '4950.00', // Would leave 50.00 balance
        purpose: 'Almost all funds'
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.warnings.some(w => w.includes('very low balance'))).toBe(true);
    });

    it('should reject invalid transfer amounts', async () => {
      const invalidRequests = [
        { amount: '0.00', purpose: 'Zero amount' },
        { amount: '-100.00', purpose: 'Negative amount' },
        { amount: 'invalid', purpose: 'Invalid amount' },
        { amount: '', purpose: 'Empty amount' }
      ];
      
      for (const invalidData of invalidRequests) {
        const request = {
          fromAccountId: 1,
          toAccountId: 2,
          ...invalidData
        };
        
        const result = await validator.validateTransferRequest(request, mockContext);
        expect(result.valid).toBe(false);
      }
    });

    it('should reject transfers with missing or empty purpose', async () => {
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '100.00',
        purpose: ''
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Transfer purpose is required');
    });

    it('should reject transfers with invalid account IDs', async () => {
      const request = {
        fromAccountId: 999, // Non-existent
        toAccountId: 2,
        amount: '100.00',
        purpose: 'Test'
      };
      
      const result = await validator.validateTransferRequest(request, mockContext);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not found'))).toBe(true);
    });
  });

  describe('Business Logic Validation', () => {
    it('should enforce daily transfer limits', async () => {
      // Mock context with many recent transfers
      const today = new Date().toISOString().split('T')[0];
      const manyTransfers = Array.from({ length: 10 }, (_, i) => ({
        id: i + 100,
        accountId: 1,
        amount: '10000.00',
        description: `Large transfer ${i}`,
        date: today,
        transactionId: `TRANSFER_${i}`,
        type: 'debit',
        reference: `INTERNAL_TRANSFER_${i}`,
        isIncome: false
      }));
      
      const context = {
        ...mockContext,
        transactions: [...mockContext.transactions, ...manyTransfers]
      };
      
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '50000.00', // Would exceed daily limit
        purpose: 'Large transfer'
      };
      
      const result = await validator.validateTransferRequest(request, context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('daily limit'))).toBe(true);
    });

    it('should warn about unusual transfer patterns', async () => {
      const context = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], role: 'emergency' },
          { ...mockContext.accounts[1], role: 'investment' }
        ]
      };
      
      const request = {
        fromAccountId: 1, // Emergency account
        toAccountId: 2,   // Investment account
        amount: '1000.00',
        purpose: 'Emergency to investment'
      };
      
      const result = await validator.validateTransferRequest(request, context);
      expect(result.warnings.some(w => w.includes('emergency fund to investment'))).toBe(true);
    });
  });

  describe('Concurrent Access Edge Cases', () => {
    it('should handle validation when accounts are modified during validation', async () => {
      // This test simulates a race condition scenario
      const request = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: '100.00',
        purpose: 'Concurrent test'
      };
      
      // First validation should pass
      const result1 = await validator.validateTransferRequest(request, mockContext);
      expect(result1.valid).toBe(true);
      
      // Simulate account balance change during validation
      const modifiedContext = {
        ...mockContext,
        accounts: [
          { ...mockContext.accounts[0], balance: '50.00' }, // Reduced balance
          ...mockContext.accounts.slice(1)
        ]
      };
      
      // Second validation should fail due to insufficient funds
      const result2 = await validator.validateTransferRequest(request, modifiedContext);
      expect(result2.valid).toBe(false);
      expect(result2.errors.some(e => e.includes('Insufficient funds'))).toBe(true);
    });
  });

  describe('Transfer Preferences Validation', () => {
    it('should validate transfer preferences with invalid regex patterns', async () => {
      const context = {
        ...mockContext,
        transferPreferences: [
          {
            id: 1,
            userId: 1,
            preferenceType: 'goal',
            priority: 1,
            goalPattern: '[invalid regex', // Invalid regex
            isActive: true
          }
        ] as TransferPreference[]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid regex pattern'))).toBe(true);
    });

    it('should warn about preferences referencing non-existent accounts', async () => {
      const context = {
        ...mockContext,
        transferPreferences: [
          {
            id: 1,
            userId: 1,
            preferenceType: 'buffer',
            priority: 1,
            accountId: 999, // Non-existent account
            isActive: true
          }
        ] as TransferPreference[]
      };
      
      const result = await validator.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-existent account'))).toBe(true);
    });
  });
});