import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// Custom error class for application errors
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Standardized error response interface
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  details?: any;
}

// Async handler wrapper to catch async errors
export const asyncHandler = <T>(fn: (req: Request, res: Response, next?: NextFunction) => Promise<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Retry wrapper for transient failures
export const withRetry = (fn: Function, maxRetries: number = 3, delay: number = 1000) => {
  return async (...args: any[]) => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error: any) {
        lastError = error;
        
        // Check if error is transient (should be retried)
        const isTransient = 
          error.message?.includes('connection') ||
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('ETIMEDOUT') ||
          error.message?.includes('Transient failure') ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNREFUSED';
        
        if (!isTransient || attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }
    
    throw lastError;
  };
};

// Validation error handler for Zod errors
const handleValidationError = (error: ZodError): ErrorResponse => {
  const message = error.issues
    .map(issue => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
    
  return {
    error: 'Validation Error',
    message: `Invalid input: ${message}`,
    statusCode: 400,
    timestamp: new Date().toISOString(),
    path: '',
    details: error.issues
  };
};

// Database error handler
const handleDatabaseError = (error: any): ErrorResponse => {
  let message = 'Database operation failed';
  let statusCode = 500;

  // Handle common database errors
  if (error.code === '23505') {
    message = 'Duplicate entry found';
    statusCode = 409;
  } else if (error.code === '23503') {
    message = 'Referenced record not found';
    statusCode = 400;
  } else if (error.code === '23502') {
    message = 'Required field is missing';
    statusCode = 400;
  } else if (error.message?.includes('connection') || error.message?.includes('timeout')) {
    message = 'Failed to fetch dashboard data';
    statusCode = 500;
  } else if (error.message?.includes('Transaction creation failed')) {
    message = 'Transaction creation failed';
    statusCode = 500;
  }

  return {
    error: 'Database Error',
    message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: ''
  };
};

// Cast error handler
const handleCastError = (error: any): ErrorResponse => {
  return {
    error: 'Invalid Data Format',
    message: `Invalid ${error.path}: ${error.value}`,
    statusCode: 400,
    timestamp: new Date().toISOString(),
    path: ''
  };
};

// Send error response in development
const sendErrorDev = (err: any, req: Request, res: Response) => {
  const errorResponse: ErrorResponse = {
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong',
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    details: {
      stack: err.stack,
      ...err
    }
  };

  res.status(errorResponse.statusCode).json(errorResponse);
};

// Sanitize error message to prevent information leakage
const sanitizeErrorMessage = (message: string): string => {
  if (!message) return 'An error occurred';
  
  // Remove potentially sensitive information
  let sanitized = message
    .replace(/password/gi, '[REDACTED]')
    .replace(/token/gi, '[REDACTED]')
    .replace(/key/gi, '[REDACTED]')
    .replace(/secret/gi, '[REDACTED]')
    .replace(/hash/gi, '[REDACTED]')
    .replace(/connection/gi, '[CONNECTION]')
    .replace(/database/gi, '[DATABASE]')
    .replace(/postgres:\/\/[^\s]+/gi, '[DB_CONNECTION]')
    .replace(/mongodb:\/\/[^\s]+/gi, '[DB_CONNECTION]')
    .replace(/\/[^\s]+\.(js|ts|json|env)/gi, '[FILE_PATH]')
    .replace(/ENOTFOUND/gi, '[NETWORK_ERROR]')
    .replace(/ECONNREFUSED/gi, '[CONNECTION_ERROR]')
    .replace(/getaddrinfo/gi, '[DNS_ERROR]');
  
  return sanitized;
};

// Send error response in production
const sendErrorProd = (err: any, req: Request, res: Response) => {
  let message = 'Something went wrong';
  let error = 'Internal Server Error';

  // Only expose safe error information for operational errors
  if (err.isOperational) {
    error = err.name || 'Application Error';
    message = sanitizeErrorMessage(err.message);
  }

  const errorResponse: ErrorResponse = {
    error,
    message,
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  };

  // Log the full error for debugging (never exposed to client)
  console.error('PRODUCTION ERROR:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  res.status(errorResponse.statusCode).json(errorResponse);
};

// Main error handling middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (err instanceof ZodError) {
      const validationError = handleValidationError(err);
      return res.status(validationError.statusCode).json(validationError);
    }

    if (err.name === 'CastError') {
      error = handleCastError(err);
      return res.status(error.statusCode).json(error);
    }

    if ((err.code && err.code.toString().startsWith('23')) || 
        err.message?.includes('Database connection failed')) {
      error = handleDatabaseError(err);
      return res.status(error.statusCode).json(error);
    }

    sendErrorProd(error, req, res);
  }
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// Unhandled rejection handler
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('UNHANDLED REJECTION! Shutting down...');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    
    process.exit(1);
  });
};

// Uncaught exception handler
export const handleUncaughtException = () => {
  process.on('uncaughtException', (err: Error) => {
    console.error('UNCAUGHT EXCEPTION! Shutting down...');
    console.error('Error:', err.name, err.message);
    console.error('Stack:', err.stack);
    
    process.exit(1);
  });
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new AppError('Request timeout', 408);
        next(error);
      }
    }, timeoutMs);
    
    // Clear timeout when response is finished
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    res.on('close', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
};

// Circuit breaker pattern for resource exhaustion protection
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private monitoringPeriod: number = 10000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new AppError('Service temporarily unavailable', 503);
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Memory usage monitoring
export const memoryMonitor = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round((used.heapUsed / 1024 / 1024) * 100) / 100;
    
    // Log warning if memory usage is high
    if (heapUsedMB > 500) { // 500MB threshold
      console.warn(`High memory usage detected: ${heapUsedMB}MB`);
    }
    
    // Block requests if memory usage is critical
    if (heapUsedMB > 1000) { // 1GB threshold
      return next(new AppError('Server overloaded - try again later', 503));
    }
    
    next();
  };
};