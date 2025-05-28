import { Router, Request, Response } from 'express';

// Simple in-memory cache
interface CacheEntry {
  data: any;
  lastUpdated: number;
}

const cache: Record<string, CacheEntry> = {};
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 14; // 14 days

export const githubRouter = Router();

/**
 * GitHub API proxy endpoint
 * 
 * Usage examples:
 * 1. Fetch user repos:
 *    GET /api/github?endpoint=/users/username/repos
 * 
 * 2. Fetch specific repo:
 *    GET /api/github?endpoint=/repos/username/repo-name
 * 
 * 3. Fetch with caching:
 *    GET /api/github?endpoint=/users/username/repos&cache=true
 * 
 * 4. Fetch skills (with specific cache):
 *    GET /api/github?endpoint=/users/username/repos&cache=skills
 * 
 * Query Parameters:
 * - endpoint: Required. The GitHub API endpoint to proxy (must start with /)
 * - cache: Set to 'true' or 'skills' to enable caching
 */
githubRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { endpoint, cache: cacheParam } = req.query;

    // Validate endpoint parameter
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ 
        error: 'Endpoint parameter required',
        usage: 'GET /api/github?endpoint=/users/username/repos'
      });
    }

    // Ensure endpoint starts with /
    if (!endpoint.startsWith('/')) {
      return res.status(400).json({ 
        error: 'Endpoint must start with /',
        provided: endpoint,
        example: '/users/username/repos'
      });
    }

    const now = Date.now();
    const shouldUseCache = cacheParam === 'true' || cacheParam === 'skills';

    // Check cache if enabled
    if (shouldUseCache && cache[endpoint]) {
      if (now - cache[endpoint].lastUpdated < CACHE_DURATION) {
        console.log(`Cache hit for endpoint: ${endpoint}`);
        return res.json({
          ...cache[endpoint].data,
          _cached: true,
          _cacheAge: Math.floor((now - cache[endpoint].lastUpdated) / 1000)
        });
      }
    }

    // Prepare headers for GitHub API
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Portfolio-Backend/1.0',
    };

    // Add authorization if token is available
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    // Make request to GitHub API
    const url = `https://api.github.com${endpoint}`;
    console.log(`Fetching from GitHub: ${url}`);
    
    const response = await fetch(url, { headers });

    // Handle different response statuses
    if (!response.ok) {
      if (response.status === 403) {
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        const resetDate = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : null;
        
        return res.status(429).json({
          error: 'GitHub API rate limit exceeded',
          resetTime: resetDate?.toISOString(),
          suggestion: 'Add GITHUB_TOKEN to your environment variables for higher rate limits'
        });
      }

      if (response.status === 404) {
        return res.status(404).json({
          error: 'Repository or resource not found',
          endpoint: endpoint,
          suggestion: 'Check if the username/repository exists and is public'
        });
      }

      const errorText = await response.text();
      return res.status(response.status).json({
        error: `GitHub API error: ${response.status}`,
        details: errorText,
        endpoint: endpoint
      });
    }

    // Parse successful response
    const data = await response.json();
    
    // Ensure data is an object
    if (typeof data !== 'object' || data === null) {
      return res.status(500).json({
        error: 'Invalid data received from GitHub API',
        details: 'Response is not an object'
      });
    }

    // Store in cache if enabled
    if (shouldUseCache) {
      cache[endpoint] = {
        data,
        lastUpdated: now,
      };
      console.log(`Cached data for endpoint: ${endpoint}`);
    }

    // Add metadata to response
    const responseData = {
      ...data,
      _metadata: {
        cached: false,
        timestamp: new Date().toISOString(),
        endpoint: endpoint,
        rateLimit: {
          remaining: response.headers.get('X-RateLimit-Remaining'),
          reset: response.headers.get('X-RateLimit-Reset')
        }
      }
    };

    return res.json(responseData);

  } catch (error: unknown) {
    console.error('GitHub API proxy error:', error);

    if (error instanceof Error) {
      // Handle network errors
      if (error.message.includes('fetch failed') || (error as any).code === 'ENOTFOUND') {
        return res.status(503).json({
          error: 'Network connectivity issue - cannot reach GitHub API',
          details: error.message,
          suggestion: 'Check your internet connection and try again'
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch from GitHub API',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'An unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Cache management endpoints
githubRouter.get('/cache/status', (req: Request, res: Response) => {
  const entries = Object.keys(cache).length;
  const totalSize = JSON.stringify(cache).length;
  
  res.json({
    entries,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
    endpoints: Object.keys(cache),
    cacheDuration: `${CACHE_DURATION / (1000 * 60 * 60 * 24)} days`
  });
});

githubRouter.delete('/cache', (req: Request, res: Response) => {
  const entriesCleared = Object.keys(cache).length;
  
  // Clear all cache entries
  for (const key in cache) {
    delete cache[key];
  }
  
  res.json({
    message: 'Cache cleared successfully',
    entriesCleared
  });
});

githubRouter.delete('/cache/:endpoint(*)', (req: Request, res: Response) => {
  const endpoint = `/${req.params.endpoint}`;
  
  if (cache[endpoint]) {
    delete cache[endpoint];
    res.json({
      message: `Cache cleared for endpoint: ${endpoint}`
    });
  } else {
    res.status(404).json({
      error: `No cache entry found for endpoint: ${endpoint}`
    });
  }
});