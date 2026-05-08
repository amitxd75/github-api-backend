/**
 * GitHub API Backend Server — v3
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { githubRouter } from './routes/github';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

dotenv.config();

const app = express();
/**
 * Port on which the local server listens.
 * Defaults to 3001 if not specified in environment.
 */
const PORT = process.env.PORT || 3001;

// ─── Security & Middleware ────────────────────────────────────────────────────

/**
 * Configure Helmet with a custom Content Security Policy.
 * This allows the test UI (index.html) to function while protecting the API.
 */
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'", "'unsafe-inline'"],
			scriptSrcAttr: ["'unsafe-inline'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			imgSrc: ["'self'", "data:", "https:"],
			connectSrc: ["'self'", ...(process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'])],
			fontSrc: ["'self'"],
			objectSrc: ["'none'"],
			frameSrc: ["'none'"],
		},
	},
}));

/**
 * Configure Cross-Origin Resource Sharing (CORS).
 * Allows the frontend to communicate with the API from allowed origins.
 */
app.use(cors({
	origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
	credentials: true,
	optionsSuccessStatus: 200,
}));

// Request parsing middleware for JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom request logger for performance and usage monitoring
app.use(requestLogger);

/**
 * Serve the static test UI (index.html).
 * Configured with basic performance optimizations like extensions and etag.
 */
app.use(express.static('.', {
	index: 'index.html',
	dotfiles: 'ignore',
	etag: false,
	extensions: ['html', 'js', 'css'],
	maxAge: '1d',
	redirect: false,
}));

/**
 * Health check endpoint.
 * Returns system status, uptime, and configuration metadata.
 */
app.get('/health', (_req, res) => {
	res.json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: Math.floor(process.uptime()),
		version: process.env.npm_package_version ?? '3.0.0',
		environment: process.env.NODE_ENV ?? 'development',
		githubToken: process.env.GITHUB_TOKEN ? 'configured' : 'missing (rate limited to 60 req/hr)',
		memory: {
			usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
			totalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
		},
	});
});

/**
 * API Discovery endpoint.
 * Returns a summary of available endpoints, improvements in v3, and compatibility notes.
 */
app.get('/api', (_req, res) => {
	res.json({
		name: 'GitHub API Backend',
		version: '3.0.0',
		description: 'GitHub GraphQL + REST proxy with LRU cache and comprehensive stats',
		endpoints: {
			health: 'GET /health',
			proxy: 'GET /api/github/v2?endpoint=<github-path>&cache=<true|false>',
			stats: 'GET /api/github/v2/stats?username=<username>&force=<true|false>',
			statsAlt: 'GET /api/github/v2/stats/:username',
			cacheStatus: 'GET /api/github/v2/cache/status',
			cacheClear: 'DELETE /api/github/v2/cache',
			cacheClearKey: 'DELETE /api/github/v2/cache/:key',
		},
		improvements: [
			'GraphQL for stats — 1 round-trip vs N+1 REST calls',
			'Proper O(1) LRU cache with TTL eviction',
			'Accurate yearly streaks from contribution calendar',
			'All parallel fetches — no sequential bottlenecks',
			'Cache hit-rate tracking',
			'Rate-limit headers forwarded to client',
		],
		compatibility: 'v2 endpoints are maintained for backward compatibility'
	});
});

/**
 * Root route serving the test UI.
 */
app.get('/', (_req, res) => res.sendFile('index.html', { root: '.' }));

// Mount GitHub routes
app.use('/api/github', githubRouter);

/**
 * Global 404 handler for unmatched routes.
 */
app.use((req, res) => {
	res.status(404).json({
		error: 'Route not found',
		path: req.originalUrl,
		method: req.method,
		suggestion: 'See /api for available endpoints',
	});
});

// Mount error handler
app.use(errorHandler);

// ─── Process Lifecycle Handlers ───────────────────────────────────────────────

process.on('SIGTERM', () => { console.log('SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT', () => { console.log('SIGINT — shutting down'); process.exit(0); });
process.on('uncaughtException', err => { console.error('Uncaught exception:', err); process.exit(1); });
process.on('unhandledRejection', (r) => { console.error('Unhandled rejection:', r); process.exit(1); });

/**
 * Starts the Express server on the configured port.
 */
app.listen(PORT, () => {
	console.log(`\n🚀 GitHub API Backend v3 — port ${PORT}`);
	console.log(`🔑 Token: ${process.env.GITHUB_TOKEN ? '✅ configured' : '❌ missing'}`);
	console.log(`📊 Stats:  http://localhost:${PORT}/api/github/v2/stats?username=amitxd75`);
	console.log(`🗂️  Cache:  http://localhost:${PORT}/api/github/v2/cache/status\n`);
});

export default app;
