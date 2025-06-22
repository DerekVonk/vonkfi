import type { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { AppError } from './errorHandler';
import { storage } from '../storage';
import { z } from 'zod';

// Extend Express Request type to include user session
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        createdAt?: Date;
      };
      isAuthenticated?: boolean;
    }
  }
}

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    loginTime?: Date;
    csrfToken?: string;
  }
}

// Session configuration
const MemoryStoreConstructor = MemoryStore(session);

export const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: new MemoryStoreConstructor({
    checkPeriod: 86400000 // Prune expired entries every 24h
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true, // Prevent XSS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict' as const // CSRF protection
  },
  name: 'vonkfi.session' // Custom session name
};

/**
 * Authentication middleware to check if user is logged in
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Skip authentication in test mode
  if (process.env.DISABLE_AUTH_FOR_TESTS === 'true' || process.env.NODE_ENV === 'test') {
    req.user = {
      id: 1, // Default test user
      username: 'testuser'
    };
    req.isAuthenticated = true;
    return next();
  }

  if (!req.session || !req.session.userId) {
    return next(new AppError('Authentication required', 401));
  }

  // Add user info to request for convenience
  req.user = {
    id: req.session.userId,
    username: req.session.username || 'unknown'
  };
  req.isAuthenticated = true;

  next();
}

/**
 * Optional authentication middleware (doesn't require login but populates user if available)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username || 'unknown'
    };
    req.isAuthenticated = true;
  } else {
    req.isAuthenticated = false;
  }

  next();
}

/**
 * Authorization middleware to check if user can access specific resources
 */
export function requireUserAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  const requestedUserId = parseInt(req.params.userId);
  
  if (isNaN(requestedUserId)) {
    return next(new AppError('Invalid user ID', 400));
  }

  if (req.user.id !== requestedUserId) {
    return next(new AppError('Access denied: You can only access your own data', 403));
  }

  next();
}

/**
 * Login validation schema
 */
export const loginSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string()
    .min(1, 'Password is required')
    .max(128, 'Password too long')
});

/**
 * Registration validation schema
 */
export const registrationSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
});

/**
 * Session management utilities
 */
export class SessionManager {
  /**
   * Create a new user session
   */
  static async createSession(req: Request, user: { id: number; username: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.loginTime = new Date();
      
      req.session.save((err) => {
        if (err) {
          reject(new Error('Failed to create session'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Destroy user session
   */
  static async destroySession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          reject(new Error('Failed to destroy session'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Regenerate session ID (useful after login to prevent session fixation)
   */
  static async regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      const userId = req.session.userId;
      const username = req.session.username;
      const loginTime = req.session.loginTime;
      
      req.session.regenerate((err) => {
        if (err) {
          reject(new Error('Failed to regenerate session'));
        } else {
          // Restore session data
          req.session.userId = userId;
          req.session.username = username;
          req.session.loginTime = loginTime;
          resolve();
        }
      });
    });
  }

  /**
   * Check if session is valid and user still exists
   */
  static async validateSession(req: Request): Promise<boolean> {
    if (!req.session || !req.session.userId) {
      return false;
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        // User no longer exists, destroy session
        await this.destroySession(req);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }
}


/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  });

  // Only set HSTS in production with HTTPS
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

/**
 * CSRF protection for state-changing operations
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for unauthenticated requests
  if (!req.session || !req.session.userId) {
    return next();
  }

  // Check for CSRF token in header
  const token = req.headers['x-csrf-token'] as string;
  const sessionToken = req.session.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return next(new AppError('Invalid CSRF token', 403));
  }

  next();
}

/**
 * Generate and set CSRF token for authenticated users
 */
export function generateCSRFToken(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId && !req.session.csrfToken) {
    // Generate a simple CSRF token (in production, use crypto.randomBytes)
    req.session.csrfToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  next();
}