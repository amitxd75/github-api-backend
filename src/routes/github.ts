import { Router, Request, Response as ExpressResponse } from 'express';
import { CacheEntry, GitHubEvent, GitHubRepo, GitHubStats, GitHubUser } from '../types';

/**
 * In-memory cache for API responses.
 * Note: In serverless environments, this cache will reset on each cold start.
 * For production, consider using Redis or another persistent cache.
 */
const cache: Record<string, CacheEntry> = {};

// Cache configuration constants
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 14; // 14 days for general API endpoints
const STATS_CACHE_DURATION = 1000 * 60 * 60 * 6;  // 6 hours for stats (more dynamic data)
const MAX_CACHE_ENTRIES = 1000;                   // Maximum number of cache entries
const MAX_CACHE_SIZE = 50 * 1024 * 1024;         // 50MB maximum cache size

// Export the router to be used in the main application
export const githubRouter = Router();

/**
 * Cleans up the cache when it exceeds size or entry limits.
 * Removes oldest entries first (LRU-style cleanup).
 */
function cleanupCache(): void {
  const entries = Object.entries(cache);
  
  // Check if cleanup is needed
  const currentSize = JSON.stringify(cache).length;
  if (entries.length <= MAX_CACHE_ENTRIES && currentSize <= MAX_CACHE_SIZE) {
    return;
  }
  
  console.log(`Cache cleanup triggered: ${entries.length} entries, ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
  
  // Sort by last updated time (oldest first)
  const sortedEntries = entries.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
  
  // Remove oldest entries until we're under limits
  const targetEntries = Math.floor(MAX_CACHE_ENTRIES * 0.8); // Remove 20% extra for buffer
  const entriesToRemove = Math.max(0, entries.length - targetEntries);
  
  for (let i = 0; i < entriesToRemove; i++) {
    const entry = sortedEntries[i];
    if (entry) {
      const [key] = entry;
      delete cache[key];
    }
  }
  
  console.log(`Cache cleanup completed: ${Object.keys(cache).length} entries remaining`);
}

/**
 * Adds an entry to the cache with automatic cleanup if needed.
 */
function setCacheEntry(key: string, data: unknown): void {
  cache[key] = {
    data,
    lastUpdated: Date.now()
  };
  
  // Trigger cleanup if needed (async to not block response)
  setImmediate(() => cleanupCache());
}

/**
 * Fetches data from a URL with built-in retry logic for transient network or API errors.
 * @param url The URL to fetch.
 * @param options The fetch options.
 * @param maxRetries The maximum number of retries.
 * @returns The fetch Response object.
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries: number = 2): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Return immediately for successful or client-side errors (4xx).
      if (response.status === 401 || response.status === 403) {
        return response;
      }
      
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      // Retry on server-side errors (5xx).
      if (response.status >= 500 && attempt < maxRetries) {
        console.warn(`GitHub API returned ${response.status}, retrying in ${Math.pow(2, attempt)} seconds... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      return response;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown fetch error');
      
      // Check for transient network errors to retry.
      const isTransientError = error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('socket hang up') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')
      );
      
      if (isTransientError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Network error: ${error.message}, retrying in ${delay/1000} seconds... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Re-throw if not a transient error or max retries exceeded.
      throw error;
    }
  }
  
  // Throw if all retries fail.
  throw lastError || new Error('Max retries exceeded');
}

/**
 * GET handler for general GitHub API endpoints.
 * Supports caching to reduce API calls.
 */
