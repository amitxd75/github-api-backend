/**
 * Type definitions for the GitHub API Backend.
 * These interfaces define the structure of data used throughout the application.
 */

/**
 * Cache entry structure for in-memory caching system.
 * Used to store API responses with timestamp for TTL management.
 */
export interface CacheEntry {
  /** The cached data (can be any JSON-serializable object) */
  data: unknown;
  /** Unix timestamp when this entry was last updated */
  lastUpdated: number;
}

/**
 * Comprehensive GitHub user statistics interface.
 * Aggregates data from multiple GitHub API endpoints to provide
 * a complete picture of a user's GitHub activity and contributions.
 */
export interface GitHubStats {
  // Basic user information
  /** GitHub username */
  username: string;
  /** Number of followers */
  followers: number;
  /** Number of users being followed */
  following: number;
  /** Number of public repositories */
  publicRepos: number;
  /** Number of public gists */
  publicGists: number;
  /** ISO date string when account was created */
  accountCreated: string;
  /** ISO date string of last activity */
  lastActivity: string;
  
  // Repository statistics
  /** Total number of repositories (including forks) */
  totalRepos: number;
  /** Total stars received across all original repositories */
  totalStars: number;
  /** Total forks of user's original repositories */
  totalForks: number;
  /** Number of repositories that are forks of other projects */
  contributedTo: number;
  
  // Activity statistics (from recent events)
  /** Total commits from recent activity (limited by GitHub events API) */
  totalCommits: number;
  /** Total pull requests from recent activity */
  totalPRs: number;
  /** Total issues from recent activity */
  totalIssues: number;
  /** Current contribution streak in days */
  currentStreak: number;
  /** Longest contribution streak in days */
  longestStreak: number;
  
  // Technical profile
  /** Top programming languages by percentage of code */
  topLanguages: Record<string, number>;
  /** Number of repositories with activity in the last 30 days */
  recentRepoActivity: number;
  
  // Metadata
  /** ISO date string when these stats were last calculated */
  lastUpdated: string;
  /** Age of cached data in seconds (only present for cached responses) */
  cacheAge?: number;
}

/**
 * GitHub User API response interface.
 * Represents the structure returned by GitHub's /users/{username} endpoint.
 */
export interface GitHubUser {
  /** GitHub username */
  login: string;
  /** Number of followers */
  followers: number;
  /** Number of users being followed */
  following: number;
  /** Number of public repositories */
  public_repos: number;
  /** Number of public gists */
  public_gists: number;
  /** ISO date string when account was created */
  created_at: string;
}

/**
 * GitHub Repository API response interface.
 * Represents the structure returned by GitHub's repository endpoints.
 */
export interface GitHubRepo {
  /** Repository name */
  name: string;
  /** Full repository name including owner (e.g., "owner/repo") */
  full_name: string;
  /** Number of stars the repository has received */
  stargazers_count: number;
  /** Number of times the repository has been forked */
  forks_count: number;
  /** Primary programming language (null if not detected) */
  language: string | null;
  /** Repository size in kilobytes */
  size: number;
  /** ISO date string of last push to the repository */
  pushed_at: string;
  /** Whether this repository is a fork of another repository */
  fork: boolean;
}

/**
 * GitHub Event API response interface.
 * Represents the structure returned by GitHub's /users/{username}/events endpoint.
 */
export interface GitHubEvent {
  /** Type of event (e.g., "PushEvent", "PullRequestEvent", "IssuesEvent") */
  type: string;
  /** ISO date string when the event occurred */
  created_at: string;
  /** Event-specific payload data */
  payload: {
    /** Commits associated with the event (for PushEvent) */
    commits?: Array<{
      /** Commit SHA hash */
      sha: string;
      /** Commit message */
      message: string;
      /** Commit author information */
      author: {
        /** Author name */
        name: string;
        /** Author email */
        email: string;
      };
    }>;
  };
}