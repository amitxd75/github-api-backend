/**
 * Global error handler middleware for Express application.
 * Catches all unhandled errors and provides consistent error responses.
 * 
 * Features:
 * - Logs detailed error information for debugging
 * - Provides different response formats for development vs production
 * - Includes request context for better error tracking
 * - Prevents sensitive information leakage in production
 */
import { Request, Response, NextFunction } from 'express';

/**
 * Express error handling middleware.
 * Must be the last middleware in the chain to catch all errors.
 * 
 * @param error - The error object that was thrown
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function (required for error middleware signature)
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log comprehensive error information for debugging
  console.error('Unhandled error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Determine if we should expose detailed error information
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Send appropriate error response based on environment
  res.status(500).json({
    error: 'Internal server error',
    // Only include sensitive details in development
    ...(isDevelopment && {
      details: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    }),
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
};