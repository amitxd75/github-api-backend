# 🚀 GitHub API Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-lightgrey.svg)](https://expressjs.com/)

> **A fast, accurate GitHub API proxy and stats aggregator. Features a GraphQL-powered statistics engine, high-performance LRU caching with TTL, and fully parallel data fetching.**

---

## ✨ Core Capabilities

- **High-Efficiency Stats** — Aggregates profile, repository, and contribution data in a single GraphQL round-trip.
- **Intelligent Proxy** — Secure access to any public GitHub REST endpoint with configurable caching.
- **O(1) LRU Cache** — Doubly-linked list + Map implementation with per-entry TTL and hit-rate tracking.
- **Accurate Metrics** — Computes contribution streaks from the full 365-day contribution calendar.
- **Hardened Reliability** — Integrated exponential-backoff retry logic and comprehensive error handling.

---

## ✨ Features

### 🎯 Core
- **GitHub GraphQL stats** — profile, repos, languages, commits, PRs, issues, and streaks in one query
- **GitHub REST proxy** — access any public GitHub endpoint with optional caching
- **Smart LRU cache** — O(1) get/set, per-entry TTL, hit-rate tracking, automatic eviction
- **Accurate streaks** — computed from the full contribution calendar (same data as your GitHub profile)
- **Retry logic** — exponential backoff on 5xx and transient network errors

### 🛡️ Security & Performance
- Helmet.js security headers
- Configurable CORS
- Rate-limit headers forwarded to the client
- Username validation before hitting GitHub
- Parallel REST fetches with `Promise.allSettled` (partial failure doesn't kill the whole request)

### 🚀 Deployment
- Local Express server
- Netlify Functions compatible
- Graceful shutdown (SIGTERM/SIGINT)

---

## 🏗️ Architecture

```
Client App
    │
    ▼
Express Server (server.ts)
    │
    ├── /api/github/v2/stats  ──►  GitHub GraphQL API  (1 request)
    │         │                          ↓
    │         └──────────────────  LRU Stats Cache (6h TTL)
    │
    └── /api/github/v2        ──►  GitHub REST API
              │                          ↓
              └──────────────────  LRU General Cache (14d TTL)
```

**File structure:**
```
src/
├── server.ts                  # Express app + startup
├── routes/
│   └── github.ts              # All GitHub routes + GraphQL logic
├── cache/
│   └── lruCache.ts            # LRU cache implementation
└── middleware/
    ├── requestLogger.ts
    └── errorHandler.ts
types.ts                       # Shared TypeScript interfaces
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- GitHub Personal Access Token (**required** for GraphQL — see note below)

> **Note:** The GraphQL API (`api.github.com/graphql`) requires authentication. Without a token the stats endpoint will return 401. The REST proxy endpoint works unauthenticated but is limited to 60 req/hr.

### Installation

```bash
git clone https://github.com/amitxd75/github-api-backend.git
cd github-api-backend
npm install
cp .env.example .env
# Add your GITHUB_TOKEN to .env
```

### Environment

```env
# Required for /stats (GraphQL needs auth)
GITHUB_TOKEN=ghp_your_token_here

# Comma-separated allowed CORS origins
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

NODE_ENV=development
PORT=3001
```

Get a token at [github.com/settings/tokens](https://github.com/settings/tokens) — only `read:user` and `public_repo` scopes are needed.

### Run

```bash
npm run dev     # development (hot reload)
npm run build   # compile TypeScript
npm start       # production
```

---

## 📡 API Reference

All endpoints are **identical to v2** — no client changes required.

### Base URL
- Local: `http://localhost:3001`
- Netlify: `https://your-site.netlify.app/.netlify/functions/api`

---

### `GET /health`

Server status, uptime, memory usage, token presence.

---

### `GET /api`

API documentation and available endpoints.

---

### `GET /api/github/v2?endpoint=<path>&cache=<true|false>`

Proxy any GitHub REST API endpoint.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `endpoint` | ✅ | GitHub API path, must start with `/` |
| `cache` | ❌ | Set to `true` to cache for 14 days |

**Examples:**
```bash
# User profile
curl "http://localhost:3001/api/github/v2?endpoint=/users/octocat"

# Repos with caching
curl "http://localhost:3001/api/github/v2?endpoint=/users/octocat/repos&cache=true"
```

---

### `GET /api/github/v2/stats?username=<username>&force=<true|false>`
### `GET /api/github/v2/stats/:username`

Fetch comprehensive stats for a GitHub user. Powered by GraphQL — one request to GitHub, cached for 6 hours.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `username` | ✅ | GitHub username |
| `force` | ❌ | `true` bypasses cache |

**Response:**
```json
{
  "username": "amitxd75",
  "name": "Amit",
  "avatarUrl": "https://avatars.githubusercontent.com/...",
  "bio": "...",
  "location": "...",
  "company": null,
  "websiteUrl": "https://...",
  "twitterUsername": null,

  "followers": 42,
  "following": 15,
  "publicRepos": 25,
  "publicGists": 3,
  "accountCreated": "2020-01-01T00:00:00Z",
  "lastActivity": "2024-06-01T12:00:00Z",

  "totalRepos": 25,
  "totalStars": 150,
  "totalForks": 30,
  "contributedTo": 5,

  "totalCommits": 1240,
  "totalPRs": 48,
  "totalIssues": 22,
  "currentStreak": 7,
  "longestStreak": 30,

  "topLanguages": {
    "TypeScript": 45,
    "JavaScript": 30,
    "Python": 15,
    "Go": 10
  },
  "recentRepoActivity": 3,
  "lastUpdated": "2024-06-01T12:00:00Z",

  "cacheAge": 3600
}
```

> `cacheAge` is only present on cached responses (seconds since last fetch).
> `totalCommits`, `totalPRs`, `totalIssues` reflect the current contribution year (resets Jan 1).

---

### `GET /api/github/v2/cache/status`

Cache health and hit-rate metrics.

```json
{
  "general": {
    "size": 12,
    "capacity": 1000,
    "hits": 340,
    "misses": 22,
    "evictions": 0,
    "hitRate": "93.9%",
    "ttl": "14 days"
  },
  "stats": {
    "size": 3,
    "capacity": 200,
    "hits": 87,
    "misses": 3,
    "evictions": 0,
    "hitRate": "96.7%",
    "ttl": "6 hours",
    "keys": ["stats_amitxd75"]
  }
}
```

### `DELETE /api/github/v2/cache`

Clear all cache entries.

### `DELETE /api/github/v2/cache/:key`

Clear a specific entry (e.g. `DELETE /api/github/v2/cache/amitxd75` or by endpoint path).

---

## 💻 Usage Examples

### JavaScript / React

```js
// Fetch comprehensive statistics
const res = await fetch('/api/github/v2/stats?username=amitxd75');
const stats = await res.json();

console.log(stats.totalCommits);   // now accurate (full year via GraphQL)
console.log(stats.currentStreak);  // now accurate (365-day calendar)
console.log(stats.avatarUrl);      // new field available
console.log(stats.name);           // new field available
```

### React Hook

```jsx
import { useState, useEffect } from 'react';

function useGitHubStats(username) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetch(`/api/github/v2/stats?username=${username}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [username]);

  return { stats, loading, error };
}

