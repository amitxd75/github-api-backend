/**
 * Request logging middleware for monitoring and debugging.
 * Logs incoming requests and their completion status.
 *
 * Features:
 * - Logs request details (method, URL, IP, user agent)
 * - Tracks response time and status codes
 * - Provides insights into API usage patterns
 * - Helps with debugging and performance monitoring
 */
import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware for logging HTTP requests and responses.
 * Captures request start time and logs completion details.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function to continue middleware chain
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
	const start = Date.now();

	// Log incoming request with relevant details
	console.log(`${new Date().toISOString()} - Incoming ${req.method} ${req.url}`, {
		ip: req.ip || req.socket.remoteAddress,
		userAgent: req.get('User-Agent'),
		query: Object.keys(req.query).length > 0 ? req.query : undefined,
		contentLength: req.get('Content-Length')
	});

	// Set up response completion logging
	res.on('finish', () => {
		const duration = Date.now() - start;
		const statusColor = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';

		console.log(
			`${new Date().toISOString()} - ${statusColor} ${req.method} ${req.url} - ` +
			`${res.statusCode} - ${duration}ms - ${res.get('Content-Length') || 0} bytes`
		);
	});

	// Continue to next middleware
	next();
};
