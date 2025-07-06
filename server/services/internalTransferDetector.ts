import { Transaction, Account } from '../../shared/schema';

export interface TransferDetectionResult {
  isInternalTransfer: boolean;
  matchedTransactionId?: number;
  confidence: 'high' | 'medium' | 'low';
  detectionMethod: 'reference' | 'iban' | 'amount_date' | 'description';
  transferFee?: number;
}

export interface TransferDetectionConfig {
  amountToleranceEur: number; // Default: 5.00
  timeWindowDays: number; // Default: 3
  minimumConfidence: 'high' | 'medium' | 'low'; // Default: 'medium'
  enableDescriptionMatching: boolean; // Default: true
  enableFuzzyMatching: boolean; // Default: true
}

export class InternalTransferDetector {
  private config: TransferDetectionConfig;

  constructor(config: Partial<TransferDetectionConfig> = {}) {
    this.config = {
      amountToleranceEur: 5.00,
      timeWindowDays: 3,
      minimumConfidence: 'medium',
      enableDescriptionMatching: true,
      enableFuzzyMatching: true,
      ...config
    };
  }

  detectInternalTransfer(
    transaction: Transaction,
    userAccounts: Account[],
    recentTransactions: Transaction[]
  ): TransferDetectionResult {
    // Method 1: Reference Pattern Detection (highest confidence)
    const referenceResult = this.detectByReference(transaction);
    if (referenceResult.isInternalTransfer) {
      return referenceResult;
    }

    // Method 2: Counterparty IBAN Matching (high confidence)
    const ibanResult = this.detectByCounterpartyIban(transaction, userAccounts);
    if (ibanResult.isInternalTransfer) {
      return ibanResult;
    }

    // Method 3: Amount + Date Matching (medium confidence)
    const amountDateResult = this.detectByAmountAndDate(transaction, recentTransactions);
    if (amountDateResult.isInternalTransfer) {
      return amountDateResult;
    }

    // Method 4: Description Analysis (low confidence)
    if (this.config.enableDescriptionMatching) {
      const descriptionResult = this.detectByDescription(transaction, userAccounts);
      if (descriptionResult.isInternalTransfer) {
        return descriptionResult;
      }
    }

    // No internal transfer detected
    return {
      isInternalTransfer: false,
      confidence: 'high',
      detectionMethod: 'reference'
    };
  }

  private detectByReference(transaction: Transaction): TransferDetectionResult {
    if (!transaction.reference) {
      return { isInternalTransfer: false, confidence: 'high', detectionMethod: 'reference' };
    }

    // Check for INTERNAL_TRANSFER_* patterns
    const internalTransferPattern = /INTERNAL_TRANSFER_\d+/i;
    if (internalTransferPattern.test(transaction.reference)) {
      return {
        isInternalTransfer: true,
        confidence: 'high',
        detectionMethod: 'reference'
      };
    }

    return { isInternalTransfer: false, confidence: 'high', detectionMethod: 'reference' };
  }

  private detectByCounterpartyIban(transaction: Transaction, userAccounts: Account[]): TransferDetectionResult {
    if (!transaction.counterpartyIban) {
      return { isInternalTransfer: false, confidence: 'high', detectionMethod: 'iban' };
    }

    // Check if counterparty IBAN matches any of the user's account IBANs
    const matchingAccount = userAccounts.find(account => 
      account.iban === transaction.counterpartyIban
    );

    if (matchingAccount) {
      return {
        isInternalTransfer: true,
        confidence: 'high',
        detectionMethod: 'iban'
      };
    }

    return { isInternalTransfer: false, confidence: 'high', detectionMethod: 'iban' };
  }

  private detectByAmountAndDate(transaction: Transaction, recentTransactions: Transaction[]): TransferDetectionResult {
    const matchingTransaction = this.findMatchingTransfer(transaction, recentTransactions);
    
    if (matchingTransaction) {
      const transferFee = this.calculateTransferFee(
        Math.abs(parseFloat(transaction.amount.toString())),
        Math.abs(parseFloat(matchingTransaction.amount.toString()))
      );

      return {
        isInternalTransfer: true,
        matchedTransactionId: matchingTransaction.id,
        confidence: 'medium',
        detectionMethod: 'amount_date',
        transferFee: transferFee > 0 ? transferFee : undefined
      };
    }

    return { isInternalTransfer: false, confidence: 'medium', detectionMethod: 'amount_date' };
  }

