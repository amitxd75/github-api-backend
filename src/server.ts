/**
 * GitHub API Backend Server
 * 
 * A comprehensive GitHub API proxy and stats aggregator with:
 * - Smart caching for performance
 * - Robust error handling and retry logic
 * - Security middleware and CORS configuration
 * - Comprehensive GitHub statistics aggregation
 * - Support for both local and serverless deployment
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { githubRouter } from './routes/github';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Load environment variables from .env file
dotenv.config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware with relaxed CSP for development/testing interface
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

// CORS configuration - allows cross-origin requests from specified domains
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true, // Allow cookies and authorization headers
  optionsSuccessStatus: 200 // Support legacy browsers
}));

// Request parsing middleware
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies up to 10MB
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Custom middleware for request logging and monitoring
app.use(requestLogger);

// Serve static files (index.html, etc.)
app.use(express.static('.', { 
  index: 'index.html',
  dotfiles: 'ignore',
  etag: false,
  extensions: ['html', 'js', 'css'],
  maxAge: '1d',
  redirect: false
}));

// Health check endpoint - used for monitoring and load balancer checks
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()), // Server uptime in seconds
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) // MB
    }
  });
});

// API documentation endpoint - provides interactive API information
app.get('/api', (req, res) => {
  res.json({
    name: 'GitHub API Backend',
    version: '2.0.0',
    description: 'Enhanced GitHub API proxy with comprehensive stats endpoint, intelligent caching, and robust error handling',
    author: 'amitxd75',
    endpoints: {
      health: {
        path: 'GET /health',
        description: 'Server health check and status information'
      },
      github: {
        proxy: {
          path: 'GET /api/github/v2/?endpoint=<github-path>&cache=<true|false>',
          description: 'Proxy any GitHub API endpoint with optional caching',
          examples: [
            '/api/github/v2/?endpoint=/users/octocat',
            '/api/github/v2/?endpoint=/users/octocat/repos&cache=true'
          ]
        },
        stats: {
          path: 'GET /api/github/v2/stats?username=<username>&force=<true|false>',
          description: 'Comprehensive GitHub user statistics with caching',
          examples: [
            '/api/github/v2/stats?username=amitxd75',
            '/api/github/v2/stats/amitxd75?force=true'
          ]
        },
        cache: {
          status: 'GET /api/github/v2/cache/status',
          clear: 'DELETE /api/github/v2/cache',
          clearEndpoint: 'DELETE /api/github/v2/cache/:endpoint'
        }
      }
    },
    features: [
      'Smart caching with configurable TTL',
      'Retry logic for network failures',
      'Comprehensive error handling',
      'Rate limit awareness',
      'GitHub token support for higher limits',
      'Detailed logging and monitoring'
    ],
    documentation: 'https://github.com/amitxd75/github-api-backend',
    repository: 'https://github.com/amitxd75/github-api-backend'
  });
});

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

// Mount GitHub API routes
app.use('/api/github', githubRouter);

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    suggestion: 'Check the API documentation at /api for available endpoints',
    availableEndpoints: [
      'GET /health',
      'GET /api',
      'GET /api/github/v2/?endpoint=<github-path>',
      'GET /api/github/v2/stats?username=<username>',
      'GET /api/github/v2/cache/status'
    ]
  });
});

// Global error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handlers for production deployment
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received (Ctrl+C), shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
app.listen(PORT, () => {
  console.log('\n🚀 GitHub API Backend Server Started!');
  console.log('═'.repeat(50));
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 GitHub token: ${process.env.GITHUB_TOKEN ? '✅ Configured' : '❌ Not configured (rate limited)'}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   📊 Health check: http://localhost:${PORT}/health`);
  console.log(`   📖 API docs: http://localhost:${PORT}/api`);
  console.log(`   🐙 GitHub proxy: http://localhost:${PORT}/api/github/v2/?endpoint=/users/octocat`);
  console.log(`   📈 GitHub stats: http://localhost:${PORT}/api/github/v2/stats?username=amitxd75`);
  console.log(`   🗂️  Cache status: http://localhost:${PORT}/api/github/v2/cache/status`);
  console.log('═'.repeat(50));
  console.log('✨ Ready to serve requests!\n');
});

// Export the Express app for testing or serverless deployment
export default app;