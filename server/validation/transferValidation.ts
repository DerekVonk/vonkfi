/**
 * Comprehensive validation layer for transfer recommendations
 * Handles all edge cases and ensures data integrity
 */

import { Account, Goal, Transaction, TransferPreference } from '@shared/schema';
import { validateTransferAmount, compareCurrency, addCurrency, subtractCurrency } from '../utils/currencyUtils';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TransferValidationContext {
  userId: number;
  accounts: Account[];
  goals: Goal[];
  transactions: Transaction[];
  transferPreferences: TransferPreference[];
}

export interface TransferRequest {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  purpose: string;
  goalId?: number;
}

/**
 * Main validation class for transfer operations
 */
export class TransferValidator {
  private readonly MAX_RECOMMENDATIONS_PER_USER = 50;
  private readonly MAX_DAILY_TRANSFER_LIMIT = 100000; // €100,000
  private readonly MAX_CONCURRENT_VALIDATIONS = 10;

  /**
   * Validates a complete transfer recommendation context
   */
  async validateContext(context: TransferValidationContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Validate user ID
      if (!context.userId || context.userId <= 0) {
        errors.push('Invalid user ID');
      }

      // 2. Validate accounts
      const accountValidation = this.validateAccounts(context.accounts, context.userId);
      errors.push(...accountValidation.errors);
      warnings.push(...accountValidation.warnings);

      // 3. Validate goals
      const goalValidation = this.validateGoals(context.goals, context.accounts, context.userId);
      errors.push(...goalValidation.errors);
      warnings.push(...goalValidation.warnings);

      // 4. Validate transactions
      const transactionValidation = this.validateTransactions(context.transactions, context.accounts);
      errors.push(...transactionValidation.errors);
      warnings.push(...transactionValidation.warnings);

      // 5. Validate data consistency
      const consistencyValidation = this.validateDataConsistency(context);
      errors.push(...consistencyValidation.errors);
      warnings.push(...consistencyValidation.warnings);

      // 6. Validate transfer preferences
      const preferencesValidation = this.validateTransferPreferences(context.transferPreferences, context.accounts, context.goals);
      errors.push(...preferencesValidation.errors);
      warnings.push(...preferencesValidation.warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Validates a specific transfer request
   */
  async validateTransferRequest(request: TransferRequest, context: TransferValidationContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Basic transfer validation
      const basicValidation = this.validateBasicTransfer(request);
      errors.push(...basicValidation.errors);
      warnings.push(...basicValidation.warnings);

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // 2. Account existence and ownership
      const accountValidation = this.validateTransferAccounts(request, context);
      errors.push(...accountValidation.errors);
      warnings.push(...accountValidation.warnings);

      // 3. Sufficient funds validation
      const fundsValidation = this.validateSufficientFunds(request, context);
      errors.push(...fundsValidation.errors);
      warnings.push(...fundsValidation.warnings);

      // 4. Goal-specific validation
      if (request.goalId) {
        const goalValidation = this.validateGoalTransfer(request, context);
        errors.push(...goalValidation.errors);
        warnings.push(...goalValidation.warnings);
      }

      // 5. Business logic validation
      const businessValidation = this.validateBusinessLogic(request, context);
      errors.push(...businessValidation.errors);
      warnings.push(...businessValidation.warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Transfer validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Validates account data integrity
   */
  private validateAccounts(accounts: Account[], userId: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!accounts || accounts.length === 0) {
      errors.push('No accounts found for user');
      return { valid: false, errors, warnings };
    }

    const seenIbans = new Set<string>();
    const seenIds = new Set<number>();
    let hasIncomeAccount = false;

    for (const account of accounts) {
      // Check for duplicate IDs
      if (seenIds.has(account.id)) {
        errors.push(`Duplicate account ID: ${account.id}`);
      }
      seenIds.add(account.id);

      // Check for duplicate IBANs
      if (account.iban) {
        if (seenIbans.has(account.iban)) {
          errors.push(`Duplicate IBAN: ${account.iban}`);
        }
        seenIbans.add(account.iban);
      }

      // Validate user ownership
      if (account.userId !== userId) {
        errors.push(`Account ${account.id} does not belong to user ${userId}`);
      }

      // Validate balance
      const balanceValidation = validateTransferAmount(account.balance || '0');
      if (!balanceValidation.valid) {
        errors.push(`Invalid balance for account ${account.id}: ${balanceValidation.error}`);
      }

      // Check for negative balances (warning)
      if (parseFloat(account.balance || '0') < 0) {
        warnings.push(`Account ${account.id} has negative balance: ${account.balance}`);
      }

      // Check for income account
      if (account.role === 'income') {
        hasIncomeAccount = true;
      }

      // Validate account role
      const validRoles = ['income', 'savings', 'emergency', 'investment', 'goal-specific', 'checking', 'vaste_lasten'];
      if (account.role && !validRoles.includes(account.role)) {
        warnings.push(`Unknown account role: ${account.role} for account ${account.id}`);
      }
    }

    if (!hasIncomeAccount) {
      warnings.push('No income account found - recommendations may be limited');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates goal data integrity
   */
  private validateGoals(goals: Goal[], accounts: Account[], userId: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!goals || goals.length === 0) {
      warnings.push('No goals found for user');
      return { valid: true, errors, warnings };
    }

    const seenIds = new Set<number>();
    const accountIds = new Set(accounts.map(a => a.id));

    for (const goal of goals) {
      // Check for duplicate IDs
      if (seenIds.has(goal.id)) {
        errors.push(`Duplicate goal ID: ${goal.id}`);
      }
      seenIds.add(goal.id);

      // Validate user ownership
      if (goal.userId !== userId) {
        errors.push(`Goal ${goal.id} does not belong to user ${userId}`);
      }

      // Validate amounts
      const currentAmount = parseFloat(goal.currentAmount || '0');
      const targetAmount = parseFloat(goal.targetAmount || '0');

      if (isNaN(currentAmount) || currentAmount < 0) {
        errors.push(`Invalid current amount for goal ${goal.id}: ${goal.currentAmount}`);
      }

      if (isNaN(targetAmount) || targetAmount <= 0) {
        errors.push(`Invalid target amount for goal ${goal.id}: ${goal.targetAmount}`);
      }

      // Check for impossible states
      if (currentAmount > targetAmount && !goal.isCompleted) {
        warnings.push(`Goal ${goal.id} current amount exceeds target but is not marked complete`);
      }

      if (goal.isCompleted && currentAmount < targetAmount) {
        warnings.push(`Goal ${goal.id} marked complete but current amount is less than target`);
      }

      // Validate linked account
      if (goal.linkedAccountId) {
        if (!accountIds.has(goal.linkedAccountId)) {
          errors.push(`Goal ${goal.id} linked to non-existent account ${goal.linkedAccountId}`);
        }
      }

      // Validate target date
      if (goal.targetDate) {
        const targetDate = new Date(goal.targetDate);
        const now = new Date();
        
        if (targetDate < now && !goal.isCompleted) {
          warnings.push(`Goal ${goal.id} target date is in the past but goal is not complete`);
        }
      }

      // Validate priority
      if (goal.priority !== undefined && (goal.priority < 1 || goal.priority > 10)) {
        warnings.push(`Goal ${goal.id} has unusual priority value: ${goal.priority}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates transaction data integrity
   */
  private validateTransactions(transactions: Transaction[], accounts: Account[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!transactions || transactions.length === 0) {
      warnings.push('No transactions found');
      return { valid: true, errors, warnings };
    }

    const accountIds = new Set(accounts.map(a => a.id));
    const seenTransactionIds = new Set<string>();
    const futureTransactions = [];
    const now = new Date();

    for (const transaction of transactions) {
      // Check for duplicate transaction IDs
      if (transaction.transactionId) {
        if (seenTransactionIds.has(transaction.transactionId)) {
          warnings.push(`Duplicate transaction ID: ${transaction.transactionId}`);
        }
        seenTransactionIds.add(transaction.transactionId);
      }

      // Validate account reference
      if (!accountIds.has(transaction.accountId)) {
        errors.push(`Transaction ${transaction.id} references non-existent account ${transaction.accountId}`);
      }

      // Validate amount
      if (!transaction.amount || isNaN(parseFloat(transaction.amount))) {
        errors.push(`Transaction ${transaction.id} has invalid amount: ${transaction.amount}`);
      }

      // Check for future-dated transactions
      const transactionDate = new Date(transaction.date);
      if (transactionDate > now) {
        futureTransactions.push(transaction.id);
      }

      // Validate required fields
      if (!transaction.description) {
        warnings.push(`Transaction ${transaction.id} missing description`);
      }

      if (!transaction.date) {
        errors.push(`Transaction ${transaction.id} missing date`);
      }
    }

    if (futureTransactions.length > 0) {
      warnings.push(`Found ${futureTransactions.length} future-dated transactions`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates data consistency across entities
   */
  private validateDataConsistency(context: TransferValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Validate account balances vs transaction sums
      for (const account of context.accounts) {
        const accountTransactions = context.transactions.filter(t => t.accountId === account.id);
        
        if (accountTransactions.length > 0) {
          const calculatedBalance = accountTransactions.reduce((sum, t) => {
            try {
              return addCurrency(sum, t.amount);
            } catch {
              return sum; // Skip invalid transactions
            }
          }, '0');

          const actualBalance = account.balance || '0';
          
          if (compareCurrency(calculatedBalance, actualBalance) !== 0) {
            const difference = Math.abs(parseFloat(calculatedBalance) - parseFloat(actualBalance));
            if (difference > 0.01) { // Allow for minor rounding differences
              warnings.push(`Account ${account.id} balance mismatch: calculated ${calculatedBalance}, actual ${actualBalance}`);
            }
          }
        }
      }

      // 2. Validate goal current amounts vs linked account balances
      for (const goal of context.goals) {
        if (goal.linkedAccountId) {
          const linkedAccount = context.accounts.find(a => a.id === goal.linkedAccountId);
          if (linkedAccount) {
            const goalAmount = goal.currentAmount || '0';
            const accountBalance = linkedAccount.balance || '0';
            
            if (compareCurrency(goalAmount, accountBalance) !== 0) {
              warnings.push(`Goal ${goal.id} amount (${goalAmount}) doesn't match linked account balance (${accountBalance})`);
            }
          }
        }
      }

      // 3. Check for orphaned data
      const goalAccountIds = new Set(context.goals.filter(g => g.linkedAccountId).map(g => g.linkedAccountId));
      const accountIds = new Set(context.accounts.map(a => a.id));
      
      for (const goalAccountId of goalAccountIds) {
        if (!accountIds.has(goalAccountId!)) {
          errors.push(`Goal references non-existent account: ${goalAccountId}`);
        }
      }

    } catch (error) {
      errors.push(`Data consistency check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates transfer preferences
   */
  private validateTransferPreferences(preferences: TransferPreference[], accounts: Account[], goals: Goal[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!preferences || preferences.length === 0) {
      warnings.push('No transfer preferences configured');
      return { valid: true, errors, warnings };
    }

    const accountIds = new Set(accounts.map(a => a.id));
    const accountRoles = new Set(accounts.map(a => a.role).filter(Boolean));

    for (const pref of preferences) {
      // Validate account references
      if (pref.accountId && !accountIds.has(pref.accountId)) {
        errors.push(`Transfer preference ${pref.id} references non-existent account ${pref.accountId}`);
      }

      // Validate account roles
      if (pref.accountRole && !accountRoles.has(pref.accountRole)) {
        warnings.push(`Transfer preference ${pref.id} uses unknown account role: ${pref.accountRole}`);
      }

      // Validate goal patterns
      if (pref.goalPattern) {
        try {
          new RegExp(pref.goalPattern, 'i');
        } catch {
          errors.push(`Transfer preference ${pref.id} has invalid regex pattern: ${pref.goalPattern}`);
        }
      }

      // Validate priority
      if (pref.priority !== undefined && (pref.priority < 1 || pref.priority > 10)) {
        warnings.push(`Transfer preference ${pref.id} has unusual priority: ${pref.priority}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates basic transfer request fields
   */
  private validateBasicTransfer(request: TransferRequest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate amount
    const amountValidation = validateTransferAmount(request.amount);
    if (!amountValidation.valid) {
      errors.push(amountValidation.error!);
    }

    // Validate account IDs
    if (!request.fromAccountId || request.fromAccountId <= 0) {
      errors.push('Invalid source account ID');
    }

    if (!request.toAccountId || request.toAccountId <= 0) {
      errors.push('Invalid destination account ID');
    }

    // Self-transfer check
    if (request.fromAccountId === request.toAccountId) {
      errors.push('Cannot transfer to the same account');
    }

    // Validate purpose
    if (!request.purpose || request.purpose.trim().length === 0) {
      errors.push('Transfer purpose is required');
    }

    if (request.purpose && request.purpose.length > 255) {
      warnings.push('Transfer purpose is very long');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates transfer accounts exist and belong to user
   */
  private validateTransferAccounts(request: TransferRequest, context: TransferValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const sourceAccount = context.accounts.find(a => a.id === request.fromAccountId);
    const destAccount = context.accounts.find(a => a.id === request.toAccountId);

    if (!sourceAccount) {
      errors.push(`Source account ${request.fromAccountId} not found`);
    } else if (sourceAccount.userId !== context.userId) {
      errors.push(`Source account ${request.fromAccountId} does not belong to user`);
    }

    if (!destAccount) {
      errors.push(`Destination account ${request.toAccountId} not found`);
    } else if (destAccount.userId !== context.userId) {
      errors.push(`Destination account ${request.toAccountId} does not belong to user`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates sufficient funds for transfer
   */
  private validateSufficientFunds(request: TransferRequest, context: TransferValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const sourceAccount = context.accounts.find(a => a.id === request.fromAccountId);
    
    if (sourceAccount) {
      const currentBalance = sourceAccount.balance || '0';
      
      if (compareCurrency(currentBalance, request.amount) < 0) {
        errors.push(`Insufficient funds: balance ${currentBalance}, requested ${request.amount}`);
      }

      // Warning for large transfers
      const balanceAfterTransfer = subtractCurrency(currentBalance, request.amount);
      if (compareCurrency(balanceAfterTransfer, '100') < 0) {
        warnings.push('Transfer would leave account with very low balance');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates goal-specific transfer logic
   */
  private validateGoalTransfer(request: TransferRequest, context: TransferValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!request.goalId) {
      return { valid: true, errors, warnings };
    }

    const goal = context.goals.find(g => g.id === request.goalId);
    
    if (!goal) {
      errors.push(`Goal ${request.goalId} not found`);
      return { valid: false, errors, warnings };
    }

    if (goal.userId !== context.userId) {
      errors.push(`Goal ${request.goalId} does not belong to user`);
      return { valid: false, errors, warnings };
    }

    if (goal.isCompleted) {
      errors.push(`Cannot transfer to completed goal ${request.goalId}`);
    }

    // Check if transfer would exceed goal target
    const currentAmount = parseFloat(goal.currentAmount || '0');
    const targetAmount = parseFloat(goal.targetAmount || '0');
    const transferAmount = parseFloat(request.amount);
    
    if (currentAmount + transferAmount > targetAmount) {
      warnings.push(`Transfer would exceed goal target by €${(currentAmount + transferAmount - targetAmount).toFixed(2)}`);
    }

    // Check if goal has linked account and transfer destination matches
    if (goal.linkedAccountId && goal.linkedAccountId !== request.toAccountId) {
      warnings.push(`Transfer destination doesn't match goal's linked account`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates business logic and constraints
   */
  private validateBusinessLogic(request: TransferRequest, context: TransferValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check daily transfer limits per user
    const today = new Date().toISOString().split('T')[0];
    const todayTransactions = context.transactions.filter(t => 
      t.date.startsWith(today) && 
      t.reference?.startsWith('INTERNAL_TRANSFER_') &&
      parseFloat(t.amount) > 0 // Only count outgoing transfers
    );

    const dailyTransferTotal = todayTransactions.reduce((sum, t) => {
      try {
        return addCurrency(sum, t.amount);
      } catch {
        return sum;
      }
    }, '0');

    const projectedTotal = addCurrency(dailyTransferTotal, request.amount);
    
    if (compareCurrency(projectedTotal, this.MAX_DAILY_TRANSFER_LIMIT.toString()) > 0) {
      errors.push(`Transfer would exceed daily limit of €${this.MAX_DAILY_TRANSFER_LIMIT}`);
    }

    // Validate account role compatibility
    const sourceAccount = context.accounts.find(a => a.id === request.fromAccountId);
    const destAccount = context.accounts.find(a => a.id === request.toAccountId);

    if (sourceAccount && destAccount) {
      // Warn about unusual transfer patterns
      if (sourceAccount.role === 'emergency' && destAccount.role === 'investment') {
        warnings.push('Transferring from emergency fund to investment account');
      }

      if (sourceAccount.role === 'savings' && destAccount.role === 'checking' && parseFloat(request.amount) > 1000) {
        warnings.push('Large transfer from savings to checking account');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}