githubRouter.get('/v2', async (req: Request, res: ExpressResponse) => {
  try {
    const { endpoint, cache: cacheParam } = req.query;

    // Validate request parameters.
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({
        error: 'Endpoint parameter required',
        usage: 'GET /api/github/v2?endpoint=/users/username/repos'
      });
    }

    if (!endpoint.startsWith('/')) {
      return res.status(400).json({
        error: 'Endpoint must start with /',
        provided: endpoint,
        example: '/users/username/repos'
      });
    }

    const now = Date.now();
    const shouldUseCache = cacheParam === 'true';

    // Check for a valid cache entry.
    if (shouldUseCache && cache[endpoint]) {
      if (now - cache[endpoint].lastUpdated < CACHE_DURATION) {
        console.log(`Cache hit for endpoint: ${endpoint}`);
        
        const cachedData = cache[endpoint].data;
        
        // Return cached data with metadata.
        if (Array.isArray(cachedData)) {
          return res.json(cachedData);
        } else {
        if (typeof cachedData === 'object' && cachedData !== null) {
          return res.json({
            ...cachedData,
            _cached: true,
            _cacheAge: Math.floor((now - cache[endpoint].lastUpdated) / 1000)
          });
        }
        return res.json(cachedData);
        }
      }
    }

    // Set up headers for the GitHub API request.
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Portfolio-Backend/2.0',
    };

    // Add GitHub token if available for higher rate limits (5000 req/hr vs 60 req/hr)
    if (process.env.GITHUB_TOKEN?.trim()) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const url = `https://api.github.com${endpoint}`;
    console.log(`Fetching from GitHub: ${url}`);
    
    // Fetch data from GitHub with retry logic.
    const response = await fetchWithRetry(url, { headers });

    // Handle API errors.
    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          error: 'GitHub API authentication failed',
          details: 'Invalid or expired GitHub token. Please check your GITHUB_TOKEN environment variable.',
          suggestion: 'Create a new GitHub Personal Access Token at https://github.com/settings/tokens',
          endpoint: endpoint
        });
      }

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

    const data = await response.json();
    
    if (data === null || data === undefined) {
      return res.status(500).json({
        error: 'No data received from GitHub API',
        endpoint: endpoint
      });
    }

    // Cache the new data if caching is enabled
    if (shouldUseCache) {
      setCacheEntry(endpoint, data);
      console.log(`Cached data for endpoint: ${endpoint}`);
    }

    // Return the fetched data.
    if (Array.isArray(data)) {
      console.log(`Returning array with ${data.length} items for ${endpoint}`);
      return res.json(data);
    }

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

    // Handle specific errors.
    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || (error as { code?: string }).code === 'ENOTFOUND') {
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

/**
 * GET handler to check cache status and health.
 * Provides detailed information about cache usage and performance.
 */
githubRouter.get('/v2/cache/status', (_req: Request, res: ExpressResponse) => {
  const entries = Object.keys(cache).length;
  const totalSize = JSON.stringify(cache).length;
  const now = Date.now();
  
  // Calculate cache statistics
  const cacheEntries = Object.entries(cache);
  const statsEntries = cacheEntries.filter(([key]) => key.startsWith('stats_'));
  const endpointEntries = cacheEntries.filter(([key]) => !key.startsWith('stats_'));
  
  // Calculate average age and oldest entry
  const ages = cacheEntries.map(([, entry]) => now - entry.lastUpdated);
  const averageAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  const oldestAge = ages.length > 0 ? Math.max(...ages) : 0;
  
  res.json({
    summary: {
      totalEntries: entries,
      totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
      sizePercentage: `${((totalSize / MAX_CACHE_SIZE) * 100).toFixed(1)}%`,
      entriesPercentage: `${((entries / MAX_CACHE_ENTRIES) * 100).toFixed(1)}%`
    },
    breakdown: {
      statsEntries: statsEntries.length,
      endpointEntries: endpointEntries.length
    },
    performance: {
      averageAge: `${Math.floor(averageAge / 1000 / 60)} minutes`,
      oldestEntry: `${Math.floor(oldestAge / 1000 / 60)} minutes`,
      hitRateEstimate: 'Not tracked' // Could be implemented with counters
    },
    configuration: {
      maxEntries: MAX_CACHE_ENTRIES,
      maxSize: `${(MAX_CACHE_SIZE / 1024 / 1024).toFixed(0)}MB`,
      generalCacheDuration: `${CACHE_DURATION / (1000 * 60 * 60 * 24)} days`,
      statsCacheDuration: `${STATS_CACHE_DURATION / (1000 * 60 * 60)} hours`
    },
    endpoints: Object.keys(cache).slice(0, 20), // Limit to first 20 for readability
    ...(entries > 20 && { note: `Showing first 20 of ${entries} cached endpoints` })
  });
});

/**
 * DELETE handler to clear the entire cache.
 * Useful for debugging or forcing fresh data.
 */
githubRouter.delete('/v2/cache', (_req: Request, res: ExpressResponse) => {
  const entriesCleared = Object.keys(cache).length;
  const sizeBefore = JSON.stringify(cache).length;
  
  // Clear all cache entries
  for (const key in cache) {
    delete cache[key];
  }
  
  console.log(`Cache manually cleared: ${entriesCleared} entries, ${(sizeBefore / 1024).toFixed(2)}KB freed`);
  
  return res.json({
    message: 'Cache cleared successfully',
    entriesCleared,
    sizeFreed: `${(sizeBefore / 1024).toFixed(2)} KB`,
    timestamp: new Date().toISOString()
  });
});

/**
 * DELETE handler to clear a specific cache entry.
 * Supports both endpoint paths and stats cache keys.
 */
githubRouter.delete('/v2/cache/:endpoint(*)', (req: Request, res: ExpressResponse) => {
  const endpointParam = req.params.endpoint;
  
  // Validate that endpoint parameter exists
  if (!endpointParam) {
    return res.status(400).json({
      error: 'Endpoint parameter is required',
      usage: 'DELETE /api/github/v2/cache/<endpoint-or-key>'
    });
  }
  
  const endpoint = `/${endpointParam}`;
  
  // Check for direct endpoint match
  if (cache[endpoint]) {
    delete cache[endpoint];
    console.log(`Cache entry cleared: ${endpoint}`);
    return res.json({
      message: `Cache cleared for endpoint: ${endpoint}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Check for stats cache key (without leading slash)
  const statsKey = endpointParam;
  if (cache[statsKey]) {
    delete cache[statsKey];
    console.log(`Cache entry cleared: ${statsKey}`);
    return res.json({
      message: `Cache cleared for key: ${statsKey}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // No matching cache entry found
  return res.status(404).json({
    error: `No cache entry found for: ${endpoint}`,
    suggestion: 'Use GET /api/github/v2/cache/status to see available cache keys',
    availableKeys: Object.keys(cache).slice(0, 10) // Show first 10 as examples
  });
});

/**
 * Fetches and calculates a user's comprehensive GitHub statistics.
 * This function aggregates data from multiple GitHub API endpoints to provide
 * a complete picture of a user's GitHub activity and contributions.
 * 
 * @param username - The GitHub username to fetch stats for
 * @returns Promise that resolves to a comprehensive GitHubStats object
 * @throws Error if user not found, API authentication fails, or network issues occur
 */
const fetchGitHubStats = async (username: string): Promise<GitHubStats> => {
  // Configure headers for GitHub API requests
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Portfolio-Backend/2.0',
  };

  // Add GitHub token for authentication if available (increases rate limit from 60 to 5000 req/hr)
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  // Fetch user profile data
  const userResponse = await fetchWithRetry(`https://api.github.com/users/${username}`, { headers });
  if (!userResponse.ok) {
    if (userResponse.status === 404) {
      throw new Error(`User '${username}' not found`);
    }
    if (userResponse.status === 401) {
      throw new Error('GitHub API authentication failed');
    }
    throw new Error(`Failed to fetch user data: ${userResponse.status}`);
  }
  const userData = await userResponse.json() as GitHubUser;

  // Fetch user's repositories (sorted by most recently updated)
  const reposResponse = await fetchWithRetry(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers });
  if (!reposResponse.ok) {
    throw new Error(`Failed to fetch repositories: ${reposResponse.status}`);
  }
  const reposData = await reposResponse.json() as GitHubRepo[];

  // Fetch user's recent activity events (commits, PRs, issues, etc.)
  const eventsResponse = await fetchWithRetry(`https://api.github.com/users/${username}/events?per_page=100`, { headers });
  if (!eventsResponse.ok) {
    throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
  }
  const eventsData = await eventsResponse.json() as GitHubEvent[];

  // Calculate repository statistics (only counting original repos, not forks)
  let totalStars = 0;
  let totalForks = 0;
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let recentRepoActivity = 0;

  // Filter out forked repositories to get only original work
  const ownRepos = reposData.filter(repo => !repo.fork);

  // Aggregate stars, forks, and recent activity from user's original repositories
  for (const repo of ownRepos) {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;

    // Count repositories with activity in the last 30 days
    if (new Date(repo.pushed_at).getTime() > oneMonthAgo) {
      recentRepoActivity++;
    }
  }

  // Fetch programming language statistics for each repository
  // This provides insights into the user's technical skills and preferences
  const allLanguageBytes: Record<string, number> = {};
  let totalLanguageBytes = 0;

  // Process repositories in batches to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < ownRepos.length; i += batchSize) {
    const batch = ownRepos.slice(i, i + batchSize);
    
    // Fetch language data for each repository in the current batch
    const languagePromises = batch.map(async (repo) => {
      try {
        const repoName = repo.name || repo.full_name?.split('/')[1];
        if (!repoName) return {};
        
        // Get language breakdown (bytes of code per language)
        const langResponse = await fetchWithRetry(`https://api.github.com/repos/${username}/${repoName}/languages`, { headers });
        if (langResponse.ok) {
          const languages = await langResponse.json() as Record<string, number>;
          return languages;
        }
      } catch {
        console.warn(`Failed to fetch languages for repo: ${repo.name}`);
        return {};
      }
      return {};
    });

    const batchResults = await Promise.all(languagePromises);
    
    // Aggregate language statistics across all repositories
    batchResults.forEach((languages) => {
      if (languages) {
        Object.entries(languages).forEach(([lang, bytes]) => {
          allLanguageBytes[lang] = (allLanguageBytes[lang] || 0) + bytes;
          totalLanguageBytes += bytes;
        });
      }
    });

    // Add a small delay between batches to be respectful to GitHub's API
    if (i + batchSize < ownRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Calculate top programming languages by percentage of total code
  const topLanguages = totalLanguageBytes > 0
    ? Object.fromEntries(
      Object.entries(allLanguageBytes)
        .map(([lang, bytes]) => [lang, Math.round((bytes / totalLanguageBytes) * 100)])
        .sort((a, b) => (b[1] as number) - (a[1] as number)) // Sort by percentage descending
        .slice(0, 5) // Take top 5 languages
        .filter(([, percentage]) => (percentage as number) > 0) // Remove 0% entries
    )
    : {};

  // Analyze recent activity from user's event stream
  // Note: This only captures recent public activity (last ~90 days)
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;

  eventsData.forEach((event: GitHubEvent) => {
    switch (event.type) {
      case 'PushEvent':
        // Count individual commits from push events
        totalCommits += event.payload.commits?.length || 0;
        break;
      case 'PullRequestEvent':
        // Count pull request activities
        totalPRs++;
        break;
      case 'IssuesEvent':
        // Count issue-related activities
        totalIssues++;
        break;
    }
  });

  // Calculate contribution streaks based on push events
  // Note: Limited to recent activity visible in events API
  const contributions = eventsData
    .filter((event: GitHubEvent) => event.type === 'PushEvent')
    .map((event: GitHubEvent) => new Date(event.created_at).toDateString());

  // Get unique contribution dates and sort them (most recent first)
  const uniqueDates = [...new Set(contributions)];
  const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const today = new Date().toDateString();

  // Calculate streaks by checking consecutive days
  for (let i = 0; i < sortedDates.length; i++) {
    const currentDateStr = sortedDates[i];
    const nextDateStr = i < sortedDates.length - 1 ? sortedDates[i + 1] : null;
    
    if (!currentDateStr) continue;
    
    const currentDate = new Date(currentDateStr);
    const nextDate = nextDateStr ? new Date(nextDateStr) : null;

    if (nextDate) {
      const dayDiff = Math.floor((currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff === 1) {
        // Consecutive day found
        tempStreak++;
      } else {
        // Streak broken, update longest if needed
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        tempStreak = 0;
      }
    }

    // Check if this contributes to current streak (today or yesterday)
    if (currentDateStr === today || 
        Math.floor((new Date().getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) <= 1) {
      currentStreak = tempStreak + 1;
    }
  }

  // Final check for longest streak
  if (tempStreak > longestStreak) longestStreak = tempStreak;

  // Determine the most recent activity date
  const lastActivity = eventsData.length > 0 && eventsData[0]?.created_at
    ? eventsData[0].created_at
    : userData.created_at;

  // Compile and return comprehensive GitHub statistics
  return {
    // Basic user information
    username: userData.login,
    followers: userData.followers,
    following: userData.following,
    publicRepos: userData.public_repos,
    publicGists: userData.public_gists,
    accountCreated: userData.created_at,
    lastActivity: lastActivity,
    
    // Repository statistics
    totalRepos: reposData.length,
    totalStars,
    totalForks,
    contributedTo: reposData.filter((repo: GitHubRepo) => repo.fork).length, // Forked repos
    
    // Activity statistics (from recent events)
    totalCommits,
    totalPRs,
    totalIssues,
    currentStreak,
    longestStreak,
    
    // Technical profile
    topLanguages,
    recentRepoActivity,
    
    // Metadata
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Common handler for GitHub stats requests.
 * Handles caching, validation, and error responses.
 * @param username - GitHub username to fetch stats for
 * @param force - Whether to force refresh cache
 * @param res - Express response object
 */
async function handleStatsRequest(
  username: string | undefined,
  force: string | undefined,
  res: ExpressResponse
): Promise<ExpressResponse> {
  try {
    // Validate username parameter
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'Username parameter required',
        usage: [
          'GET /api/github/v2/stats?username=username',
          'GET /api/github/v2/stats/username'
        ]
      });
    }

    const cacheKey = `stats_${username}`;
    const now = Date.now();
    const forceRefresh = force === 'true';

    // Check for cached stats (skip if force refresh requested)
    if (!forceRefresh && cache[cacheKey]) {
      if (now - cache[cacheKey].lastUpdated < STATS_CACHE_DURATION) {
        console.log(`Cache hit for stats: ${username}`);
        const cachedStats = cache[cacheKey].data as GitHubStats;
        return res.json({
          ...cachedStats,
          cacheAge: Math.floor((now - cache[cacheKey].lastUpdated) / 1000)
        });
      }
    }

    console.log(`Fetching GitHub stats for: ${username}`);

    // Fetch fresh stats from GitHub API
    const stats = await fetchGitHubStats(username);

    // Cache the new stats for future requests
    setCacheEntry(cacheKey, stats);
    console.log(`Cached stats for user: ${username}`);
    
    return res.json(stats);

  } catch (error: unknown) {
    console.error('GitHub stats error:', error);

    // Handle specific error types with appropriate responses
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: error.message
        });
      }
      
      if (error.message.includes('authentication failed')) {
        return res.status(401).json({
          error: 'GitHub API authentication failed',
          details: 'Invalid or expired GitHub token. Please check your GITHUB_TOKEN environment variable.',
          suggestion: 'Create a new GitHub Personal Access Token at https://github.com/settings/tokens'
        });
      }

      if (error.message.includes('fetch failed') || (error as { code?: string }).code === 'ENOTFOUND') {
        return res.status(503).json({
          error: 'Network connectivity issue - cannot reach GitHub API',
          details: error.message
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch GitHub stats',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'An unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET handler to fetch and return a user's GitHub stats using query parameter.
 * Uses caching for performance.
 */
githubRouter.get('/v2/stats', async (req: Request, res: ExpressResponse) => {
  const { username, force } = req.query;
  return handleStatsRequest(username as string, force as string, res);
});

/**
 * GET handler to fetch and return a user's GitHub stats using URL parameter.
 * This route is an alternative to the query parameter route.
 */
githubRouter.get('/v2/stats/:username', async (req: Request, res: ExpressResponse) => {
  const { username } = req.params;
  const { force } = req.query;
  return handleStatsRequest(username, force as string, res);
});
