/**
 * Netlify Functions - Serverless API Gateway
 *
 * This module serves as the entry point for serverless deployment, providing
 * the GitHub API Backend functionality optimized for the Netlify environment.
 *
 * Implementation Details:
 * - Serverless-HTTP: Bridges Express middleware with AWS Lambda-style events.
 * - Transient Caching: Utilizes in-memory LRU caching (resets on cold starts).
 * - Optimization: Configured for minimal startup latency and cold-start monitoring.
 * - Security: Integrated Helmet and CORS middleware for hardened production access.
 */
import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { githubRouter } from '../../src/routes/github';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLogger } from '../../src/middleware/requestLogger';

/**
 * Module-level flag for warm function detection in serverless environments.
 * Initialized to false on cold start; set to true after the first request.
 */
let warmFunction: boolean = false;

// Load environment variables
dotenv.config();

/**
 * The Express application instance.
 */
const app = express();

// Security middleware - adds various HTTP headers for security
app.use(helmet());

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom request logger for monitoring
app.use(requestLogger);

// Configure allowed origins for CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
	'http://localhost:3000',
	'https://amitminer.github.io',
	'https://amitxd75.github.io'
];

/**
 * CORS origin validation function.
 * Allows requests from configured origins or same-origin requests.
 */
const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
	// Allow requests with no origin (mobile apps, curl, etc.) or from allowed origins
	if (!origin || allowedOrigins.includes(origin)) {
		callback(null, true);
	} else {
		console.warn(`CORS blocked request from origin: ${origin}`);
		callback(new Error(`Origin ${origin} not allowed by CORS policy`));
	}
};

// Handle preflight OPTIONS requests
app.use( cors({
	origin: corsOriginHandler,
	credentials: true,
	optionsSuccessStatus: 200
}));

// Apply CORS to all routes
app.use(cors({
	origin: corsOriginHandler,
	credentials: true,
	optionsSuccessStatus: 200
}));

/**
 * Health check endpoint for Netlify Functions.
 * Provides serverless-specific status including cold start detection.
 */
app.get('/health', (req: Request, res: Response) => {
	// Capture cold start state before marking the function as warm
	const isColdStart = !warmFunction;

	res.json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: Math.floor(process.uptime()),
		version: process.env.npm_package_version || '3.0.0',
		environment: 'netlify-functions',
		platform: 'serverless',
		memory: {
			used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
			total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
		},
		coldStart: isColdStart
	});

	// Mark function as warm for subsequent requests
	warmFunction = true;
});

// Mount GitHub API routes
app.use('/api/github', githubRouter);

/**
 * API documentation endpoint for Netlify Functions.
 */
app.get('/api', (req: Request, res: Response) => {
	res.json({
		name: 'GitHub API Backend',
		version: '3.0.0',
		description: 'GitHub GraphQL + REST proxy with LRU cache and comprehensive stats',
		author: 'amitxd75',
		platform: 'netlify-functions',
		endpoints: {
			health: {
				path: 'GET /.netlify/functions/api/health',
				description: 'Serverless function health check and status'
			},
			github: {
				proxy: {
					path: 'GET /.netlify/functions/api/api/github/v2?endpoint=<github-path>&cache=<true|false>',
					description: 'Proxy any GitHub API endpoint with optional caching',
					examples: [
						'/.netlify/functions/api/api/github/v2?endpoint=/users/octocat',
						'/.netlify/functions/api/api/github/v2?endpoint=/users/octocat/repos&cache=true'
					]
				},
				stats: {
					path: 'GET /.netlify/functions/api/api/github/v2/stats?username=<username>&force=<true|false>',
					description: 'Comprehensive GitHub user statistics with caching',
					examples: [
						'/.netlify/functions/api/api/github/v2/stats?username=amitxd75',
						'/.netlify/functions/api/api/github/v2/stats/amitxd75?force=true'
					]
				},
				cache: {
					status: 'GET /.netlify/functions/api/api/github/v2/cache/status',
					clear: 'DELETE /.netlify/functions/api/api/github/v2/cache',
					clearEndpoint: 'DELETE /.netlify/functions/api/api/github/v2/cache/:endpoint'
				}
			}
		},
		improvements: [
			'GraphQL for stats — 1 round-trip vs N+1 REST calls',
			'Proper O(1) LRU cache with TTL eviction',
			'Accurate yearly streaks from contribution calendar',
			'All parallel fetches — no sequential bottlenecks',
			'Cache hit-rate tracking',
			'Rate-limit headers forwarded to client'
		],
		documentation: 'https://github.com/amitxd75/github-api-backend',
		repository: 'https://github.com/amitxd75/github-api-backend'
	});
});

/**
 * 404 handler for undefined routes in serverless environment.
 */
app.use((req: Request, res: Response) => {
	res.status(404).json({
		error: 'Route not found',
		path: req.originalUrl,
		method: req.method,
		platform: 'netlify-functions',
		suggestion: 'Check the API documentation at /.netlify/functions/api/api for available endpoints',
		availableEndpoints: [
			'GET /.netlify/functions/api/health',
			'GET /.netlify/functions/api/api',
			'GET /.netlify/functions/api/api/github/v2/?endpoint=<github-path>',
			'GET /.netlify/functions/api/api/github/v2/stats?username=<username>',
			'GET /.netlify/functions/api/api/github/v2/cache/status'
		]
	});
});

// Global error handling middleware (must be last)
app.use(errorHandler);

/**
 * Exported Netlify Function handler.
 * Wraps the Express app using serverless-http.
 */
export const handler = serverless(app, {
	// Configure serverless-http options
	binary: false, // Don't handle binary content
	request: (request: Request) => {
		// Add custom request processing if needed
		return request;
	},
	response: (response: Response) => {
		// Add custom response processing if needed
		return response;
	}
});
