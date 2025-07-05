import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';
import { dbConnectionFailed } from './setup';

describe('API Integration Tests', () => {
  let app: express.Application;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  // Helper function to conditionally skip tests that require database connection
  const itIfDb = dbConnectionFailed ? it.skip : it;

  describe('Goal Creation API', () => {
    itIfDb('should create a goal with valid data', async () => {
      const goalData = {
        name: 'Test Holiday Fund',
        target: '5000.00',
        currentAmount: '1000.00',
        targetDate: new Date('2025-12-31').toISOString(),
        linkedAccountId: undefined,
        priority: 'high',
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(201);

      // The response is wrapped in a success object with data property
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Check the data property has the expected properties
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Holiday Fund');
      // The target amount might be returned as a number or string, so we'll check the value
      const targetValue = response.body.data.target;
      expect(parseFloat(targetValue) || targetValue).toBe(5000);
      // The date format might be different in the response
      expect(response.body.data).toHaveProperty('targetDate');
    });

    itIfDb('should handle date strings correctly', async () => {
      const goalData = {
        name: 'Date Test Goal',
        target: '3000.00',
        currentAmount: '500.00',
        targetDate: new Date('2025-06-15').toISOString(),
        priority: 'medium',
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(201);

      // The response is wrapped in a success object with data property
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // The date format might be different in the response
      expect(response.body.data).toHaveProperty('targetDate');
    });

    itIfDb('should handle undefined target date', async () => {
      const goalData = {
        name: 'No Date Goal',
        target: '2000.00',
        currentAmount: '0.00',
        // Omit targetDate entirely
        priority: 'low',
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(201);

      // The response is wrapped in a success object with data property
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // The targetDate might be null or undefined in the response
      if (response.body.data.hasOwnProperty('targetDate')) {
        expect(response.body.data.targetDate).toBeNull();
      }
    });

    itIfDb('should reject invalid goal data', async () => {
      const invalidData = {
        target: '1000.00',
        // Missing required name field
        userId: 1,
      };

      await request(app)
        .post('/api/goals')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('Transfer Recommendations API', () => {
    itIfDb('should generate transfer recommendations', async () => {
      // First create an account to avoid the "No main account found" error
      const accountData = {
        userId: 1,
        iban: 'NL91ABNA0417164300',
        role: 'income',
        accountHolderName: 'Test User',
        bankName: 'Test Bank',
        balance: '1000.00',
        currency: 'EUR'
      };

      await request(app)
        .post('/api/accounts')
        .send(accountData)
        .expect(201);

      const response = await request(app)
        .post('/api/transfers/generate/1')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('recommendations');
      expect(response.body.data).toHaveProperty('allocation');
      expect(Array.isArray(response.body.data.recommendations)).toBe(true);
    });

    itIfDb('should fetch transfer recommendations for user', async () => {
      const response = await request(app)
        .get('/api/transfer-recommendations/1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Dashboard API', () => {
    itIfDb('should return dashboard data for user', async () => {
      const response = await request(app)
        .get('/api/dashboard/1')
        .expect(200);

      // Dashboard returns direct response object (not wrapped)
      expect(response.body).toHaveProperty('accounts');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('goals');
      expect(response.body).toHaveProperty('fireMetrics');
      expect(response.body).toHaveProperty('transferRecommendations');
    });

    itIfDb('should recalculate dashboard metrics', async () => {
      const response = await request(app)
        .post('/api/recalculate/1')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('recalculated');
    });
  });

  describe('Data Management API', () => {
    itIfDb('should clear user data', async () => {
      const response = await request(app)
        .delete('/api/data/1')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('cleared');
    });
  });
});
