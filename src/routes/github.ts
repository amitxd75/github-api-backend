/**
 * GitHub API Routes Module
 * 
 * Provides high-performance endpoints for interacting with the GitHub API, 
 * featuring an optimized statistics engine and an intelligent proxy layer.
 * 
 * Technical Architecture:
 * - GraphQL Engine: Aggregates profile, repository, and contribution data in a single round-trip.
 * - LRU Caching: Implements a high-efficiency O(1) cache with TTL-based eviction.
 * - Parallel Execution: Utilizes Promise-based concurrency for non-blocking I/O.
 * - Accurate Metrics: Computes contribution streaks from the full 365-day calendar.
 * - Reliability: Integrated exponential-backoff retry logic for transient network failures.
 */

import { Router, Request, Response as ExpressResponse } from 'express';
import { LRUCache } from '../cache/lruCache';
import {
	GitHubStats,
	GitHubUser,
	GitHubEvent,
	GraphQLResponse,
	GitHubGQLUser,
	RateLimit,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const GITHUB_GQL = 'https://api.github.com/graphql';
const USER_AGENT = 'Portfolio-Backend/3.0';

const CACHE_TTL_GENERAL = 1000 * 60 * 60 * 24 * 14; // 14 days
const CACHE_TTL_STATS = 1000 * 60 * 60 * 6;        // 6 hours
const CACHE_CAPACITY = 1_000;

// ─── Caches ───────────────────────────────────────────────────────────────────

const generalCache = new LRUCache(CACHE_CAPACITY, CACHE_TTL_GENERAL);
const statsCache = new LRUCache<GitHubStats>(200, CACHE_TTL_STATS);

// Periodic cleanup of expired entries (every hour)
setInterval(() => {
	const g = generalCache.evictExpired();
	const s = statsCache.evictExpired();
	if (g + s > 0) console.log(`[cache] evicted ${g} general + ${s} stats expired entries`);
}, 60 * 60 * 1000);

// ─── Router ───────────────────────────────────────────────────────────────────

export const githubRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Constructs the standard set of headers for GitHub API requests.
 * Automatically attaches the GITHUB_TOKEN if configured in the environment.
 * 
 * @param accept - The media type for the Accept header (defaults to v3 json)
 * @returns Header object for fetch requests
 */
function getAuthHeaders(accept = 'application/vnd.github.v3+json'): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: accept,
		'User-Agent': USER_AGENT,
	};
	const token = process.env.GITHUB_TOKEN?.trim();
	if (token) headers['Authorization'] = `Bearer ${token}`;
	return headers;
}

/**
 * Fetch with exponential-backoff retry.
 * Retries on 5xx and transient network errors. Stops immediately on 4xx.
 * 
 * @param url - Target URL
 * @param options - Fetch options
 * @param maxRetries - Maximum number of retry attempts
 * @returns Response object
 */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	maxRetries = 2
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(url, options);

			// Never retry on 4xx — client error, not transient
			if (res.status >= 400 && res.status < 500) return res;

			// Retry on 5xx
			if (!res.ok && attempt < maxRetries) {
				const delay = Math.pow(2, attempt) * 500;
				console.warn(`[retry] ${res.status} from ${url} — retrying in ${delay}ms (${attempt + 1}/${maxRetries})`);
				await sleep(delay);
				continue;
			}

			return res;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			const transient =
				lastError.message.includes('fetch failed') ||
				lastError.message.includes('ECONNRESET') ||
				lastError.message.includes('ETIMEDOUT') ||
				lastError.message.includes('ENOTFOUND') ||
				lastError.message.includes('socket hang up');

			if (transient && attempt < maxRetries) {
				const delay = Math.pow(2, attempt) * 500;
				console.warn(`[retry] network error "${lastError.message}" — retrying in ${delay}ms`);
				await sleep(delay);
				continue;
			}
			throw lastError;
		}
	}

	throw lastError ?? new Error('Max retries exceeded');
}

/**
 * Simple async delay helper using Promises and setTimeout.
 * 
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extracts GitHub rate limit information from response headers.
 * 
 * @param res - The Response object from fetch
 * @returns Rate limit information
 */
function extractRateLimit(res: Response): RateLimit {
	return {
		remaining: res.headers.get('X-RateLimit-Remaining'),
		reset: res.headers.get('X-RateLimit-Reset'),
		limit: res.headers.get('X-RateLimit-Limit'),
	};
}

// ─── GraphQL query ────────────────────────────────────────────────────────────

