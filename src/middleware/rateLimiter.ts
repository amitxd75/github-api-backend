/**
 * Inbound Rate Limiting Middleware
 *
 * Protects endpoints from DoS attacks, scraping, and quota exhaustion
 * using IP-based request rate limiting.
 */
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { isValidAdmin } from './auth';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getMaxRequests(): number {
	const val = process.env.RATE_LIMIT_MAX;
	if (val) {
		const parsed = parseInt(val, 10);
		if (!isNaN(parsed) && parsed > 0) return parsed;
	}
	return 100;
}

/**
 * Standard rate limiter for general API endpoints.
 * Allows 100 requests per 15-minute window per IP by default.
 * Admin requests with valid X-API-Key are exempt.
 */
export const apiRateLimiter = rateLimit({
	windowMs: WINDOW_MS,
	limit: () => getMaxRequests(),
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	skip: (req: Request) => isValidAdmin(req),
	handler: (_req: Request, res: Response) => {
		const max = getMaxRequests();
		res.status(429).json({
			error: 'Too many requests',
			message: `Rate limit exceeded. Maximum ${max} requests per 15 minutes allowed per IP.`,
			timestamp: new Date().toISOString(),
		});
	},
});

/**
 * Stricter rate limiter for resource-intensive endpoints like stats with force refresh.
 */
export const strictRateLimiter = rateLimit({
	windowMs: WINDOW_MS,
	limit: () => Math.max(10, Math.floor(getMaxRequests() / 3)),
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	skip: (req: Request) => isValidAdmin(req),
	handler: (_req: Request, res: Response) => {
		res.status(429).json({
			error: 'Too many refresh requests',
			message: 'Rate limit exceeded for resource-intensive requests. Please try again later.',
			timestamp: new Date().toISOString(),
		});
	},
});
