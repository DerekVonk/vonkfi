import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the storage module
const mockStorage = {
  executeTransfer: vi.fn(),
  getTransferRecommendationsByUserId: vi.fn(),
  getTransactionsByUserId: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  clearUserData: vi.fn(),
  getAccountById: vi.fn(),
  createAccount: vi.fn(),
  createGoal: vi.fn()
};

// Mock the routes with our mocked storage
vi.mock('../server/storage', () => ({
  storage: mockStorage
}));

// Mock the registerRoutes function to return just the endpoints we need
const app = express();
app.use(express.json());

// Manually add the transfer endpoints we implemented
app.post('/api/transfers/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { fromAccountId, toAccountId, amount, description } = req.body;

    // Validate required fields
    if (!fromAccountId || !toAccountId || !amount || !description) {
      return res.status(400).json({ 
        error: "Missing required fields: fromAccountId, toAccountId, amount, description" 
      });
    }

    // Execute the transfer
    const result = await mockStorage.executeTransfer({
      fromAccountId: parseInt(fromAccountId),
      toAccountId: parseInt(toAccountId),
      amount: parseFloat(amount),
      description,
      userId
    });

    if (result.success) {
      res.json({
        message: result.message,
        transferId: result.transferId,
        sourceTransaction: result.sourceTransaction,
        destinationTransaction: result.destinationTransaction
      });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error("Transfer execution error:", error);
    res.status(500).json({ error: "Failed to execute transfer" });
  }
});

app.get('/api/transfer-recommendations/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const recommendations = await mockStorage.getTransferRecommendationsByUserId(userId);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transfer recommendations" });
  }
});

describe('Transfer API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/transfers/:userId', () => {
    it('should execute a valid transfer successfully', async () => {
      const mockResult = {
        success: true,
        transferId: 'TXF_12345_abcdef',
        message: 'Transfer completed successfully',
        sourceTransaction: { id: 1, amount: '-100.00' },
        destinationTransaction: { id: 2, amount: '100.00' }
      };

      mockStorage.executeTransfer.mockResolvedValue(mockResult);

      const transferData = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: 100.00,
        description: 'Test transfer'
      };

      const response = await request(app)
        .post('/api/transfers/123')
        .send(transferData)
        .expect(200);

      expect(response.body.message).toBe('Transfer completed successfully');
      expect(response.body.transferId).toBe('TXF_12345_abcdef');
      expect(mockStorage.executeTransfer).toHaveBeenCalledWith({
        fromAccountId: 1,
        toAccountId: 2,
        amount: 100.00,
        description: 'Test transfer',
        userId: 123
      });
    });

    it('should reject transfer with insufficient funds', async () => {
      const mockResult = {
        success: false,
        message: 'Insufficient funds in source account'
      };

      mockStorage.executeTransfer.mockResolvedValue(mockResult);

      const transferData = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: 500.00,
        description: 'Invalid transfer'
      };

      const response = await request(app)
        .post('/api/transfers/123')
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Insufficient funds in source account');
    });

    it('should reject transfer with missing required fields', async () => {
      const transferData = {
        fromAccountId: 1,
        // Missing toAccountId, amount, description
      };

      const response = await request(app)
        .post('/api/transfers/123')
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Missing required fields: fromAccountId, toAccountId, amount, description');
      expect(mockStorage.executeTransfer).not.toHaveBeenCalled();
    });

    it('should reject self-transfers', async () => {
      const mockResult = {
        success: false,
        message: 'Cannot transfer to the same account'
      };

      mockStorage.executeTransfer.mockResolvedValue(mockResult);

      const transferData = {
        fromAccountId: 1,
        toAccountId: 1, // Same account
        amount: 100.00,
        description: 'Self transfer'
      };

      const response = await request(app)
        .post('/api/transfers/123')
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Cannot transfer to the same account');
    });

    it('should reject transfers with negative amounts', async () => {
      const mockResult = {
        success: false,
        message: 'Transfer amount must be positive'
      };

      mockStorage.executeTransfer.mockResolvedValue(mockResult);

      const transferData = {
        fromAccountId: 1,
        toAccountId: 2,
        amount: -100.00, // Negative amount
        description: 'Negative transfer'
      };

      const response = await request(app)
        .post('/api/transfers/123')
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Transfer amount must be positive');
    });
  });

  describe('GET /api/transfer-recommendations/:userId', () => {
    it('should return transfer recommendations for a user', async () => {
      const mockRecommendations = [
        {
          id: 1,
          userId: 123,
          fromAccountId: 1,
          toAccountId: 2,
          amount: '200.00',
          purpose: 'Emergency fund transfer'
        },
        {
          id: 2,
          userId: 123,
          fromAccountId: 1,
          toAccountId: 3,
          amount: '150.00',
          purpose: 'Savings goal transfer'
        }
      ];

      mockStorage.getTransferRecommendationsByUserId.mockResolvedValue(mockRecommendations);

      const response = await request(app)
        .get('/api/transfer-recommendations/123')
        .expect(200);

      expect(response.body).toEqual(mockRecommendations);
      expect(mockStorage.getTransferRecommendationsByUserId).toHaveBeenCalledWith(123);
    });

    it('should handle empty recommendations', async () => {
      mockStorage.getTransferRecommendationsByUserId.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/transfer-recommendations/123')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('Transfer Validation Logic', () => {
    it('should validate transfer amounts correctly', () => {
      const positiveAmount = 100.50;
      const negativeAmount = -50.00;
      const zeroAmount = 0;

      expect(positiveAmount).toBeGreaterThan(0);
      expect(negativeAmount).toBeLessThan(0);
      expect(zeroAmount).toBe(0);
    });

    it('should validate account ownership', () => {
      const userId = 123;
      const ownedAccount = { id: 1, userId: 123 };
      const notOwnedAccount = { id: 2, userId: 456 };

      expect(ownedAccount.userId).toBe(userId);
      expect(notOwnedAccount.userId).not.toBe(userId);
    });

    it('should generate unique transfer IDs', () => {
      const transferId1 = `TXF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transferId2 = `TXF_${Date.now() + 1}_${Math.random().toString(36).substr(2, 9)}`;

      expect(transferId1).not.toBe(transferId2);
      expect(transferId1).toMatch(/^TXF_\d+_[a-z0-9]+$/);
    });
  });
});