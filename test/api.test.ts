import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';

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

  describe('Goal Creation API', () => {
    it('should create a goal with valid data', async () => {
      const goalData = {
        name: 'Test Holiday Fund',
        targetAmount: '5000.00',
        currentAmount: '1000.00',
        targetDate: '2025-12-31',
        linkedAccountId: null,
        priority: 1,
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Holiday Fund');
      expect(response.body.targetAmount).toBe('5000.00');
      expect(response.body.targetDate).toBe('2025-12-31');
    });

    it('should handle date strings correctly', async () => {
      const goalData = {
        name: 'Date Test Goal',
        targetAmount: '3000.00',
        currentAmount: '500.00',
        targetDate: '2025-06-15',
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      expect(response.body.targetDate).toBe('2025-06-15');
    });

    it('should handle null target date', async () => {
      const goalData = {
        name: 'No Date Goal',
        targetAmount: '2000.00',
        currentAmount: '0.00',
        targetDate: null,
        userId: 1,
      };

      const response = await request(app)
        .post('/api/goals')
        .send(goalData)
        .expect(200);

      expect(response.body.targetDate).toBeNull();
    });

    it('should reject invalid goal data', async () => {
      const invalidData = {
        targetAmount: '1000.00',
        // Missing required name field
        userId: 1,
      };

      await request(app)
        .post('/api/goals')
        .send(invalidData)
        .expect(500);
    });
  });

  describe('Transfer Recommendations API', () => {
    it('should generate transfer recommendations', async () => {
      const response = await request(app)
        .post('/api/transfers/generate/1')
        .expect(200);

      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('allocation');
      expect(Array.isArray(response.body.recommendations)).toBe(true);
    });

    it('should fetch transfer recommendations for user', async () => {
      const response = await request(app)
        .get('/api/transfers/1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Dashboard API', () => {
    it('should return dashboard data for user', async () => {
      const response = await request(app)
        .get('/api/dashboard/1')
        .expect(200);

      expect(response.body).toHaveProperty('accounts');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('goals');
      expect(response.body).toHaveProperty('fireMetrics');
      expect(response.body).toHaveProperty('transferRecommendations');
    });

    it('should recalculate dashboard metrics', async () => {
      const response = await request(app)
        .post('/api/recalculate/1')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('recalculated');
    });
  });

  describe('Data Management API', () => {
    it('should clear user data', async () => {
      const response = await request(app)
        .delete('/api/data/1')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('cleared');
    });
  });
});