function GitHubProfile({ username }) {
  const { stats, loading, error } = useGitHubStats(username);
  if (loading) return <div>Loading...</div>;
  if (error)   return <div>Error: {error}</div>;
  return (
    <div>
      <img src={stats.avatarUrl} alt={stats.name} />
      <h2>{stats.name ?? stats.username}</h2>
      <p>⭐ {stats.totalStars} stars · 🔥 {stats.currentStreak} day streak</p>
    </div>
  );
}
```

### Python

```python
import requests

def get_github_stats(username, base_url="http://localhost:3001"):
    r = requests.get(f"{base_url}/api/github/v2/stats", params={"username": username})
    r.raise_for_status()
    return r.json()

stats = get_github_stats("amitxd75")
print(f"{stats['totalCommits']} commits · {stats['currentStreak']} day streak")
```

---

## ⚙️ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | **Yes for /stats** | — | GitHub PAT — needs `read:user`, `public_repo` |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS origins |
| `PORT` | No | `3001` | Local server port |

### Cache defaults

| Cache | TTL | Capacity |
|-------|-----|----------|
| General (REST proxy) | 14 days | 1,000 entries |
| Stats (GraphQL) | 6 hours | 200 entries |

---

## 🌐 Netlify Deployment

`netlify.toml`:
```toml
[build]
  functions = "netlify/functions"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

[[redirects]]
  from = "/health"
  to = "/.netlify/functions/api/health"
  status = 200

[build.environment]
  NODE_VERSION = "22"
```

Environment variables to set in Netlify UI:
```
GITHUB_TOKEN=ghp_...
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

> **Heads up on serverless caching:** Netlify Functions are stateless — the LRU cache resets on each cold start. For production with high traffic, consider replacing the in-memory cache with Redis (Upstash has a generous free tier). For a portfolio/low-traffic site the current setup is fine.

---

## 🐛 Troubleshooting

### `401` on `/stats`
GraphQL requires authentication. Add `GITHUB_TOKEN` to your `.env`.

### `429` on REST proxy
Rate limit hit (60/hr without token, 5000/hr with). Add `GITHUB_TOKEN`.

### `CORS error` in browser
Add your domain to `ALLOWED_ORIGINS`.

### Streak shows 0
Your token may lack `read:user` scope, or the account has no public contributions this year.

---

## 🤝 Contributing

```bash
git clone https://github.com/amitxd75/github-api-backend.git
npm install
npm run dev
```

1. Fork → feature branch → PR
2. Run `npm run build` to check types before submitting

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**⭐ Star this repo if it helped you!**

Made with ❤️ by [amitxd75](https://github.com/amitxd75)

</div>
