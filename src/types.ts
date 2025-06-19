// Simple in-memory cache
export interface CacheEntry {
  data: any;
  lastUpdated: number;
}

// GitHub Stats interface
export interface GitHubStats {
  // User info
  username: string;
  followers: number;
  following: number;
  publicRepos: number;
  publicGists: number;
  accountCreated: string;
  lastActivity: string;
  
  // Repository stats
  totalRepos: number;
  totalStars: number;
  totalForks: number;
  contributedTo: number;
  
  // Activity stats
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  currentStreak: number;
  longestStreak: number;
  
  // Language stats
  topLanguages: Record<string, number>;
  recentRepoActivity: number;
  
  // Metadata
  lastUpdated: string;
  cacheAge?: number;
}

// GitHub API response interfaces
export interface GitHubUser {
  login: string;
  followers: number;
  following: number;
  public_repos: number;
  public_gists: number;
  created_at: string;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  size: number;
  pushed_at: string;
  fork: boolean;
}

export interface GitHubEvent {
  type: string;
  created_at: string;
  payload: {
    commits?: Array<{ sha: string; message: string; author: { name: string; email: string } }>;
  };
}