import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

/**
 * Enhanced rate limiting middleware with multiple tracking strategies
 */
export class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private readonly config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: this.defaultKeyGenerator,
      onLimitReached: this.defaultOnLimitReached,
      ...config
    };

    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private defaultKeyGenerator(req: Request): string {
    // Use multiple identifiers for better tracking
    const ip = req.ip || 
              req.socket.remoteAddress || 
              req.headers['x-forwarded-for'] as string ||
              req.headers['x-real-ip'] as string ||
              'unknown';
    
    // Also consider user agent for additional uniqueness
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Create a composite key
    return `${ip}:${userAgent.slice(0, 50)}`;
  }

  private defaultOnLimitReached = (req: Request, res: Response): void => {
    const retryAfter = Math.ceil(this.config.windowMs / 1000);
    res.set({
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': this.config.maxRequests.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(Date.now() + this.config.windowMs).toISOString()
    });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.requests.entries())) {
      if (entry.resetTime < now) {
        this.requests.delete(key);
      }
    }
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.config.keyGenerator(req);
      const now = Date.now();
      
      let entry = this.requests.get(key);
      
      if (!entry || entry.resetTime < now) {
        // Create new entry or reset expired entry
        entry = {
          count: 1,
          resetTime: now + this.config.windowMs,
          firstRequest: now
        };
        this.requests.set(key, entry);
      } else {
        entry.count++;
      }

      // Set rate limit headers
      const remaining = Math.max(0, this.config.maxRequests - entry.count);
      res.set({
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
      });

      // Check if limit exceeded
      if (entry.count > this.config.maxRequests) {
        this.config.onLimitReached(req, res);
        return next(new AppError('Too many requests', 429));
      }

      // Handle response tracking if configured
      if (this.config.skipSuccessfulRequests || this.config.skipFailedRequests) {
        const originalSend = res.send;
        const rateLimiter = this;
        res.send = function(body: any) {
          const statusCode = res.statusCode;
          
          // Skip counting based on response status
          if (
            (rateLimiter.config.skipSuccessfulRequests && statusCode < 400) ||
            (rateLimiter.config.skipFailedRequests && statusCode >= 400)
          ) {
            entry.count--;
          }
          
          return originalSend.call(res, body);
        };
      }

      next();
    };
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const rateLimiters = {
  // General API rate limiting
  general: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // per window
    skipSuccessfulRequests: false
  }),

  // Strict rate limiting for authentication endpoints
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // per window
    skipSuccessfulRequests: true, // Only count failed attempts
    onLimitReached: (req, res) => {
      console.warn(`Auth rate limit exceeded for key: ${req.ip}`);
      res.set('Retry-After', '900'); // 15 minutes
    }
  }),

  // File upload rate limiting
  upload: new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // per window
    skipFailedRequests: true // Only count successful uploads
  }),

  // Intensive operations (like data export/import)
  intensive: new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // per window
    skipFailedRequests: true
  })
};

/**
 * Convenience function for applying rate limiting to routes
 */
export function rateLimit(type: keyof typeof rateLimiters = 'general') {
  return rateLimiters[type].middleware();
}

/**
 * Advanced rate limiter with Redis-like behavior for distributed systems
 * Note: This is a memory-based implementation, for production consider Redis
 */
export class DistributedRateLimiter extends RateLimiter {
  private readonly namespace: string;

  constructor(config: RateLimitConfig & { namespace?: string }) {
    super(config);
    this.namespace = config.namespace || 'rate_limit';
  }

  // Future enhancement: integrate with Redis for distributed rate limiting
  // This would allow rate limiting across multiple server instances
}

/**
 * Rate limiting for specific user operations
 */
export function createUserRateLimit(maxRequestsPerUser: number, windowMs: number) {
  return new RateLimiter({
    windowMs,
    maxRequests: maxRequestsPerUser,
    keyGenerator: (req: Request) => {
      const userId = req.params.userId || req.body.userId || req.query.userId;
      return `user:${userId}:${req.ip}`;
    }
  });
}