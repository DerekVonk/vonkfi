import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { performance } from 'perf_hooks';
import express from 'express';
import { registerRoutes } from '../../server/routes';

describe('API Performance Tests', () => {
  let app: express.Application;
  let server: any;

  beforeAll(async () => {
    app = express();
    server = await registerRoutes(app);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Endpoint Response Time Tests', () => {
    it('should respond to health check within 100ms', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      console.log(`Health check response time: ${responseTime.toFixed(2)}ms`);
      
      expect(responseTime).toBeLessThan(100);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });

    it('should respond to categories endpoint within 200ms', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/categories')
        .expect(200);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      console.log(`Categories endpoint response time: ${responseTime.toFixed(2)}ms`);
      
      expect(responseTime).toBeLessThan(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle dashboard requests within 500ms', async () => {
      // Note: This test assumes authentication is disabled for tests
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/dashboard/1')
        .expect(200);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      console.log(`Dashboard endpoint response time: ${responseTime.toFixed(2)}ms`);
      
      expect(responseTime).toBeLessThan(500);
      expect(response.body).toHaveProperty('accounts');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('goals');
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 10 concurrent health checks efficiently', async () => {
      const concurrentRequests = 10;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/health')
          .expect(200)
      );
      
      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      console.log(`${concurrentRequests} concurrent health checks:
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(1000); // All should complete within 1 second
      expect(avgTimePerRequest).toBeLessThan(150);
      expect(responses).toHaveLength(concurrentRequests);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });

    it('should handle 20 concurrent category requests efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/categories')
          .expect(200)
      );
      
      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      console.log(`${concurrentRequests} concurrent category requests:
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(2000); // All should complete within 2 seconds
      expect(avgTimePerRequest).toBeLessThan(200);
      expect(responses).toHaveLength(concurrentRequests);
      
      responses.forEach(response => {
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    it('should maintain performance under mixed load', async () => {
      const startTime = performance.now();
      
      // Mix of different endpoint calls
      const mixedPromises = [
        // Health checks (lightweight)
        ...Array.from({ length: 15 }, () => 
          request(app).get('/api/health').expect(200)
        ),
        // Category requests (medium)
        ...Array.from({ length: 10 }, () => 
          request(app).get('/api/categories').expect(200)
        ),
        // Dashboard requests (heavy)
        ...Array.from({ length: 5 }, () => 
          request(app).get('/api/dashboard/1')
        ),
      ];
      
      const responses = await Promise.all(mixedPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Mixed load test (30 requests):
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${(totalTime / 30).toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(3000); // All should complete within 3 seconds
      expect(responses).toHaveLength(30);
      
      // Check that all requests completed successfully
      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests).toHaveLength(30);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during repeated requests', async () => {
      const iterations = 50;
      const initialMemory = process.memoryUsage();
      
      // Perform many requests
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/health')
          .expect(200);
        
        // Force garbage collection every 10 iterations if available
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory usage after ${iterations} requests:
        Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be minimal (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle large response payloads efficiently', async () => {
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();
      
      // Request potentially large dataset
      const response = await request(app)
        .get('/api/transactions/1?limit=1000')
        .expect(200);
      
      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const responseTime = endTime - startTime;
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Large payload test:
        Response time: ${responseTime.toFixed(2)}ms
        Payload size: ${JSON.stringify(response.body).length} bytes
        Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      expect(responseTime).toBeLessThan(1000);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle 404 errors quickly', async () => {
      const iterations = 20;
      const startTime = performance.now();
      
      const promises = Array.from({ length: iterations }, () =>
        request(app)
          .get('/api/nonexistent-endpoint')
          .expect(404)
      );
      
      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;
      
      console.log(`404 error handling performance:
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
      
      expect(avgTimePerRequest).toBeLessThan(50);
      expect(responses).toHaveLength(iterations);
    });

    it('should handle validation errors efficiently', async () => {
      const iterations = 15;
      const startTime = performance.now();
      
      const promises = Array.from({ length: iterations }, () =>
        request(app)
          .post('/api/categories')
          .send({ invalid: 'data' }) // Invalid category data
          .expect(400)
      );
      
      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / iterations;
      
      console.log(`Validation error handling performance:
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms`);
      
      expect(avgTimePerRequest).toBeLessThan(100);
      expect(responses).toHaveLength(iterations);
    });
  });

  describe('Stress Testing', () => {
    it('should maintain acceptable performance under high load', async () => {
      const highLoad = 100;
      const startTime = performance.now();
      
      // Create a high load scenario
      const promises = Array.from({ length: highLoad }, (_, index) => {
        // Vary the endpoints to simulate real usage
        const endpoints = ['/api/health', '/api/categories', '/api/dashboard/1'];
        const endpoint = endpoints[index % endpoints.length];
        
        return request(app)
          .get(endpoint)
          .timeout(5000); // 5 second timeout
      });
      
      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`High load test (${highLoad} requests):
        Total time: ${totalTime.toFixed(2)}ms
        Successful: ${successful}
        Failed: ${failed}
        Success rate: ${((successful / highLoad) * 100).toFixed(2)}%
        Average time: ${(totalTime / highLoad).toFixed(2)}ms`);
      
      // Should handle high load reasonably well
      expect(totalTime).toBeLessThan(10000); // Within 10 seconds
      expect(successful / highLoad).toBeGreaterThan(0.95); // 95% success rate
    }, 15000); // 15 second timeout for this test
  });
});