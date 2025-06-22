import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Helper function to sanitize strings
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  };

  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Validation middleware factory
export const validateRequest = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      // Validate URL parameters
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
      } else {
        next(new AppError('Validation failed', 400));
      }
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  // User ID parameter
  userId: z.object({
    userId: z.string().regex(/^\d+$/, 'User ID must be a number').transform(Number)
  }),

  // Pagination
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 10)
  }),

  // IBAN validation
  iban: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/, 'Invalid IBAN format'),

  // Amount validation (decimal with up to 2 decimal places)
  amount: z.union([
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid decimal'),
    z.number().positive('Amount must be positive')
  ]).transform(val => typeof val === 'string' ? parseFloat(val) : val),

  // Date validation
  date: z.union([
    z.string().datetime('Invalid date format'),
    z.date()
  ]).transform(val => typeof val === 'string' ? new Date(val) : val),

  // Priority validation
  priority: z.enum(['high', 'medium', 'low'], {
    errorMap: () => ({ message: 'Priority must be high, medium, or low' })
  }),

  // Account role validation
  accountRole: z.enum(['income', 'spending', 'emergency', 'savings', 'investment'], {
    errorMap: () => ({ message: 'Invalid account role' })
  }),

  // Category type validation
  categoryType: z.enum(['essential', 'discretionary', 'income', 'transfer'], {
    errorMap: () => ({ message: 'Invalid category type' })
  })
};

// API-specific validation schemas
export const apiSchemas = {
  // Goal creation/update
  goal: z.object({
    name: z.string().min(1, 'Goal name is required').max(100, 'Goal name too long'),
    target: commonSchemas.amount,
    priority: commonSchemas.priority,
    linkedAccountId: z.number().optional(),
    targetDate: commonSchemas.date.optional()
  }),

  // Account creation/update
  account: z.object({
    iban: commonSchemas.iban,
    accountHolderName: z.string().min(1, 'Account holder name is required').max(100),
    bankName: z.string().max(100).optional(),
    customName: z.string().max(100).optional(),
    accountType: z.string().max(50).optional(),
    role: commonSchemas.accountRole.optional(),
    balance: commonSchemas.amount.optional()
  }),

  // Transaction creation/update
  transaction: z.object({
    accountId: z.number().positive('Account ID is required'),
    date: commonSchemas.date,
    amount: z.union([z.string(), z.number()]).transform(val => parseFloat(val.toString())),
    currency: z.string().length(3, 'Currency must be 3 characters').default('EUR'),
    description: z.string().max(500).optional(),
    merchant: z.string().max(200).optional(),
    categoryId: z.number().optional(),
    isIncome: z.boolean().default(false),
    counterpartyIban: commonSchemas.iban.optional(),
    counterpartyName: z.string().max(100).optional(),
    reference: z.string().max(200).optional()
  }),

  // Category creation/update
  category: z.object({
    name: z.string().min(1, 'Category name is required').max(100),
    type: commonSchemas.categoryType,
    parentId: z.number().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code').optional(),
    icon: z.string().max(50).optional()
  }),

  // Transfer recommendation
  transferRecommendation: z.object({
    fromAccountId: z.number().positive('From account ID is required'),
    toAccountId: z.number().positive('To account ID is required'),
    amount: commonSchemas.amount,
    description: z.string().max(200).optional(),
    type: z.enum(['emergency', 'goal', 'investment', 'general']),
    goalId: z.number().optional()
  }),

  // Budget period
  budgetPeriod: z.object({
    userId: z.number().positive('User ID is required'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    totalIncome: commonSchemas.amount,
    status: z.enum(['draft', 'active', 'completed']).default('draft')
  }),

  // Budget category allocation
  budgetCategory: z.object({
    budgetPeriodId: z.number().positive('Budget period ID is required'),
    categoryId: z.number().positive('Category ID is required'),
    allocated: commonSchemas.amount,
    priority: z.enum(['need', 'want', 'save']),
    notes: z.string().max(500).optional()
  }),

  // Crypto wallet
  cryptoWallet: z.object({
    userId: z.number().positive('User ID is required'),
    currency: z.enum(['BTC', 'ETH', 'ADA', 'DOT'], {
      errorMap: () => ({ message: 'Unsupported cryptocurrency' })
    }),
    address: z.string().min(1, 'Wallet address is required').max(200),
    provider: z.string().max(100).optional(),
    balance: commonSchemas.amount.optional()
  }),

  // File upload validation
  fileUpload: z.object({
    originalname: z.string(),
    mimetype: z.enum(['application/xml', 'text/xml'], {
      errorMap: () => ({ message: 'Only XML files are allowed' })
    }),
    size: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB')
  })
};

// Parameter validation schemas
export const pathParams = {
  userId: z.object({
    userId: z.string().regex(/^\d+$/, 'Invalid user ID').transform(Number)
  }),

  accountId: z.object({
    accountId: z.string().regex(/^\d+$/, 'Invalid account ID').transform(Number)
  }),

  goalId: z.object({
    goalId: z.string().regex(/^\d+$/, 'Invalid goal ID').transform(Number)
  }),

  categoryId: z.object({
    categoryId: z.string().regex(/^\d+$/, 'Invalid category ID').transform(Number)
  }),

  transactionId: z.object({
    transactionId: z.string().regex(/^\d+$/, 'Invalid transaction ID').transform(Number)
  }),

  recommendationId: z.object({
    recommendationId: z.string().regex(/^\d+$/, 'Invalid recommendation ID').transform(Number)
  })
};

// Query parameter validation schemas
export const queryParams = {
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 10)
  }),

  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }),

  userIdQuery: z.object({
    userId: z.string().regex(/^\d+$/, 'Invalid user ID').transform(Number).optional()
  }),

  categoryFilter: z.object({
    categoryId: z.string().regex(/^\d+$/, 'Invalid category ID').transform(Number).optional(),
    type: commonSchemas.categoryType.optional()
  })
};

