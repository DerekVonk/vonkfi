import { describe, it, expect } from 'vitest';
import { InternalTransferDetector } from '../../server/services/internalTransferDetector';
import { Transaction, Account } from '../../shared/schema';

describe('InternalTransferDetector', () => {
  let detector: InternalTransferDetector;
  let mockUserAccounts: Account[];
  let mockTransactions: Transaction[];

  beforeEach(() => {
    detector = new InternalTransferDetector();
    
    mockUserAccounts = [
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

    mockTransactions = [];
  });

  describe('detectByReference', () => {
    it('should detect internal transfer by INTERNAL_TRANSFER_ reference pattern', () => {
      const transaction: Transaction = {
        id: 1,
        accountId: 1,
        date: new Date(),
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'INTERNAL_TRANSFER_001',
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
      } as Transaction;

      const result = detector.detectInternalTransfer(transaction, mockUserAccounts, []);
      
      expect(result.isInternalTransfer).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.detectionMethod).toBe('reference');
    });
  });

  describe('detectByCounterpartyIban', () => {
    it('should detect internal transfer when counterparty IBAN matches user account', () => {
      const transaction: Transaction = {
        id: 1,
        accountId: 1,
        date: new Date(),
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'TRF123456',
        counterpartyIban: 'NL32RABO0300065264', // Matches second account
        counterpartyName: 'John Doe',
        merchant: null,
        categoryId: null,
        statementId: null,
        transactionType: 'transfer',
        isInternalTransfer: false,
        matchedTransferId: null,
        transferDetectionConfidence: null,
        transferFee: null
      } as Transaction;

      const result = detector.detectInternalTransfer(transaction, mockUserAccounts, []);
      
      expect(result.isInternalTransfer).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.detectionMethod).toBe('iban');
    });
  });

  describe('detectByAmountAndDate', () => {
    it('should detect internal transfer by matching opposite amounts within time window', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const outgoingTransaction: Transaction = {
        id: 1,
        accountId: 1,
        date: date,
        amount: '-500.00',
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const incomingTransaction: Transaction = {
        id: 2,
        accountId: 2,
        date: new Date('2024-01-15T10:05:00Z'), // Same day, 5 minutes later
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer from checking',
        isIncome: true,
        reference: 'TRF123456',
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
      } as Transaction;

      const allTransactions = [outgoingTransaction, incomingTransaction];
      
      const result = detector.detectInternalTransfer(outgoingTransaction, mockUserAccounts, allTransactions);
      
      expect(result.isInternalTransfer).toBe(true);
      expect(result.confidence).toBe('medium');
      expect(result.detectionMethod).toBe('amount_date');
      expect(result.matchedTransactionId).toBe(2);
    });

    it('should detect internal transfer with small fee difference', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const outgoingTransaction: Transaction = {
        id: 1,
        accountId: 1,
        date: date,
        amount: '-502.50', // €500 + €2.50 fee
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const incomingTransaction: Transaction = {
        id: 2,
        accountId: 2,
        date: new Date('2024-01-15T10:05:00Z'),
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer from checking',
        isIncome: true,
        reference: 'TRF123456',
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
      } as Transaction;

      const allTransactions = [outgoingTransaction, incomingTransaction];
      
      const result = detector.detectInternalTransfer(outgoingTransaction, mockUserAccounts, allTransactions);
      
      expect(result.isInternalTransfer).toBe(true);
      expect(result.confidence).toBe('medium');
      expect(result.detectionMethod).toBe('amount_date');
      expect(result.matchedTransactionId).toBe(2);
      expect(result.transferFee).toBe(2.50);
    });

    it('should not detect transfer when amounts are too different', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const outgoingTransaction: Transaction = {
        id: 1,
        accountId: 1,
        date: date,
        amount: '-500.00',
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const incomingTransaction: Transaction = {
        id: 2,
        accountId: 2,
        date: new Date('2024-01-15T10:05:00Z'),
        amount: '490.00', // €10 difference, exceeds default tolerance of €5
        currency: 'EUR',
        description: 'Transfer from checking',
        isIncome: true,
        reference: 'TRF123456',
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
      } as Transaction;

      const allTransactions = [outgoingTransaction, incomingTransaction];
      
      const result = detector.detectInternalTransfer(outgoingTransaction, mockUserAccounts, allTransactions);
      
      expect(result.isInternalTransfer).toBe(false);
    });

    it('should not detect transfer when time window is exceeded', () => {
      const outgoingTransaction: Transaction = {
        id: 1,
        accountId: 1,
        date: new Date('2024-01-15T10:00:00Z'),
        amount: '-500.00',
        currency: 'EUR',
        description: 'Transfer to savings',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const incomingTransaction: Transaction = {
        id: 2,
        accountId: 2,
        date: new Date('2024-01-20T10:00:00Z'), // 5 days later, exceeds 3-day window
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer from checking',
        isIncome: true,
        reference: 'TRF123456',
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
      } as Transaction;

      const allTransactions = [outgoingTransaction, incomingTransaction];
      
      const result = detector.detectInternalTransfer(outgoingTransaction, mockUserAccounts, allTransactions);
      
      expect(result.isInternalTransfer).toBe(false);
    });
  });

  describe('detectByDescription', () => {
    it('should detect internal transfer by description keywords and account names', () => {
      const transaction: Transaction = {
        id: 1,
        accountId: 1,
        date: new Date(),
        amount: '500.00',
        currency: 'EUR',
        description: 'Transfer to Rabobank account',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const result = detector.detectInternalTransfer(transaction, mockUserAccounts, []);
      
      expect(result.isInternalTransfer).toBe(true);
      expect(result.confidence).toBe('low');
      expect(result.detectionMethod).toBe('description');
    });

    it('should not detect transfer without transfer keywords', () => {
      const transaction: Transaction = {
        id: 1,
        accountId: 1,
        date: new Date(),
        amount: '500.00',
        currency: 'EUR',
        description: 'Payment for groceries at Rabobank',
        isIncome: false,
        reference: 'TRF123456',
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
      } as Transaction;

      const result = detector.detectInternalTransfer(transaction, mockUserAccounts, []);
      
      expect(result.isInternalTransfer).toBe(false);
    });
  });

  describe('calculateTransferFee', () => {
    it('should calculate transfer fee correctly', () => {
      const fee = detector.calculateTransferFee(502.50, 500.00);
      expect(fee).toBe(2.50);
    });

    it('should return 0 for same amounts', () => {
      const fee = detector.calculateTransferFee(500.00, 500.00);
      expect(fee).toBe(0);
    });
  });

  describe('isConfidenceAcceptable', () => {
    it('should accept high confidence results', () => {
      const result = {
        isInternalTransfer: true,
        confidence: 'high' as const,
        detectionMethod: 'reference' as const
      };
      expect(detector.isConfidenceAcceptable(result)).toBe(true);
    });

    it('should accept medium confidence results with default config', () => {
      const result = {
        isInternalTransfer: true,
        confidence: 'medium' as const,
        detectionMethod: 'amount_date' as const
      };
      expect(detector.isConfidenceAcceptable(result)).toBe(true);
    });

    it('should reject low confidence results with default config', () => {
      const result = {
        isInternalTransfer: true,
        confidence: 'low' as const,
        detectionMethod: 'description' as const
      };
      expect(detector.isConfidenceAcceptable(result)).toBe(false);
    });

    it('should accept low confidence results when configured', () => {
      const lowConfidenceDetector = new InternalTransferDetector({ minimumConfidence: 'low' });
      const result = {
        isInternalTransfer: true,
        confidence: 'low' as const,
        detectionMethod: 'description' as const
      };
      expect(lowConfidenceDetector.isConfidenceAcceptable(result)).toBe(true);
    });
  });

  describe('batch processing', () => {
    it('should process multiple transactions and return internal transfer results', async () => {
      const transactions: Transaction[] = [
        {
          id: 1,
          accountId: 1,
          date: new Date('2024-01-15T10:00:00Z'),
          amount: '-500.00',
          currency: 'EUR',
          description: 'Transfer to savings',
          isIncome: false,
          reference: 'INTERNAL_TRANSFER_001',
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
        {
          id: 2,
          accountId: 2,
          date: new Date('2024-01-15T10:05:00Z'),
          amount: '500.00',
          currency: 'EUR',
          description: 'Transfer from checking',
          isIncome: true,
          reference: 'INTERNAL_TRANSFER_001',
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
        {
          id: 3,
          accountId: 1,
          date: new Date('2024-01-16T10:00:00Z'),
          amount: '-50.00',
          currency: 'EUR',
          description: 'Grocery shopping',
          isIncome: false,
          reference: 'PURCHASE123',
          counterpartyIban: null,
          counterpartyName: null,
          merchant: 'Albert Heijn',
          categoryId: null,
          statementId: null,
          transactionType: 'debit',
          isInternalTransfer: false,
          matchedTransferId: null,
          transferDetectionConfidence: null,
          transferFee: null
        }
      ] as Transaction[];

      const results = await detector.detectBatchTransfers(transactions, mockUserAccounts);
      
      expect(results.size).toBe(2); // Both transfer transactions should be detected
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(false); // Grocery shopping should not be detected
      
      const transaction1Result = results.get(1)!;
      expect(transaction1Result.confidence).toBe('high');
      expect(transaction1Result.detectionMethod).toBe('reference');

      const transaction2Result = results.get(2)!;
      expect(transaction2Result.confidence).toBe('high');
      expect(transaction2Result.detectionMethod).toBe('reference');
    });
  });
});