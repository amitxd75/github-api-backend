import { Router, Request, Response as ExpressResponse } from 'express';
import { CacheEntry, GitHubEvent, GitHubRepo, GitHubStats, GitHubUser } from '../types';

// In-memory cache for API responses.
const cache: Record<string, CacheEntry> = {};

// Cache duration constants.
// CACHE_DURATION is for general API endpoints (14 days).
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 14; 
// STATS_CACHE_DURATION is shorter for stats (6 hours).
const STATS_CACHE_DURATION = 1000 * 60 * 60 * 6;

// Export the router to be used in the main application.
export const githubRouter = Router();

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
          return res.json({
            ...cachedData,
            _cached: true,
            _cacheAge: Math.floor((now - cache[endpoint].lastUpdated) / 1000)
          });
        }
      }
    }

    // Set up headers for the GitHub API request.
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Portfolio-Backend/2.0',
    };

    // Add GitHub token if available for higher rate limits.
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== '****************iiNA') {
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

    // Cache the new data if caching is enabled.
    if (shouldUseCache) {
      cache[endpoint] = {
        data,
        lastUpdated: now,
      };
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

/**
 * GET handler to check cache status.
 */
githubRouter.get('/v2/cache/status', (req: Request, res: ExpressResponse) => {
  const entries = Object.keys(cache).length;
  const totalSize = JSON.stringify(cache).length;
  
  res.json({
    entries,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
    endpoints: Object.keys(cache),
    cacheDuration: `${CACHE_DURATION / (1000 * 60 * 60 * 24)} days`
  });
});

/**
 * DELETE handler to clear the entire cache.
 */
githubRouter.delete('/v2/cache', (req: Request, res: ExpressResponse) => {
  const entriesCleared = Object.keys(cache).length;
  
  for (const key in cache) {
    delete cache[key];
  }
  
  res.json({
    message: 'Cache cleared successfully',
    entriesCleared
  });
});

/**
 * DELETE handler to clear a specific cache entry.
 */
githubRouter.delete('/v2/cache/:endpoint(*)', (req: Request, res: ExpressResponse) => {
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

/**
 * Fetches and calculates a user's comprehensive GitHub statistics.
 * @param username The GitHub username.
 * @returns A promise that resolves to a GitHubStats object.
 */
const fetchGitHubStats = async (username: string): Promise<GitHubStats> => {
  // Set up headers for the GitHub API.
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Portfolio-Backend/2.0',
  };

  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== '****************iiNA') {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  // Fetch user, repo, and event data in parallel.
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

  const reposResponse = await fetchWithRetry(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers });
  if (!reposResponse.ok) {
    throw new Error(`Failed to fetch repositories: ${reposResponse.status}`);
  }
  const reposData = await reposResponse.json() as GitHubRepo[];

  const eventsResponse = await fetchWithRetry(`https://api.github.com/users/${username}/events?per_page=100`, { headers });
  if (!eventsResponse.ok) {
    throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
  }
  const eventsData = await eventsResponse.json() as GitHubEvent[];

  // Calculate total stars, forks, and recent activity.
  let totalStars = 0;
  let totalForks = 0;
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let recentRepoActivity = 0;

  const ownRepos = reposData.filter(repo => !repo.fork);

  for (const repo of ownRepos) {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;

    if (new Date(repo.pushed_at).getTime() > oneMonthAgo) {
      recentRepoActivity++;
    }
  }

  // Fetch language data for each repository in batches.
  const allLanguageBytes: Record<string, number> = {};
  let totalLanguageBytes = 0;

  const batchSize = 5;
  for (let i = 0; i < ownRepos.length; i += batchSize) {
    const batch = ownRepos.slice(i, i + batchSize);
    const languagePromises = batch.map(async (repo) => {
      try {
        const repoName = repo.name || repo.full_name?.split('/')[1];
        if (!repoName) return {};
        
        const langResponse = await fetchWithRetry(`https://api.github.com/repos/${username}/${repoName}/languages`, { headers });
        if (langResponse.ok) {
          const languages = await langResponse.json() as Record<string, number>;
          return languages;
        }
      } catch (error) {
        console.warn(`Failed to fetch languages for repo: ${repo.name}`);
        return {};
      }
      return {};
    });

    const batchResults = await Promise.all(languagePromises);
    
    batchResults.forEach((languages) => {
      if (languages) {
        Object.entries(languages).forEach(([lang, bytes]) => {
          allLanguageBytes[lang] = (allLanguageBytes[lang] || 0) + bytes;
          totalLanguageBytes += bytes;
        });
      }
    });

    // Add a small delay between batches to avoid rate limiting.
    if (i + batchSize < ownRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Calculate top languages by percentage.
  const topLanguages = totalLanguageBytes > 0
    ? Object.fromEntries(
      Object.entries(allLanguageBytes)
        .map(([lang, bytes]) => [lang, Math.round((bytes / totalLanguageBytes) * 100)])
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .filter(([, percentage]) => (percentage as number) > 0)
    )
    : {};

  // Calculate total commits, PRs, and issues from events.
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;

  eventsData.forEach((event: GitHubEvent) => {
    switch (event.type) {
      case 'PushEvent':
        totalCommits += event.payload.commits?.length || 0;
        break;
      case 'PullRequestEvent':
        totalPRs++;
        break;
      case 'IssuesEvent':
        totalIssues++;
        break;
    }
  });

  // Calculate current and longest contribution streaks.
  const contributions = eventsData
    .filter((event: GitHubEvent) => event.type === 'PushEvent')
    .map((event: GitHubEvent) => new Date(event.created_at).toDateString());

  const uniqueDates = [...new Set(contributions)];
  const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const today = new Date().toDateString();

  for (let i = 0; i < sortedDates.length; i++) {
    const currentDateStr = sortedDates[i];
    const nextDateStr = i < sortedDates.length - 1 ? sortedDates[i + 1] : null;
    
    if (!currentDateStr) continue;
    
    const currentDate = new Date(currentDateStr);
    const nextDate = nextDateStr ? new Date(nextDateStr) : null;

    if (nextDate) {
      const dayDiff = Math.floor((currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff === 1) {
        tempStreak++;
      } else {
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        tempStreak = 0;
      }
    }

    if (currentDateStr === today || 
        Math.floor((new Date().getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) <= 1) {
      currentStreak = tempStreak + 1;
    }
  }

  if (tempStreak > longestStreak) longestStreak = tempStreak;

  // Determine last activity date.
  const lastActivity = eventsData.length > 0 && eventsData[0]?.created_at
    ? eventsData[0].created_at
    : userData.created_at;

  // Return the compiled stats object.
  return {
    username: userData.login,
    followers: userData.followers,
    following: userData.following,
    publicRepos: userData.public_repos,
    publicGists: userData.public_gists,
    accountCreated: userData.created_at,
    lastActivity: lastActivity,
    
    totalRepos: reposData.length,
    totalStars,
    totalForks,
    contributedTo: reposData.filter((repo: GitHubRepo) => repo.fork).length,
    
    totalCommits,
    totalPRs,
    totalIssues,
    currentStreak,
    longestStreak,
    
    topLanguages,
    recentRepoActivity,
    
    lastUpdated: new Date().toISOString()
  };
};

/**
 * GET handler to fetch and return a user's GitHub stats.
 * Uses caching for performance.
 */
githubRouter.get('/v2/stats', async (req: Request, res: ExpressResponse) => {
  try {
    const { username, force } = req.query;

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

    // Check for cached stats.
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

    const stats = await fetchGitHubStats(username);

    // Cache the new stats.
    cache[cacheKey] = {
      data: stats,
      lastUpdated: now
    };

    console.log(`Cached stats for user: ${username}`);
    return res.json(stats);

  } catch (error: unknown) {
    console.error('GitHub stats error:', error);

    // Handle specific errors.
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

      if (error.message.includes('fetch failed') || (error as any).code === 'ENOTFOUND') {
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
});

/**
 * GET handler to fetch and return a user's GitHub stats, using a URL parameter.
 * This route is an alternative to the query parameter route.
 */
githubRouter.get('/v2/stats/:username', async (req: Request, res: ExpressResponse) => {
  try {
    const { username } = req.params;
    const { force } = req.query;

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

    // Check for cached stats.
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

    const stats = await fetchGitHubStats(username);

    // Cache the new stats.
    cache[cacheKey] = {
      data: stats,
      lastUpdated: now
    };

    console.log(`Cached stats for user: ${username}`);
    return res.json(stats);

  } catch (error: unknown) {
    console.error('GitHub stats error:', error);

    // Handle specific errors.
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

      if (error.message.includes('fetch failed') || (error as any).code === 'ENOTFOUND') {
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
});
