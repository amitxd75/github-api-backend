/**
 * GitHub API Backend - Data Models
 * 
 * Defines the core interfaces and types used for data transfer and internal 
 * state management across the application.
 * 
 * Domain Categories:
 * - Cache: Storage structures for the LRU system.
 * - Stats: Aggregated data models for user-facing statistics.
 * - REST API: Type definitions for GitHub's REST API responses.
 * - GraphQL: Schemas for the high-efficiency GraphQL engine.
 */

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Represents a generic entry stored in the cache.
 */
export interface CacheEntry<T = unknown> {
	/** The actual data being cached */
	data: T;
	/** Timestamp when the entry was last updated */
	lastUpdated: number;
	/** Number of times this entry has been accessed */
	hits: number;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Comprehensive aggregated statistics for a GitHub user.
 * This is the primary data model returned by the /stats endpoint.
 */
export interface GitHubStats {
	/** GitHub login/username */
	username: string;
	/** Display name of the user */
	name: string | null;
	/** URL to the user's avatar image */
	avatarUrl: string | null;
	/** User's biography */
	bio: string | null;
	/** User's location (city, country, etc.) */
	location: string | null;
	/** User's company affiliation */
	company: string | null;
	/** URL to the user's personal website */
	websiteUrl: string | null;
	/** User's Twitter handle */
	twitterUsername: string | null;

	/** Total number of followers */
	followers: number;
	/** Total number of users being followed */
	following: number;
	/** Total number of public repositories owned */
	publicRepos: number;
	/** Total number of public gists */
	publicGists: number;
	/** ISO timestamp of account creation */
	accountCreated: string;
	/** ISO timestamp of the user's most recent public activity */
	lastActivity: string;

	/** Total repository count (including mirrors if applicable) */
	totalRepos: number;
	/** Sum of stars across all owned repositories */
	totalStars: number;
	/** Sum of forks across all owned repositories */
	totalForks: number;
	/** Number of repositories the user has contributed to (forks) */
	contributedTo: number;

	/** Total commits in the last year */
	totalCommits: number;
	/** Total pull requests in the last year */
	totalPRs: number;
	/** Total issues opened in the last year */
	totalIssues: number;
	/** Current consecutive days with contributions */
	currentStreak: number;
	/** All-time highest consecutive days with contributions */
	longestStreak: number;

	/** Mapping of language names to their percentage usage across repos */
	topLanguages: Record<string, number>;
	/** Number of repositories with activity in the last 30 days */
	recentRepoActivity: number;

	/** ISO timestamp of when this data was fetched from GitHub */
	lastUpdated: string;
	/** Age of the cached data in seconds (if served from cache) */
	cacheAge?: number;
}

// ─── REST API shapes ──────────────────────────────────────────────────────────

/**
 * Partial representation of a GitHub User from the REST API.
 */
export interface GitHubUser {
	/** GitHub login/username */
	login: string;
	/** Display name */
	name: string | null;
	/** Avatar image URL */
	avatar_url: string | null;
	/** Biography */
	bio: string | null;
	/** Location */
	location: string | null;
	/** Company */
	company: string | null;
	/** Blog or website URL */
	blog: string | null;
	/** Twitter handle */
	twitter_username: string | null;
	/** Follower count */
	followers: number;
	/** Following count */
	following: number;
	/** Public repository count */
	public_repos: number;
	/** Public gist count */
	public_gists: number;
	/** ISO creation timestamp */
	created_at: string;
}

/**
 * Representation of a GitHub Repository from the REST API.
 */
export interface GitHubRepo {
	/** Repository name */
	name: string;
	/** Full repository name (owner/repo) */
	full_name: string;
	/** Star count */
	stargazers_count: number;
	/** Fork count */
	forks_count: number;
	/** Primary language */
	language: string | null;
	/** Size in KB */
	size: number;
	/** ISO timestamp of last push */
	pushed_at: string;
	/** Whether the repo is a fork */
	fork: boolean;
}

/**
 * Representation of a GitHub Event from the Events API.
 */
export interface GitHubEvent {
	/** Event type (e.g., PushEvent, PullRequestEvent) */
	type: string;
	/** ISO timestamp of event creation */
	created_at: string;
	/** Repository where the event occurred */
	repo?: { id: number; name: string; url: string };
	/** Event-specific data */
	payload: {
		/** List of commits (for PushEvents) */
		commits?: Array<{
			sha: string;
			message: string;
			author: { name: string; email: string };
		}>;
	};
}

/**
 * GitHub API rate limit status.
 */
export interface RateLimit {
	/** Remaining requests in current window */
	remaining: string | null;
	/** Unix timestamp when the window resets */
	reset: string | null;
	/** Total request limit per window */
	limit: string | null;
}

// ─── GraphQL shapes ───────────────────────────────────────────────────────────

/**
 * Represents a single day of contributions in the GraphQL contribution calendar.
 */
export interface GraphQLContribDay {
	/** ISO date string (YYYY-MM-DD) */
	date: string;
	/** Number of contributions on this day */
	contributionCount: number;
}

/**
 * Represents a week of contributions in the GraphQL contribution calendar.
 */
export interface GraphQLContribWeek {
	/** List of contribution days in the week */
	contributionDays: GraphQLContribDay[];
}

/**
 * Raw response structure from the GitHub GraphQL API for statistics.
 */
export interface GraphQLResponse {
	/** The data payload from GitHub */
	data: {
		/** User object containing all requested fields */
		user: {
			/** Display name */
			name: string | null;
			/** Avatar image URL */
			avatarUrl: string;
			/** Biography */
			bio: string | null;
			/** Location */
			location: string | null;
			/** Company affiliation */
			company: string | null;
			/** Personal website URL */
			websiteUrl: string | null;
			/** Twitter handle */
			twitterUsername: string | null;
			/** Follower metadata */
			followers: { totalCount: number };
			/** Following metadata */
			following: { totalCount: number };
			/** Repository metadata and nodes */
			repositories: {
				/** Total repository count */
				totalCount: number;
				/** Paginated repository list */
				nodes: Array<{
					/** Repository name */
					name: string;
					/** Star count */
					stargazerCount: number;
					/** Fork count */
					forkCount: number;
					/** Whether the repo is a fork */
					isFork: boolean;
					/** Primary language object */
					primaryLanguage: { name: string } | null;
					/** Detailed language breakdown */
					languages: {
						/** List of language edges with sizes */
						edges: Array<{ size: number; node: { name: string } }>;
					};
					/** ISO push timestamp */
					pushedAt: string | null;
				}>;
			};
			/** Aggregated contribution collections */
			contributionsCollection: {
				/** Total commits in the queried period */
				totalCommitContributions: number;
				/** Total pull requests in the queried period */
				totalPullRequestContributions: number;
				/** Total issues in the queried period */
				totalIssueContributions: number;
				/** The contribution calendar (for streak computation) */
				contributionCalendar: {
					/** List of contribution weeks */
					weeks: GraphQLContribWeek[];
				};
			};
			/** ISO account creation timestamp */
			createdAt: string;
		} | null;
	};
	/** List of errors returned by the GraphQL server */
	errors?: Array<{ message: string }>;
}

/** Helper type for a non-null GraphQL User object */
export type GitHubGQLUser = NonNullable<GraphQLResponse['data']['user']>;
