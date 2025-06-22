import type { Request, Response, NextFunction } from 'express';

// Extend Express Response interface
declare global {
  namespace Express {
    interface Response {
      success(data?: any, message?: string): Response;
      created(data?: any, message?: string): Response;
      updated(data?: any, message?: string): Response;
      deleted(message?: string): Response;
      notFound(message?: string): Response;
      badRequest(message?: string): Response;
      unauthorized(message?: string): Response;
      forbidden(message?: string): Response;
      conflict(message?: string): Response;
      serverError(message?: string): Response;
    }
  }
}

// Standard API response format
interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  timestamp: string;
  statusCode: number;
}

// Helper function to create standardized responses
const createResponse = (
  success: boolean,
  statusCode: number,
  message?: string,
  data?: any
): ApiResponse => ({
  success,
  statusCode,
  message,
  data,
  timestamp: new Date().toISOString(),
});

// Middleware to add response helper methods
export const addResponseHelpers = (req: Request, res: Response, next: NextFunction) => {
  // Success responses
  res.success = function(data?: any, message: string = 'Success') {
    const response = createResponse(true, 200, message, data);
    return this.status(200).json(response);
  };

  res.created = function(data?: any, message: string = 'Resource created successfully') {
    const response = createResponse(true, 201, message, data);
    return this.status(201).json(response);
  };

  res.updated = function(data?: any, message: string = 'Resource updated successfully') {
    const response = createResponse(true, 200, message, data);
    return this.status(200).json(response);
  };

  res.deleted = function(message: string = 'Resource deleted successfully') {
    const response = createResponse(true, 200, message);
    return this.status(200).json(response);
  };

  // Error responses
  res.notFound = function(message: string = 'Resource not found') {
    const response = createResponse(false, 404, message);
    return this.status(404).json(response);
  };

  res.badRequest = function(message: string = 'Bad request') {
    const response = createResponse(false, 400, message);
    return this.status(400).json(response);
  };

  res.unauthorized = function(message: string = 'Unauthorized') {
    const response = createResponse(false, 401, message);
    return this.status(401).json(response);
  };

  res.forbidden = function(message: string = 'Forbidden') {
    const response = createResponse(false, 403, message);
    return this.status(403).json(response);
  };

  res.conflict = function(message: string = 'Conflict') {
    const response = createResponse(false, 409, message);
    return this.status(409).json(response);
  };

  res.serverError = function(message: string = 'Internal server error') {
    const response = createResponse(false, 500, message);
    return this.status(500).json(response);
  };

  next();
};