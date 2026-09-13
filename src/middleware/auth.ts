/**
 * Admin Authentication Middleware
 *
 * Provides API key verification for privileged actions (cache management,
 * private GitHub endpoints).
 */
import { Request, Response, NextFunction } from 'express';

/**
 * Checks if the request contains a valid Admin API Key.
 *
 * @param req - Express request object
 * @returns boolean indicating whether the caller has valid admin privileges
 */
export function isValidAdmin(req: Request): boolean {
	const adminKey = process.env.ADMIN_API_KEY?.trim();
	if (!adminKey) {
		return false;
	}

	const apiKeyHeader = req.headers['x-api-key'];
	if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim() === adminKey) {
		return true;
	}

	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();
		if (token === adminKey) {
			return true;
		}
	}

	return false;
}

/**
 * Express middleware requiring admin authentication.
 * Rejects requests with 401 Unauthorized if the Admin API Key is missing or invalid.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
	if (isValidAdmin(req)) {
		return next();
	}

	res.status(401).json({
		error: 'Unauthorized: Valid Admin API key required',
		message: 'Provide a valid key via the X-API-Key header or Authorization: Bearer <key>',
		timestamp: new Date().toISOString(),
	});
}