  private detectByDescription(transaction: Transaction, userAccounts: Account[]): TransferDetectionResult {
    if (!transaction.description) {
      return { isInternalTransfer: false, confidence: 'low', detectionMethod: 'description' };
    }

    const description = transaction.description.toLowerCase();
    
    // Check for transfer keywords
    const transferKeywords = ['transfer', 'internal', 'overschrijving', 'overboeking'];
    const hasTransferKeyword = transferKeywords.some(keyword => description.includes(keyword));

    if (!hasTransferKeyword) {
      return { isInternalTransfer: false, confidence: 'low', detectionMethod: 'description' };
    }

    // Check for account names or custom names in description
    const accountMatch = userAccounts.some(account => {
      const accountName = account.accountHolderName?.toLowerCase();
      const customName = account.customName?.toLowerCase();
      const bankName = account.bankName?.toLowerCase();
      
      return (accountName && description.includes(accountName)) ||
             (customName && description.includes(customName)) ||
             (bankName && description.includes(bankName));
    });

    if (accountMatch) {
      return {
        isInternalTransfer: true,
        confidence: 'low',
        detectionMethod: 'description'
      };
    }

    return { isInternalTransfer: false, confidence: 'low', detectionMethod: 'description' };
  }

  findMatchingTransfer(transaction: Transaction, candidates: Transaction[]): Transaction | null {
    const transactionAmount = Math.abs(parseFloat(transaction.amount.toString()));
    const transactionDate = new Date(transaction.date);
    
    // Look for opposite amount within time window
    for (const candidate of candidates) {
      // Skip same transaction
      if (candidate.id === transaction.id) continue;
      
      // Skip transactions from same account
      if (candidate.accountId === transaction.accountId) continue;
      
      const candidateAmount = Math.abs(parseFloat(candidate.amount.toString()));
      const candidateDate = new Date(candidate.date);
      
      // Check if amounts are opposite signs (one positive, one negative)
      const transactionSign = parseFloat(transaction.amount.toString()) > 0 ? 1 : -1;
      const candidateSign = parseFloat(candidate.amount.toString()) > 0 ? 1 : -1;
      
      if (transactionSign === candidateSign) continue;
      
      // Check date window
      const timeDiff = Math.abs(candidateDate.getTime() - transactionDate.getTime());
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      if (daysDiff > this.config.timeWindowDays) continue;
      
      // Check amount match (with tolerance for fees)
      const amountDiff = Math.abs(transactionAmount - candidateAmount);
      
      if (this.config.enableFuzzyMatching && amountDiff <= this.config.amountToleranceEur) {
        return candidate;
      } else if (!this.config.enableFuzzyMatching && amountDiff === 0) {
        return candidate;
      }
    }
    
    return null;
  }

  calculateTransferFee(outgoingAmount: number, incomingAmount: number): number {
    return Math.abs(outgoingAmount - incomingAmount);
  }

  // Helper method to check if detection result meets minimum confidence threshold
  isConfidenceAcceptable(result: TransferDetectionResult): boolean {
    const confidenceLevel = { 'low': 1, 'medium': 2, 'high': 3 };
    const minLevel = confidenceLevel[this.config.minimumConfidence];
    const resultLevel = confidenceLevel[result.confidence];
    
    return resultLevel >= minLevel;
  }

  // Batch processing method for efficient detection on large datasets
  async detectBatchTransfers(
    transactions: Transaction[],
    userAccounts: Account[]
  ): Promise<Map<number, TransferDetectionResult>> {
    const results = new Map<number, TransferDetectionResult>();
    
    // Sort transactions by date for efficient lookup
    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    for (const transaction of sortedTransactions) {
      // Get recent transactions for context (within time window)
      const recentTransactions = this.getRecentTransactionsWindow(
        transaction, 
        sortedTransactions
      );
      
      const result = this.detectInternalTransfer(
        transaction,
        userAccounts,
        recentTransactions
      );
      
      if (result.isInternalTransfer && this.isConfidenceAcceptable(result)) {
        results.set(transaction.id, result);
      }
    }
    
    return results;
  }

  private getRecentTransactionsWindow(
    transaction: Transaction,
    allTransactions: Transaction[]
  ): Transaction[] {
    const transactionDate = new Date(transaction.date);
    const windowStart = new Date(transactionDate.getTime() - (this.config.timeWindowDays * 24 * 60 * 60 * 1000));
    const windowEnd = new Date(transactionDate.getTime() + (this.config.timeWindowDays * 24 * 60 * 60 * 1000));
    
    return allTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= windowStart && tDate <= windowEnd;
    });
  }
}