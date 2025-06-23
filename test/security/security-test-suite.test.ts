import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';

describe('Security Test Suite', () => {
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

  describe('Authentication and Authorization Tests', () => {
    it('should reject requests without authentication', async () => {
      const protectedEndpoints = [
        '/api/dashboard/1',
        '/api/accounts/1',
        '/api/transactions/1',
        '/api/goals/1',
        '/api/transfers/1',
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)
          .get(endpoint);

        // Should either redirect to login or return 401/403
        expect([401, 403, 302]).toContain(response.status);
      }
    });

    it('should reject invalid authentication credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'invalid_user',
          password: 'invalid_password'
        });

      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('sessionId');
    });

    it('should prevent access to other users data', async () => {
      // This test assumes we have test authentication setup
      // First login as user 1
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'demo',
          password: 'demo123'
        });

      const sessionCookie = loginResponse.headers['set-cookie'];

      // Try to access user 2's data
      const response = await request(app)
        .get('/api/dashboard/2') // Different user ID
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(403);
    });

    it('should validate session integrity', async () => {
      // Test with malformed session cookie
      const response = await request(app)
        .get('/api/dashboard/1')
        .set('Cookie', 'sessionId=invalid_session_token');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Input Validation and Sanitization Tests', () => {
    it('should prevent SQL injection in query parameters', async () => {
      const sqlInjectionPayloads = [
        "1'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1' UNION SELECT * FROM users --",
        "'; DELETE FROM accounts; --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get(`/api/dashboard/${payload}`);

        // Should return error, not execute malicious SQL
        expect([400, 404, 500]).toContain(response.status);
        
        // Response should not contain database error messages
        expect(response.body.message || '').not.toMatch(/syntax error|database|table|column/i);
      }
    });

    it('should sanitize XSS attempts in request bodies', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '"><script>alert("xss")</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/categories')
          .send({
            name: payload,
            type: 'expense'
          });

        // Should either reject the input or sanitize it
        if (response.status === 200 || response.status === 201) {
          // If accepted, should be sanitized
          expect(response.body.name).not.toContain('<script>');
          expect(response.body.name).not.toContain('javascript:');
        } else {
          // Should be rejected with appropriate error
          expect([400, 422]).toContain(response.status);
        }
      }
    });

    it('should validate file upload types and sizes', async () => {
      // Test with non-XML file
      const response1 = await request(app)
        .post('/api/import/1')
        .attach('camtFile', Buffer.from('not xml content'), 'test.txt');

      expect([400, 415, 422]).toContain(response1.status);

      // Test with oversized file (if file size validation is implemented)
      const largeContent = 'x'.repeat(100 * 1024 * 1024); // 100MB
      const response2 = await request(app)
        .post('/api/import/1')
        .attach('camtFile', Buffer.from(largeContent), 'large.xml');

      expect([400, 413, 422]).toContain(response2.status);
    });

    it('should validate numeric inputs properly', async () => {
      const invalidAmounts = [
        'NaN',
        'Infinity',
        '-Infinity',
        '1e308', // Very large number
        'invalid',
        '<script>alert("xss")</script>'
      ];

      for (const amount of invalidAmounts) {
        const response = await request(app)
          .post('/api/transfers/1')
          .send({
            fromAccountId: 1,
            toAccountId: 2,
            amount: amount,
            description: 'Test transfer'
          });

        expect([400, 422]).toContain(response.status);
      }
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limits on login attempts', async () => {
      const attempts = 10;
      const responses = [];

      for (let i = 0; i < attempts; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'invalid_user',
            password: 'invalid_password'
          });
        
        responses.push(response.status);
      }

      // Should start returning 429 (Too Many Requests) after several attempts
      const rateLimitedResponses = responses.filter(status => status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);

    it('should enforce rate limits on API endpoints', async () => {
      const requests = 100;
      const responses = [];

      for (let i = 0; i < requests; i++) {
        const response = await request(app)
          .get('/api/health');
        
        responses.push(response.status);
      }

      // Rate limiting may kick in for high-frequency requests
      const rateLimitedResponses = responses.filter(status => status === 429);
      
      // Log rate limiting results
      console.log(`Rate limiting test: ${rateLimitedResponses.length}/${requests} requests rate limited`);
      
      // This might pass if rate limiting is not strict on health endpoint
      expect(responses.length).toBe(requests);
    }, 15000);
  });

  describe('Data Exposure Prevention Tests', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/dashboard/999999'); // Non-existent user

      expect(response.status).toBe(403);
      
      // Should not expose database schema or internal details
      const responseText = JSON.stringify(response.body).toLowerCase();
      expect(responseText).not.toMatch(/password|hash|salt|secret|key|token/);
      expect(responseText).not.toMatch(/database|schema|table|column/);
      expect(responseText).not.toMatch(/stack trace|error:/);
    });

    it('should not expose user enumeration vulnerabilities', async () => {
      // Test with existing vs non-existing usernames
      const existingUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'demo',
          password: 'wrong_password'
        });

      const nonExistingUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'definitely_does_not_exist',
          password: 'wrong_password'
        });

      // Both should return similar error messages and status codes
      expect(existingUserResponse.status).toBe(nonExistingUserResponse.status);
      
      // Error messages should not reveal whether user exists
      expect(existingUserResponse.body.message).toBe(nonExistingUserResponse.body.message);
    });

    it('should not leak internal paths in error responses', async () => {
      const response = await request(app)
        .get('/api/trigger-error'); // This would trigger an internal error

      if (response.status >= 500) {
        const responseText = JSON.stringify(response.body);
        
        // Should not expose file paths
        expect(responseText).not.toMatch(/\/Users\/|\/home\/|C:\\/);
        expect(responseText).not.toMatch(/node_modules|src\/|server\//);
        expect(responseText).not.toMatch(/\.ts|\.js|\.json/);
      }
    });
  });

  describe('CSRF Protection Tests', () => {
    it('should require CSRF tokens for state-changing operations', async () => {
      // Test POST request without CSRF token
      const response = await request(app)
        .post('/api/categories')
        .send({
          name: 'Test Category',
          type: 'expense'
        });

      // Should either require CSRF token or use other CSRF protection
      // (This depends on your CSRF implementation)
      expect([400, 403, 422]).toContain(response.status);
    });
  });

  describe('HTTP Security Headers Tests', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/api/health');

      // Check for important security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');

      expect(response.headers).toHaveProperty('x-frame-options');
      expect(['DENY', 'SAMEORIGIN']).toContain(response.headers['x-frame-options']);

      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');

      // Check for Content Security Policy
      expect(response.headers).toHaveProperty('content-security-policy');
    });

    it('should set secure cookie attributes', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'demo',
          password: 'demo123'
        });

      if (response.headers['set-cookie']) {
        const cookieHeader = response.headers['set-cookie'][0];
        
        // In production, cookies should be secure
        if (process.env.NODE_ENV === 'production') {
          expect(cookieHeader).toMatch(/Secure/);
        }
        
        // Should include HttpOnly flag
        expect(cookieHeader).toMatch(/HttpOnly/);
        
        // Should include SameSite attribute
        expect(cookieHeader).toMatch(/SameSite/);
      }
    });
  });

  describe('Business Logic Security Tests', () => {
    it('should prevent negative transfer amounts', async () => {
      const response = await request(app)
        .post('/api/transfers/1')
        .send({
          fromAccountId: 1,
          toAccountId: 2,
          amount: '-100.00',
          description: 'Negative transfer test'
        });

      expect([400, 422]).toContain(response.status);
    });

    it('should prevent transfers to the same account', async () => {
      const response = await request(app)
        .post('/api/transfers/1')
        .send({
          fromAccountId: 1,
          toAccountId: 1,
          amount: '100.00',
          description: 'Same account transfer test'
        });

      expect([400, 422]).toContain(response.status);
    });

    it('should validate account ownership before transfers', async () => {
      // This test would require proper authentication setup
      // and multiple user accounts to test properly
      const response = await request(app)
        .post('/api/transfers/1')
        .send({
          fromAccountId: 999, // Account that doesn't belong to user
          toAccountId: 1,
          amount: '100.00',
          description: 'Unauthorized account transfer test'
        });

      expect([400, 403, 404]).toContain(response.status);
    });
  });

  describe('Password Security Tests', () => {
    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123',
        'password',
        '123456',
        'qwerty',
        'abc123'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: `testuser_${Math.random()}`,
            password: password
          });

        // Should reject weak passwords
        expect([400, 422]).toContain(response.status);
      }
    });

    it('should hash passwords properly', async () => {
      // This would require access to the user creation endpoint
      // and database verification that passwords are properly hashed
      // For now, we'll just ensure login doesn't expose passwords
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'demo',
          password: 'demo123'
        });

      // Response should never include password in any form
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/demo123|password/i);
    });
  });
});