// Update schemas (all fields optional)
export const updateSchemas = {
  goal: apiSchemas.goal.partial(),
  account: apiSchemas.account.partial(),
  transaction: apiSchemas.transaction.partial(),
  category: apiSchemas.category.partial(),
  budgetPeriod: apiSchemas.budgetPeriod.partial(),
  budgetCategory: apiSchemas.budgetCategory.partial()
};

// Custom validation middleware for specific use cases
export const validateFileUpload = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  // Check if file is empty
  if (!req.file.buffer || req.file.buffer.length === 0) {
    return next(new AppError('File is empty', 400));
  }

  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    return next(new AppError('File size exceeds 10MB limit', 413));
  }

  // Check MIME type
  const allowedMimeTypes = ['application/xml', 'text/xml'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return next(new AppError('Only XML files are allowed', 400));
  }

  // Check if file content looks like XML
  const content = req.file.buffer.toString('utf-8');
  if (!content.trim().startsWith('<?xml') && !content.trim().startsWith('<')) {
    return next(new AppError('File does not appear to be valid XML', 400));
  }

  // Basic XML validation - check for matching tags
  try {
    // Simple check for malformed XML by counting opening and closing tags
    // Exclude self-closing tags from opening tag count
    const openingTags = (content.match(/<[^\/\?!][^>]*[^\/]>/g) || []).length;
    const closingTags = (content.match(/<\/[^>]*>/g) || []).length;
    const selfClosingTags = (content.match(/<[^>]*\/>/g) || []).length;
    
    // For well-formed XML, opening tags should equal closing tags
    // Self-closing tags don't need closing tags
    if (openingTags !== closingTags && (openingTags + selfClosingTags) === 0) {
      return next(new AppError('Malformed XML structure detected', 400));
    }
  } catch (error) {
    return next(new AppError('Invalid XML format', 400));
  }

  try {
    apiSchemas.fileUpload.parse(req.file);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      next(error);
    } else {
      next(new AppError('Invalid file upload', 400));
    }
  }
};

// Rate limiting validation
export const validateRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up expired entries
    for (const [key, value] of Array.from(requests.entries())) {
      if (value.resetTime < now) {
        requests.delete(key);
      }
    }

    const clientRequests = requests.get(clientId);

    if (!clientRequests) {
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
    } else if (clientRequests.resetTime > now && clientRequests.count >= maxRequests) {
      next(new AppError('Too many requests', 429));
    } else {
      clientRequests.count++;
      next();
    }
  };
};