import { createHash } from 'crypto';
import { Transaction, InsertTransaction, TransactionHash, InsertTransactionHash } from '@shared/schema';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingTransactionId?: number;
  hash: string;
}

export class DuplicateDetectionService {
  /**
   * Creates a hash for transaction deduplication based on key fields
   * Uses: date, amount, merchant, counterparty IBAN, reference
   */
  createTransactionHash(transaction: InsertTransaction | Transaction): string {
    // Create hash without accountId for import-time duplicate detection
    const hashInput = [
      transaction.date?.toISOString() || '',
      transaction.amount?.toString() || '',
      transaction.merchant || '',
      transaction.counterpartyIban || '',
      transaction.reference || '',
      transaction.statementId || '' // Use statementId instead of accountId for CAMT imports
    ].join('|');

    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Checks if a transaction already exists by comparing hashes
   */
  async checkForDuplicate(
    transaction: InsertTransaction,
    userId: number,
    existingHashes: TransactionHash[]
  ): Promise<DuplicateCheckResult> {
    const hash = this.createTransactionHash(transaction);
    
    const existingHash = existingHashes.find(h => h.hash === hash);
    
    return {
      isDuplicate: !!existingHash,
      existingTransactionId: existingHash?.transactionId,
      hash
    };
  }

  /**
   * Creates hash records for multiple transactions
   */
  createHashRecords(
    transactions: Transaction[],
    userId: number
  ): InsertTransactionHash[] {
    return transactions.map(transaction => ({
      userId,
      transactionId: transaction.id,
      hash: this.createTransactionHash(transaction)
    }));
  }

  /**
   * Filters out duplicate transactions from import batch
   */
  async filterDuplicates(
    transactions: any[],
    userId: number,
    existingHashes: TransactionHash[]
  ): Promise<{
    uniqueTransactions: any[];
    duplicateCount: number;
    duplicateHashes: string[];
  }> {
    const uniqueTransactions: InsertTransaction[] = [];
    const duplicateHashes: string[] = [];
    let duplicateCount = 0;

    for (const transaction of transactions) {
      const duplicateCheck = await this.checkForDuplicate(transaction, userId, existingHashes);
      
      if (duplicateCheck.isDuplicate) {
        duplicateCount++;
        duplicateHashes.push(duplicateCheck.hash);
      } else {
        uniqueTransactions.push(transaction);
      }
    }

    return {
      uniqueTransactions,
      duplicateCount,
      duplicateHashes
    };
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();