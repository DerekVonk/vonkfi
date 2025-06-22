import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { 
  errorHandler, 
  AppError, 
  asyncHandler, 
  withRetry, 
  requestTimeout,
  memoryMonitor 
} from '../server/middleware/errorHandler';
import { validateFileUpload, sanitizeInput } from '../server/middleware/validation';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

describe('Error Handling Middleware Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(sanitizeInput);
  });

  describe('AppError Class', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create AppError with custom values', () => {
      const error = new AppError('Not found', 404, false);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Error Handler Middleware', () => {
    it('should handle AppError correctly', async () => {
      app.get('/test-app-error', (req, res, next) => {
        next(new AppError('Test application error', 400));
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test-app-error')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.message).toBe('Test application error');
    });

    it('should handle generic errors', async () => {
      app.get('/test-generic-error', (req, res, next) => {
        next(new Error('Generic error'));
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test-generic-error')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      (dbError as any).code = '28P01';
      
      app.get('/test-db-error', (req, res, next) => {
        next(dbError);
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test-db-error')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Database Error');
    });
  });

  describe('Async Handler', () => {
    it('should catch async errors', async () => {
      app.get('/test-async-error', asyncHandler(async (req: any, res: any, next: any) => {
        throw new AppError('Async error', 400);
      }));
      app.use(errorHandler);

      const response = await request(app)
        .get('/test-async-error')
        .expect(400);

      expect(response.body.message).toBe('Async error');
    });

    it('should handle successful async operations', async () => {
      app.get('/test-async-success', asyncHandler(async (req: any, res: any) => {
        res.json({ success: true });
      }));

      const response = await request(app)
        .get('/test-async-success')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Retry Logic', () => {
    it('should retry transient failures', async () => {
      let attempts = 0;
      const mockFunction = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Transient failure');
          throw error;
        }
        return 'success';
      });

      const retryWrapper = withRetry(mockFunction, 3, 10);
      const result = await retryWrapper();
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry non-transient failures', async () => {
      let attempts = 0;
      const mockFunction = vi.fn().mockImplementation(() => {
        attempts++;
        throw new Error('Non-transient failure');
      });

      const retryWrapper = withRetry(mockFunction, 3, 10);
      
      await expect(retryWrapper()).rejects.toThrow('Non-transient failure');
      expect(attempts).toBe(1);
    });
  });

  describe('File Upload Validation', () => {
    it('should reject empty files', async () => {
      app.post('/test-upload', upload.single('file'), validateFileUpload, (req: any, res: any) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      const response = await request(app)
        .post('/test-upload')
        .attach('file', Buffer.from(''), 'empty.xml')
        .expect(400);

      expect(response.body.message).toContain('empty');
    });

    it('should reject large files', async () => {
      app.post('/test-upload', upload.single('file'), validateFileUpload, (req: any, res: any) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const response = await request(app)
        .post('/test-upload')
        .attach('file', Buffer.from(largeContent), 'large.xml')
        .expect(413);

      expect(response.body.message).toContain('10MB');
    });

    it('should reject non-XML files', async () => {
      app.post('/test-upload', upload.single('file'), validateFileUpload, (req: any, res: any) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      const response = await request(app)
        .post('/test-upload')
        .attach('file', Buffer.from('not xml content'), 'file.txt')
        .expect(400);

      expect(response.body.message).toContain('XML');
    });

    it('should accept valid XML files', async () => {
      app.post('/test-upload', upload.single('file'), validateFileUpload, (req: any, res: any) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      const validXml = '<?xml version="1.0"?><Document></Document>';
      const response = await request(app)
        .post('/test-upload')
        .attach('file', Buffer.from(validXml), 'valid.xml')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize script tags from input', async () => {
      app.post('/test-sanitize', (req: any, res: any) => {
        res.json({ received: req.body });
      });

      const maliciousInput = {
        name: '<script>alert("xss")</script>Clean Text',
        description: 'Normal text with <script>bad stuff</script> in it'
      };

      const response = await request(app)
        .post('/test-sanitize')
        .send(maliciousInput)
        .expect(200);

      expect(response.body.received.name).toBe('Clean Text');
      expect(response.body.received.description).toBe('Normal text with  in it');
    });

    it('should sanitize event handlers from input', async () => {
      app.post('/test-sanitize', (req: any, res: any) => {
        res.json({ received: req.body });
      });

      const maliciousInput = {
        name: 'Text with onclick=alert("bad") handler'
      };

      const response = await request(app)
        .post('/test-sanitize')
        .send(maliciousInput)
        .expect(200);

      expect(response.body.received.name).toBe('Text with alert("bad") handler');
    });
  });

  describe('Request Timeout', () => {
    it('should timeout slow requests', async () => {
      app.use(requestTimeout(100)); // 100ms timeout
      app.get('/test-timeout', asyncHandler(async (req: any, res: any) => {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
        res.json({ success: true });
      }));
      app.use(errorHandler);

      const response = await request(app)
        .get('/test-timeout')
        .expect(408);

      expect(response.body.message).toContain('timeout');
    });

    it('should not timeout fast requests', async () => {
      app.use(requestTimeout(200)); // 200ms timeout
      app.get('/test-fast', asyncHandler(async (req: any, res: any) => {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
        res.json({ success: true });
      }));

      const response = await request(app)
        .get('/test-fast')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Memory Monitor', () => {
    it('should allow requests under memory threshold', async () => {
      app.use(memoryMonitor());
      app.get('/test-memory', (req: any, res: any) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test-memory')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Malformed JSON Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      app.post('/test-json', (req: any, res: any) => {
        res.json({ received: req.body });
      });
      app.use(errorHandler);

      const response = await request(app)
        .post('/test-json')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});