/**
 * Netlify Functions entry point for GitHub API Backend.
 * 
 * This serverless function provides the same functionality as the local server
 * but optimized for Netlify's serverless environment.
 * 
 * Key differences from local server:
 * - Cache resets on cold starts
 * - No persistent state between invocations
 * - Optimized for quick startup and execution
 * - Includes cold start detection
 */
import express from 'express';
import serverless from 'serverless-http';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { githubRouter } from '../../src/routes/github';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLogger } from '../../src/middleware/requestLogger';

// Load environment variables
dotenv.config();

// Initialize Express app for serverless deployment
const app = express();

// Security middleware - adds various HTTP headers for security
app.use(helmet());

// Request parsing middleware
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies up to 10MB
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

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

// Handle preflight OPTIONS requests (must come before other routes)
app.options('*', cors({
  origin: corsOriginHandler,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Apply CORS to all routes
app.use(cors({
  origin: corsOriginHandler,
  credentials: true, // Allow cookies and authorization headers
  optionsSuccessStatus: 200 // Support legacy browsers
}));

// Health check endpoint for Netlify Functions
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()), // Function uptime in seconds
    version: process.env.npm_package_version || '2.0.0',
    environment: 'netlify-functions',
    platform: 'serverless',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) // MB
    },
    coldStart: !global.warmFunction // Simple cold start detection
  });
  
  // Mark function as warm for subsequent requests
  global.warmFunction = true;
});

// Mount GitHub API routes
app.use('/api/github', githubRouter);

// API documentation endpoint for Netlify Functions
app.get('/api', (req, res) => {
  res.json({
    name: 'GitHub API Backend',
    version: '2.0.0',
    description: 'Enhanced GitHub API proxy with comprehensive stats endpoint, intelligent caching, and robust error handling',
    author: 'amitxd75',
    platform: 'netlify-functions',
    endpoints: {
      health: {
        path: 'GET /.netlify/functions/api/health',
        description: 'Serverless function health check and status'
      },
      github: {
        proxy: {
          path: 'GET /.netlify/functions/api/api/github/v2/?endpoint=<github-path>&cache=<true|false>',
          description: 'Proxy any GitHub API endpoint with optional caching',
          examples: [
            '/.netlify/functions/api/api/github/v2/?endpoint=/users/octocat',
            '/.netlify/functions/api/api/github/v2/?endpoint=/users/octocat/repos&cache=true'
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
    features: [
      'Serverless deployment on Netlify Functions',
      'Smart caching with configurable TTL',
      'Retry logic for network failures',
      'Comprehensive error handling',
      'Rate limit awareness',
      'GitHub token support for higher limits'
    ],
    notes: [
      'Cache is reset on each cold start in serverless environment',
      'For persistent caching, consider using external cache (Redis, etc.)'
    ],
    documentation: 'https://github.com/amitxd75/github-api-backend',
    repository: 'https://github.com/amitxd75/github-api-backend'
  });
});

// 404 handler for undefined routes in serverless environment
app.use('*', (req, res) => {
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

// Export the serverless handler
export const handler = serverless(app, {
  // Configure serverless-http options
  binary: false, // Don't handle binary content
  request: (request: any) => {
    // Add custom request processing if needed
    return request;
  },
  response: (response: any) => {
    // Add custom response processing if needed
    return response;
  }
});

// Declare global variable for warm function detection
declare global {
  var warmFunction: boolean;
}