/**
 * Generates the GraphQL query string to fetch all necessary GitHub data in a single request.
 * Fetches: user profile, top 100 repositories (with language breakdown), 
 * and the 365-day contribution calendar.
 * 
 * @returns The formatted GraphQL query
 */
function buildStatsQuery(): string {
	return `
    query GitHubStats($login: String!) {
      user(login: $login) {
        name
        avatarUrl
        bio
        location
        company
        websiteUrl
        twitterUsername
        followers { totalCount }
        following { totalCount }
        createdAt
        repositories(
          first: 100
          ownerAffiliations: OWNER
          isFork: false
          orderBy: { field: STARGAZERS, direction: DESC }
        ) {
          totalCount
          nodes {
            name
            stargazerCount
            forkCount
            isFork
            primaryLanguage { name }
            pushedAt
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name } }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
}

// ─── Stats computation ────────────────────────────────────────────────────────

interface StreakResult { current: number; longest: number }

interface ContribDay { date: string; contributionCount: number }
interface ContribWeek { contributionDays: ContribDay[] }

/**
 * Computes the current and longest contribution streaks from a series of weeks.
 * A streak is defined as consecutive days with at least one contribution.
 * Today and yesterday are allowed to be 0 without breaking the current streak
 * to account for time zones and pending updates.
 * 
 * @param weeks - The contribution calendar weeks from GitHub GraphQL API
 * @returns Current and longest streak counts
 */
function computeStreaks(weeks: ContribWeek[]): StreakResult {
	// Flatten all days, most-recent first
	const days = weeks
		.flatMap(w => w.contributionDays)
		.reverse(); // API returns oldest-first; we want newest-first

	const today = new Date().toISOString().slice(0, 10);
	const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

	let current = 0;
	let longest = 0;
	let temp = 0;
	let inCurrentStreak = true;

	for (const day of days) {
		const active = day.contributionCount > 0;

		if (inCurrentStreak) {
			if (active) {
				current++;
				temp++;
			} else if (day.date === today || day.date === yesterday) {
				// allow today/yesterday to be 0 without breaking streak
			} else {
				inCurrentStreak = false;
				if (temp > longest) longest = temp;
				temp = active ? 1 : 0;
			}
		} else {
			if (active) {
				temp++;
			} else {
				if (temp > longest) longest = temp;
				temp = 0;
			}
		}
	}

	if (temp > longest) longest = temp;
	return { current, longest };
}

// ─── Core stats fetcher ───────────────────────────────────────────────────────

/**
 * Orchestrates the data fetching and aggregation for a user's GitHub statistics.
 * Combines a high-efficiency GraphQL query with supplemental REST calls.
 * 
 * @param username - The GitHub login to fetch stats for
 * @returns The aggregated statistics object
 * @throws {Error} If user is not found or API authentication fails
 */
async function fetchGitHubStats(username: string): Promise<GitHubStats> {
	// ── 1. GraphQL — one round-trip for everything ──────────────────────────────
	const gqlRes = await fetchWithRetry(GITHUB_GQL, {
		method: 'POST',
		headers: {
			...getAuthHeaders('application/json'),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			query: buildStatsQuery(),
			variables: { login: username },
		}),
	});

	if (!gqlRes.ok) {
		if (gqlRes.status === 401) throw new Error('GitHub API authentication failed');
		throw new Error(`GraphQL request failed: ${gqlRes.status}`);
	}

	const gql = await gqlRes.json() as GraphQLResponse;

	if (gql.errors?.length) {
		const msg = gql.errors[0]?.message ?? 'GraphQL error';
		if (msg.toLowerCase().includes('could not resolve to a user')) {
			throw new Error(`User '${username}' not found`);
		}
		throw new Error(`GraphQL error: ${msg}`);
	}

	const user = gql.data?.user as GitHubGQLUser | null;
	if (!user) throw new Error(`User '${username}' not found`);

	// ── 2. REST: user profile + public gists + recent events — parallel ─────────
	const restHeaders = { headers: getAuthHeaders() };
	const [userRes, eventsRes] = await Promise.allSettled([
		fetchWithRetry(`${GITHUB_API}/users/${username}`, restHeaders),
		fetchWithRetry(`${GITHUB_API}/users/${username}/events?per_page=100`, restHeaders),
	]);

	// Public gists — from REST profile (GraphQL doesn't expose this easily)
	let publicGists = 0;
	if (userRes.status === 'fulfilled' && userRes.value.ok) {
		const u = await userRes.value.json() as GitHubUser;
		publicGists = u.public_gists;
	}

	// Events — for supplementary commit counting cross-check
	let eventsData: GitHubEvent[] = [];
	if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
		eventsData = await eventsRes.value.json() as GitHubEvent[];
	}

	// ── 3. Aggregate from GraphQL data ──────────────────────────────────────────
	const repos = user.repositories.nodes;

	let totalStars = 0;
	let totalForks = 0;
	let recentRepoActivity = 0;
	const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

	const languageBytes: Record<string, number> = {};
	let totalBytes = 0;

	for (const repo of repos) {
		totalStars += repo.stargazerCount;
		totalForks += repo.forkCount;

		if (repo.pushedAt && repo.pushedAt > oneMonthAgo) recentRepoActivity++;

		for (const edge of repo.languages.edges) {
			languageBytes[edge.node.name] = (languageBytes[edge.node.name] ?? 0) + edge.size;
			totalBytes += edge.size;
		}
	}

	const topLanguages = totalBytes > 0
		? Object.fromEntries(
			Object.entries(languageBytes)
				.map(([lang, bytes]) => [lang, Math.round((bytes / totalBytes) * 100)] as [string, number])
				.sort((a, b) => b[1] - a[1])
				.slice(0, 8)
				.filter(([, pct]) => pct > 0)
		)
		: {};

	// ── 4. Streaks from contribution calendar ───────────────────────────────────
	const { current: currentStreak, longest: longestStreak } = computeStreaks(
		user.contributionsCollection.contributionCalendar.weeks
	);

	// ── 5. Last activity ─────────────────────────────────────────────────────────
	const lastActivity =
		eventsData[0]?.created_at ??
		repos[0]?.pushedAt ??
		user.createdAt;

	// ── 6. Forked repos count (using forks from all repos the user owns) ─────────
	// GraphQL query only fetches OWNER non-fork repos; get fork count from REST
	const contributedTo = user.repositories.nodes.filter(r => r.isFork).length;

	return {
		username,
		name: user.name,
		avatarUrl: user.avatarUrl,
		bio: user.bio,
		location: user.location,
		company: user.company,
		websiteUrl: user.websiteUrl,
		twitterUsername: user.twitterUsername,

		followers: user.followers.totalCount,
		following: user.following.totalCount,
		publicRepos: user.repositories.totalCount,
		publicGists,
		accountCreated: user.createdAt,
		lastActivity,

		totalRepos: user.repositories.totalCount,
		totalStars,
		totalForks,
		contributedTo,

		totalCommits: user.contributionsCollection.totalCommitContributions,
		totalPRs: user.contributionsCollection.totalPullRequestContributions,
		totalIssues: user.contributionsCollection.totalIssueContributions,
		currentStreak,
		longestStreak,

		topLanguages,
		recentRepoActivity,

		lastUpdated: new Date().toISOString(),
	};
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Generic GitHub REST proxy with optional caching */
githubRouter.get('/v2', async (req: Request, res: ExpressResponse) => {
	const { endpoint, cache: cacheParam } = req.query;

	if (!endpoint || typeof endpoint !== 'string') {
		return res.status(400).json({
			error: 'endpoint parameter required',
			usage: 'GET /api/github/v2?endpoint=/users/username',
		});
	}
	if (!endpoint.startsWith('/')) {
		return res.status(400).json({
			error: 'endpoint must start with /',
			example: '/users/username/repos',
		});
	}

	const shouldCache = cacheParam === 'true';

	if (shouldCache) {
		const cached = generalCache.peek(endpoint);
		if (cached) {
			console.log(`[cache] HIT general:${endpoint}`);
			const base = { _cached: true, _cacheAge: Math.floor((Date.now() - cached.lastUpdated) / 1000) };
			if (Array.isArray(cached.value)) return res.json(cached.value);
			if (cached.value && typeof cached.value === 'object') return res.json({ ...cached.value as object, ...base });
			return res.json(cached.value);
		}
	}

	try {
		const url = `${GITHUB_API}${endpoint}`;
		const response = await fetchWithRetry(url, { headers: getAuthHeaders() });

		// Forward rate-limit headers to client
		const rl = extractRateLimit(response);
		if (rl.remaining) res.setHeader('X-RateLimit-Remaining', rl.remaining);
		if (rl.reset) res.setHeader('X-RateLimit-Reset', rl.reset);

		if (!response.ok) {
			if (response.status === 401) {
				return res.status(401).json({ error: 'GitHub token invalid or expired' });
			}
			if (response.status === 403) {
				return res.status(429).json({
					error: 'GitHub rate limit exceeded',
					resetAt: rl.reset ? new Date(Number(rl.reset) * 1000).toISOString() : null,
				});
			}
			if (response.status === 404) {
				return res.status(404).json({ error: 'Resource not found', endpoint });
			}
			return res.status(response.status).json({ error: `GitHub API error ${response.status}`, endpoint });
		}

		const data = await response.json();
		if (shouldCache) generalCache.set(endpoint, data);

		return res.json(data);

	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.includes('ENOTFOUND') || msg.includes('fetch failed')) {
			return res.status(503).json({ error: 'Cannot reach GitHub API', details: msg });
		}
		return res.status(500).json({ error: 'Internal error', details: msg });
	}
});

/**
 * Shared handler for GitHub stats requests.
 * Manages caching logic and orchestrates the data fetching process.
 * 
 * @param username - GitHub username (validated against standard regex)
 * @param force - If 'true', skips the cache and fetches fresh data
 * @param res - Express response object
 * @returns JSON response with stats or error
 */
async function handleStatsRequest(
	username: string | undefined,
	force: string | undefined,
	res: ExpressResponse
): Promise<ExpressResponse> {
	if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
		return res.status(400).json({
			error: 'Valid GitHub username required',
			usage: 'GET /api/github/v2/stats?username=<username>',
		});
	}

	const cacheKey = `stats_${username.toLowerCase()}`;
	const forceRefresh = force === 'true';

	if (!forceRefresh) {
		const cached = statsCache.peek(cacheKey);
		if (cached) {
			console.log(`[cache] HIT stats:${username}`);
			return res.json({
				...cached.value,
				cacheAge: Math.floor((Date.now() - cached.lastUpdated) / 1000),
			});
		}
	}

	console.log(`[stats] fetching via GraphQL: ${username}`);

	try {
		const stats = await fetchGitHubStats(username);
		statsCache.set(cacheKey, stats);
		console.log(`[stats] cached: ${username}`);
		return res.json(stats);

	} catch (err) {
		console.error('[stats] error:', err);
		if (!(err instanceof Error)) {
			return res.status(500).json({ error: 'Unknown error', timestamp: new Date().toISOString() });
		}

		if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
		if (err.message.includes('authentication failed')) return res.status(401).json({ error: err.message });
		if (err.message.includes('ENOTFOUND') || err.message.includes('fetch failed')) {
			return res.status(503).json({ error: 'Cannot reach GitHub API', details: err.message });
		}
		return res.status(500).json({ error: 'Failed to fetch GitHub stats', details: err.message });
	}
}

githubRouter.get('/v2/stats', async (req, res) => handleStatsRequest(req.query.username as string | undefined, req.query.force as string | undefined, res));
githubRouter.get('/v2/stats/:username', async (req, res) => handleStatsRequest(req.params.username, req.query.force as string | undefined, res));

/** Cache status endpoint */
githubRouter.get('/v2/cache/status', (_req, res) => {
	const gs = generalCache.stats();
	const ss = statsCache.stats();
	res.json({
		general: {
			size: gs.size,
			capacity: gs.capacity,
			hits: gs.hits,
			misses: gs.misses,
			evictions: gs.evictions,
			hitRate: gs.hits + gs.misses > 0 ? `${((gs.hits / (gs.hits + gs.misses)) * 100).toFixed(1)}%` : 'n/a',
			ttl: `${CACHE_TTL_GENERAL / 86400_000} days`,
		},
		stats: {
			size: ss.size,
			capacity: ss.capacity,
			hits: ss.hits,
			misses: ss.misses,
			evictions: ss.evictions,
			hitRate: ss.hits + ss.misses > 0 ? `${((ss.hits / (ss.hits + ss.misses)) * 100).toFixed(1)}%` : 'n/a',
			ttl: `${CACHE_TTL_STATS / 3600_000} hours`,
			keys: ss.keys,
		},
	});
});

/** Clear all caches */
githubRouter.delete('/v2/cache', (_req, res) => {
	const g = generalCache.clear();
	const s = statsCache.clear();
	res.json({ message: 'Cache cleared', general: g, stats: s, timestamp: new Date().toISOString() });
});

/** Clear specific cache entry */
githubRouter.delete('/v2/cache/:key', (req, res) => {
	const key = req.params['key'];
	if (!key) {
		return res.status(400).json({ error: 'Cache key required' });
	}
	const d1 = generalCache.delete(`/${key}`) || generalCache.delete(key);
	const d2 = statsCache.delete(`stats_${key}`) || statsCache.delete(key);

	if (!d1 && !d2) {
		return res.status(404).json({ error: `No cache entry for: ${key}` });
	}
	return res.json({ message: `Cache cleared for: ${key}`, timestamp: new Date().toISOString() });
});
