import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { githubRouter } from './routes/github';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
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
    version: process.env.npm_package_version || '2.0.0'
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'GitHub API Backend',
    version: '2.0.0',
    description: 'Enhanced GitHub API proxy with comprehensive stats endpoint',
    endpoints: {
      health: 'GET /health',
      github: {
        v2: {
          stats: 'GET /api/github/v2/stats?username=<username>&force=<true|false>'
        },
        cache: {
          status: 'GET /api/github/cache/status',
          clear: 'DELETE /api/github/cache',
          clearEndpoint: 'DELETE /api/github/cache/:endpoint'
        }
      }
    },
    documentation: 'https://github.com/amitxd75/github-api-backend'
  });
});

// API routes
app.use('/api/github', githubRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🐙 GitHub API: http://localhost:${PORT}/api/github`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;