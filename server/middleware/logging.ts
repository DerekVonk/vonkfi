import type { Request, Response, NextFunction } from 'express';

// Simple logger interface
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
};

// Request logging middleware
export const requestLogger = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Log request
    logger.info(`${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.get('X-Request-ID') || 'unknown'
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'error' : 'info';
      
      logger[level](`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, {
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('content-length') || 0
      });
    });

    next();
  };
};

// Error logging middleware
export const errorLogger = () => {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error(`Error in ${req.method} ${req.originalUrl}`, {
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || 500,
      ip: req.ip
    });
    
    next(err);
  };
};

// Performance logging middleware
export const performanceLogger = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds

      // Log slow requests (>1000ms)
      if (duration > 1000) {
        logger.warn(`Slow request detected: ${req.method} ${req.originalUrl}`, {
          duration: `${duration.toFixed(2)}ms`,
          statusCode: res.statusCode
        });
      }

      // Log database query performance if available
      if (res.locals.queryCount) {
        logger.debug(`Database queries: ${res.locals.queryCount}`, {
          route: `${req.method} ${req.originalUrl}`,
          queryTime: res.locals.queryTime || 'unknown'
        });
      }
    });

    next();
  };
};