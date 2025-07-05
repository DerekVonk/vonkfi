import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';

describe('Health Check and Monitoring', () => {
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

  describe('Health Check Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
    });

    it('should include system information in health check', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Should include basic system info
      expect(response.body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(response.body.environment).toBeDefined();
    });

    it('should respond quickly to health checks', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500); // Should respond within 500ms
    });

    it('should handle multiple concurrent health checks', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/api/health').expect(200)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });
  });

  describe('Database Health Check', () => {
    it('should verify database connectivity', async () => {
      // This would typically check database connection
      // For now, we'll verify through API calls that use the database
      const response = await request(app)
        .get('/api/categories')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should detect database performance issues', async () => {
      const startTime = Date.now();
      
      // Make a database query through API
      await request(app)
        .get('/api/categories')
        .expect(200);
      
      const queryTime = Date.now() - startTime;
      
      // Database queries should be reasonably fast
      expect(queryTime).toBeLessThan(1000);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track response times for critical endpoints', async () => {
      const endpoints = [
        '/api/health',
        '/api/categories',
        '/api/dashboard/1'
      ];

      const performanceMetrics: Record<string, number> = {};

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        await request(app)
          .get(endpoint)
          .expect(200);
        
        performanceMetrics[endpoint] = Date.now() - startTime;
      }

      // Log performance metrics
      console.log('Performance Metrics:', performanceMetrics);

      // Verify acceptable performance
      expect(performanceMetrics['/api/health']).toBeLessThan(100);
      expect(performanceMetrics['/api/categories']).toBeLessThan(500);
      expect(performanceMetrics['/api/dashboard/1']).toBeLessThan(1000);
    });

    it('should monitor memory usage', async () => {
      const initialMemory = process.memoryUsage();

      // Perform some operations
      for (let i = 0; i < 10; i++) {
        await request(app).get('/api/health');
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log('Memory Usage:', {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        final: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
      });

      // Memory increase should be minimal for health checks
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Error Rate Monitoring', () => {
    it('should track error rates for API endpoints', async () => {
      const totalRequests = 20;
      const results = [];

      // Make multiple requests and track success/failure
      for (let i = 0; i < totalRequests; i++) {
        try {
          const response = await request(app).get('/api/health');
          results.push(response.status === 200 ? 'success' : 'error');
        } catch (error) {
          results.push('error');
        }
      }

      const successCount = results.filter(r => r === 'success').length;
      const errorRate = ((totalRequests - successCount) / totalRequests) * 100;

      console.log(`Error Rate: ${errorRate.toFixed(2)}%`);

      // Error rate should be very low for health endpoint
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
    });

    it('should handle invalid endpoints gracefully', async () => {
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);

      // Should return proper error structure
      expect(response.body).toBeDefined();
    });
  });

  describe('Uptime Monitoring', () => {
    it('should maintain consistent availability', async () => {
      const checks = 5;
      const interval = 1000; // 1 second between checks
      const uptimeResults = [];

      for (let i = 0; i < checks; i++) {
        try {
          await request(app).get('/api/health').expect(200);
          uptimeResults.push(true);
        } catch (error) {
          uptimeResults.push(false);
        }

        if (i < checks - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }

      const uptime = (uptimeResults.filter(Boolean).length / checks) * 100;
      console.log(`Uptime over ${checks} checks: ${uptime.toFixed(2)}%`);

      // Should maintain high uptime
      expect(uptime).toBeGreaterThanOrEqual(95);
    });
  });

  describe('Load Testing Indicators', () => {
    it('should handle burst traffic', async () => {
      const burstSize = 50;
      const startTime = Date.now();

      const promises = Array.from({ length: burstSize }, () =>
        request(app).get('/api/health')
      );

      const results = await Promise.allSettled(promises);
      const totalTime = Date.now() - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const successRate = (successful / burstSize) * 100;

      console.log(`Burst Test Results:
        Total requests: ${burstSize}
        Successful: ${successful}
        Success rate: ${successRate.toFixed(2)}%
        Total time: ${totalTime}ms
        Average time per request: ${(totalTime / burstSize).toFixed(2)}ms`);

      // Should handle burst traffic reasonably well
      expect(successRate).toBeGreaterThan(90);
      expect(totalTime).toBeLessThan(10000); // Within 10 seconds
    });

    it('should maintain performance under sustained load', async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      const results = [];

      // Send requests continuously for the duration
      while (Date.now() - startTime < duration) {
        try {
          const requestStart = Date.now();
          await request(app).get('/api/health');
          const requestTime = Date.now() - requestStart;
          results.push({ success: true, time: requestTime });
        } catch (error) {
          results.push({ success: false, time: 0 });
        }
      }

      const successfulRequests = results.filter(r => r.success);
      const averageResponseTime = successfulRequests.reduce((sum, r) => sum + r.time, 0) / successfulRequests.length;
      const requestsPerSecond = (results.length / duration) * 1000;

      console.log(`Sustained Load Test Results:
        Duration: ${duration}ms
        Total requests: ${results.length}
        Successful requests: ${successfulRequests.length}
        Requests per second: ${requestsPerSecond.toFixed(2)}
        Average response time: ${averageResponseTime.toFixed(2)}ms`);

      // Should maintain reasonable performance
      expect(averageResponseTime).toBeLessThan(500);
      expect(requestsPerSecond).toBeGreaterThan(5);
    }, 10000); // 10 second timeout for this test
  });

  describe('Resource Monitoring', () => {
    it('should monitor CPU usage patterns', async () => {
      const measurements = [];
      const measurementCount = 5;

      for (let i = 0; i < measurementCount; i++) {
        const startCpuUsage = process.cpuUsage();
        
        // Perform some work
        await request(app).get('/api/health');
        
        const cpuUsage = process.cpuUsage(startCpuUsage);
        measurements.push({
          user: cpuUsage.user / 1000, // Convert to milliseconds
          system: cpuUsage.system / 1000
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgUserCpu = measurements.reduce((sum, m) => sum + m.user, 0) / measurements.length;
      const avgSystemCpu = measurements.reduce((sum, m) => sum + m.system, 0) / measurements.length;

      console.log(`CPU Usage:
        Average User CPU: ${avgUserCpu.toFixed(2)}ms
        Average System CPU: ${avgSystemCpu.toFixed(2)}ms`);

      // CPU usage should be reasonable for simple health checks
      expect(avgUserCpu + avgSystemCpu).toBeLessThan(100); // Less than 100ms CPU time
    });
  });
});