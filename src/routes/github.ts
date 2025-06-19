import { Router, Request, Response } from 'express';
import { CacheEntry, GitHubEvent, GitHubRepo, GitHubStats, GitHubUser } from '../types';

const cache: Record<string, CacheEntry> = {};
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 14; // 14 days
const STATS_CACHE_DURATION = 1000 * 60 * 60 * 6; // 6 hours for stats

export const githubRouter = Router();

/**
 * GitHub API proxy endpoint
 * 
 * Usage examples:
 * 1. Fetch user repos:
 *    GET /api/github/v2/?endpoint=/users/username/repos
 * 
 * 2. Fetch specific repo:
 *    GET /api/github/v2/?endpoint=/repos/username/repo-name
 *
 * 3. Fetch with caching:
 *    GET /api/github/v2/?endpoint=/users/username/repos&cache=true
 *
 * Query Parameters:
 * - endpoint: Required. The GitHub API endpoint to proxy (must start with /)
 * - cache: Set to 'true' to enable caching
 */
githubRouter.get('/v2', async (req: Request, res: Response) => {
  try {
    const { endpoint, cache: cacheParam } = req.query;

    // Validate endpoint parameter
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ 
        error: 'Endpoint parameter required',
        usage: 'GET /api/github/v2?endpoint=/users/username/repos'
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
    const shouldUseCache = cacheParam === 'true';

    // Check cache if enabled
    if (shouldUseCache && cache[endpoint]) {
      if (now - cache[endpoint].lastUpdated < CACHE_DURATION) {
        console.log(`Cache hit for endpoint: ${endpoint}`);
        
        // Return cached data directly without wrapping in object
        const cachedData = cache[endpoint].data;
        
        // Add cache metadata only if it's not already an array
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

    // Prepare headers for GitHub API
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Portfolio-Backend/2.0',
    };

    // Add authorization if token is available and valid
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== '****************iiNA') {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    // Make request to GitHub API
    const url = `https://api.github.com${endpoint}`;
    console.log(`Fetching from GitHub: ${url}`);
    
    const response = await fetch(url, { headers });

    // Handle different response statuses
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

    // Parse successful response
    const data = await response.json();
    
    // Validate that we received valid data
    if (data === null || data === undefined) {
      return res.status(500).json({
        error: 'No data received from GitHub API',
        endpoint: endpoint
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

    // For array responses (like repos), return the array directly
    if (Array.isArray(data)) {
      console.log(`Returning array with ${data.length} items for ${endpoint}`);
      return res.json(data);
    }

    // For object responses (like user data), add metadata
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
githubRouter.get('/v2/cache/status', (req: Request, res: Response) => {
  const entries = Object.keys(cache).length;
  const totalSize = JSON.stringify(cache).length;
  
  res.json({
    entries,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
    endpoints: Object.keys(cache),
    cacheDuration: `${CACHE_DURATION / (1000 * 60 * 60 * 24)} days`
  });
});

githubRouter.delete('/v2/cache', (req: Request, res: Response) => {
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

githubRouter.delete('/v2/cache/:endpoint(*)', (req: Request, res: Response) => {
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

// Helper function to fetch GitHub stats
const fetchGitHubStats = async (username: string): Promise<GitHubStats> => {
  // Prepare headers for GitHub API
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Portfolio-Backend/2.0',
  };

  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== '****************iiNA') {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  // Fetch user data
  const userResponse = await fetch(`https://api.github.com/users/${username}`, { headers });
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

  // Fetch user repositories
  const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers });
  if (!reposResponse.ok) {
    throw new Error(`Failed to fetch repositories: ${reposResponse.status}`);
  }
  const reposData = await reposResponse.json() as GitHubRepo[];

  // Fetch user events for activity data
  const eventsResponse = await fetch(`https://api.github.com/users/${username}/events?per_page=100`, { headers });
  if (!eventsResponse.ok) {
    throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
  }
  const eventsData = await eventsResponse.json() as GitHubEvent[];

  // Process repository data
  let totalStars = 0;
  let totalForks = 0;
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let recentRepoActivity = 0;

  // Get non-fork repositories for language analysis
  const ownRepos = reposData.filter(repo => !repo.fork);

  for (const repo of ownRepos) {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;

    if (new Date(repo.pushed_at).getTime() > oneMonthAgo) {
      recentRepoActivity++;
    }
  }

  // Fetch language data for each repository (more accurate than using repo.size)
  const allLanguageBytes: Record<string, number> = {};
  let totalLanguageBytes = 0;

  // Limit concurrent requests to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < ownRepos.length; i += batchSize) {
    const batch = ownRepos.slice(i, i + batchSize);
    const languagePromises = batch.map(async (repo) => {
      try {
        const repoName = repo.name || repo.full_name?.split('/')[1];
        if (!repoName) return {};
        
        const langResponse = await fetch(`https://api.github.com/repos/${username}/${repoName}/languages`, { headers });
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

    // Add a small delay between batches to be nice to the API
    if (i + batchSize < ownRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Calculate top languages with proper percentages
  const topLanguages = totalLanguageBytes > 0
    ? Object.fromEntries(
      Object.entries(allLanguageBytes)
        .map(([lang, bytes]) => [lang, Math.round((bytes / totalLanguageBytes) * 100)])
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .filter(([, percentage]) => (percentage as number) > 0) // Only include languages with >0%
    )
    : {};

  // Process events data for activity stats
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

  // Calculate contribution streaks (simplified)
  const contributions = eventsData
    .filter((event: GitHubEvent) => event.type === 'PushEvent')
    .map((event: GitHubEvent) => new Date(event.created_at).toDateString());

  const uniqueDates = [...new Set(contributions)];
  const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Simple streak calculation
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

    // Check current streak
    if (currentDateStr === today || 
        Math.floor((new Date().getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) <= 1) {
      currentStreak = tempStreak + 1;
    }
  }

  if (tempStreak > longestStreak) longestStreak = tempStreak;

  // Get last activity date
  const lastActivity = eventsData.length > 0 && eventsData[0]?.created_at
    ? eventsData[0].created_at 
    : userData.created_at;

  // Compile stats
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
 * GitHub Stats endpoint with query parameter
 * 
 * Usage:
 * GET /api/github/v2/stats?username=username&force=true
 */
githubRouter.get('/v2/stats', async (req: Request, res: Response) => {
  try {
    const { username, force } = req.query;

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

    // Check cache if not forcing refresh
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

    // Fetch stats using helper function
    const stats = await fetchGitHubStats(username);

    // Cache the stats
    cache[cacheKey] = {
      data: stats,
      lastUpdated: now
    };

    console.log(`Cached stats for user: ${username}`);
    return res.json(stats);

  } catch (error: unknown) {
    console.error('GitHub stats error:', error);

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
 * GitHub Stats endpoint with path parameter
 * 
 * Usage:
 * GET /api/github/v2/stats/username
 * GET /api/github/v2/stats/username?force=true
 */
githubRouter.get('/v2/stats/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { force } = req.query;

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

    // Check cache if not forcing refresh
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

    // Fetch stats using helper function
    const stats = await fetchGitHubStats(username);

    // Cache the stats
    cache[cacheKey] = {
      data: stats,
      lastUpdated: now
    };

    console.log(`Cached stats for user: ${username}`);
    return res.json(stats);

  } catch (error: unknown) {
    console.error('GitHub stats error:', error);

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