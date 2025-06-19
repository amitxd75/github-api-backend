import express from 'express';
import serverless from 'serverless-http';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { githubRouter } from '../../src/routes/github';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLogger } from '../../src/middleware/requestLogger';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration for Netlify
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://amitminer.github.io',
    'https://amitxd75.github.io'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: 'netlify-functions'
  });
});

// API routes
app.use('/api/github', githubRouter);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'GitHub API Backend',
    version: '2.0.0',
    description: 'Enhanced GitHub API proxy with comprehensive stats endpoint',
    endpoints: {
      health: 'GET /health',
      github: {
        v1: 'GET /api/github/v2/?endpoint=<github-endpoint>&cache=<true|skills>',
        v2: {
          stats: 'GET /api/github/v2/stats?username=<username>&force=<true|false>'
        },
        cache: {
          status: 'GET /api/github/v2/cache/status',
          clear: 'DELETE /api/github/v2/cache',
          clearEndpoint: 'DELETE /api/github/v2/cache/:endpoint'
        }
      }
    },
    documentation: 'https://github.com/amitxd75/github-api-backend'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'GET /api/github/v2/?endpoint=<github-endpoint>',
      'GET /api/github/v2/stats?username=<username>',
      'GET /api/github/v2/cache/status'
    ]
  });
});

// Error handling middleware
app.use(errorHandler);

export const handler = serverless(app);
