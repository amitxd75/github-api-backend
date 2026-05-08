# 📡 GitHub API Backend - API Documentation

## 🌟 Overview

A fast, accurate GitHub API proxy and statistics aggregator featuring:

* **GraphQL Stats** - Aggregates data in a single round-trip to GitHub.
* **Accurate Streaks** - Computed from the full 365-day contribution calendar.
* **LRU Cache** - O(1) time complexity with TTL eviction and hit-rate tracking.
* **GitHub REST Proxy** - Scalable access to any GitHub endpoint with intelligent caching.
* **Retry Logic** - Integrated exponential backoff for transient network errors.
* **Production Ready** - Hardened security, CORS, monitoring, and health checks.

---

## 🌐 Base URLs

| Environment | URL |
|-------------|-----|
| **Local Development** | `http://localhost:3001` |
| **Netlify Functions** | `https://your-site.netlify.app/.netlify/functions/api` |

---

## 🔐 Authentication

| | Without Token | With Token |
|---|---|---|
| REST proxy | 60 req/hr | 5000 req/hr |
| Stats (GraphQL) | ❌ Not supported | ✅ Required |

> **Note:** The `/stats` endpoint uses GitHub's GraphQL API which requires authentication. Set `GITHUB_TOKEN` in your environment — only `read:user` and `public_repo` scopes are needed.

Get a token at [github.com/settings/tokens](https://github.com/settings/tokens).

---

## 📋 Endpoints

### 📊 **Health Check**

```http
GET /health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "3.0.0",
  "environment": "development",
  "githubToken": "configured",
  "memory": {
    "usedMB": 45,
    "totalMB": 128
  }
}
```

---

### 📖 **API Documentation**

```http
GET /api
```

Returns available endpoints, version information, and core system capabilities.

---

### 🐙 **GitHub REST Proxy**

Proxy any GitHub REST API endpoint with optional caching.

```http
GET /api/github/v2?endpoint=<github-path>&cache=<true|false>
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `endpoint` | ✅ | GitHub API path, must start with `/` |
| `cache` | ❌ | Set `true` to cache response for 14 days |

**Examples:**
```bash
# User profile
curl "http://localhost:3001/api/github/v2?endpoint=/users/octocat"

# Repos with caching
curl "http://localhost:3001/api/github/v2?endpoint=/users/octocat/repos&cache=true"

# Repository details
curl "http://localhost:3001/api/github/v2?endpoint=/repos/octocat/Hello-World"

# Repository languages
curl "http://localhost:3001/api/github/v2?endpoint=/repos/octocat/Hello-World/languages"
```

**Response (non-array):** GitHub's response is returned as-is. Cached responses include extra fields:
```json
{
  "...": "GitHub API data",
  "_cached": true,
  "_cacheAge": 3600
}
```

**Rate-limit headers** are forwarded directly to the client:
```
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1642248600
X-RateLimit-Limit: 5000
```

**Error responses:**
```json
// 400 - Missing or invalid endpoint
{ "error": "endpoint parameter required", "usage": "GET /api/github/v2?endpoint=/users/username" }

// 401 - Token invalid
{ "error": "GitHub token invalid or expired" }

// 429 - Rate limit
{ "error": "GitHub rate limit exceeded", "resetAt": "2024-01-15T11:00:00.000Z" }

// 404 - Not found
{ "error": "Resource not found", "endpoint": "/users/nonexistent" }

// 503 - Network error
{ "error": "Cannot reach GitHub API", "details": "ENOTFOUND" }
```

---

### 📈 **GitHub User Statistics**

Fetch comprehensive stats for a GitHub user. Powered by a **single GraphQL query** — no N+1 REST calls.

```http
GET /api/github/v2/stats?username=<username>&force=<true|false>
GET /api/github/v2/stats/:username?force=<true|false>
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `username` | ✅ | GitHub username (alphanumeric, `-`, `_`, max 39 chars) |
| `force` | ❌ | Set `true` to bypass cache and fetch fresh data |

**Examples:**
```bash
# Fetch stats (cached for 6 hours)
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75"

# Path param format
curl "http://localhost:3001/api/github/v2/stats/amitxd75"

# Force refresh
curl "http://localhost:3001/api/github/v2/stats/amitxd75?force=true"
```

**Response:**
```json
{
  "username": "amitxd75",
  "name": "Amit",
  "avatarUrl": "https://avatars.githubusercontent.com/u/...",
  "bio": "Building cool stuff",
  "location": "India",
  "company": null,
  "websiteUrl": "https://amitxd75.dev",
  "twitterUsername": null,

  "followers": 42,
  "following": 15,
  "publicRepos": 25,
  "publicGists": 5,
  "accountCreated": "2020-01-15T10:30:00Z",
  "lastActivity": "2024-01-15T09:45:00Z",

  "totalRepos": 25,
  "totalStars": 150,
  "totalForks": 25,
  "contributedTo": 5,

  "totalCommits": 1240,
  "totalPRs": 45,
  "totalIssues": 20,
  "currentStreak": 7,
  "longestStreak": 21,

  "topLanguages": {
    "TypeScript": 45,
    "JavaScript": 30,
    "Python": 15,
    "Go": 10
  },
  "recentRepoActivity": 3,

  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "cacheAge": 1800
}
```

> `cacheAge` is only present on cached responses (seconds since last fetch).
> `totalCommits`, `totalPRs`, `totalIssues` reflect the **current contribution year** (resets Jan 1).
> `currentStreak` and `longestStreak` are computed from the **full 365-day contribution calendar** — same data as your GitHub profile graph.

**Field reference:**

| Field | Description |
|-------|-------------|
| `username` | GitHub username |
| `name` | Display name |
| `avatarUrl` | Profile picture URL |
| `bio` | Profile bio |
| `location` | Location from profile |
| `company` | Company from profile |
| `websiteUrl` | Website/blog URL |
| `twitterUsername` | Twitter handle |
| `followers` | Follower count |
| `following` | Following count |
| `publicRepos` | Public repository count |
| `publicGists` | Public gist count |
| `accountCreated` | Account creation date |
| `lastActivity` | Most recent activity date |
| `totalRepos` | Total owned repos (excl. forks) |
| `totalStars` | Stars received across owned repos |
| `totalForks` | Forks of owned repos |
| `contributedTo` | Number of forked repos |
| `totalCommits` | Commits this year (GraphQL) |
| `totalPRs` | Pull requests this year |
| `totalIssues` | Issues this year |
| `currentStreak` | Current contribution streak (days) |
| `longestStreak` | Longest contribution streak (days) |
| `topLanguages` | Top 8 languages by % of code |
| `recentRepoActivity` | Repos with pushes in last 30 days |
| `lastUpdated` | When these stats were computed |
| `cacheAge` | Seconds since last fetch (cached only) |

---

### 🗂️ **Cache Management**

#### **View Cache Status**

```http
GET /api/github/v2/cache/status
```

**Response:**
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

#### **Clear All Cache**

```http
DELETE /api/github/v2/cache
```

**Response:**
```json
{
  "message": "Cache cleared",
  "general": 12,
  "stats": 3,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### **Clear Specific Cache Entry**

```http
DELETE /api/github/v2/cache/<key>
```

**Examples:**
```bash
# Clear a stats entry
curl -X DELETE "http://localhost:3001/api/github/v2/cache/stats_amitxd75"

# Clear a REST proxy entry
curl -X DELETE "http://localhost:3001/api/github/v2/cache/users/octocat"
```

**Response:**
```json
{
  "message": "Cache cleared for: stats_amitxd75",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🔄 Caching Strategy

| Cache | TTL | Capacity | Implementation |
|-------|-----|----------|----------------|
| REST proxy responses | 14 days | 1,000 entries | LRU |
| User stats | 6 hours | 200 entries | LRU |

- **Eviction policy**: LRU (least recently used) — hot entries stay, cold entries go
- **TTL**: Per-entry expiry checked on access and via hourly background sweep
- **Hit rate**: Tracked per cache, visible at `/cache/status`
- **Cache keys**: endpoint path for REST (e.g. `/users/octocat`), `stats_<username>` for stats

---

## 🚨 Error Handling

All errors follow this shape:

```json
{
  "error": "Short description",
  "details": "More context (dev only for 500s)",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

| Code | Meaning | Fix |
|------|---------|-----|
| `400` | Invalid parameters | Check endpoint format / username |
| `401` | Auth failed | Check `GITHUB_TOKEN` |
| `404` | Resource not found | Verify username/repo is public |
| `429` | Rate limit exceeded | Add token or wait for reset |
| `500` | Internal error | Check server logs |
| `503` | Can't reach GitHub | Check network / GitHub status |

---

## ⚙️ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | **Yes for /stats** | — | GitHub PAT (`read:user`, `public_repo`) |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS origins |
| `PORT` | No | `3001` | Local server port |

---

## 📝 Usage Examples

### JavaScript
```javascript
const api = {
  async getStats(username, force = false) {
    const res = await fetch(`/api/github/v2/stats?username=${username}&force=${force}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async proxy(endpoint, cache = false) {
    const res = await fetch(`/api/github/v2?endpoint=${encodeURIComponent(endpoint)}&cache=${cache}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};

const stats = await api.getStats('amitxd75');
console.log(stats.totalStars, stats.currentStreak);
```

### React Hook
```jsx
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

// In component:
const { stats } = useGitHubStats('amitxd75');
// stats.avatarUrl, stats.name, stats.totalCommits, etc.
```

### Python
```python
import requests

def get_stats(username, base="http://localhost:3001"):
    r = requests.get(f"{base}/api/github/v2/stats", params={"username": username})
    r.raise_for_status()
    return r.json()

stats = get_stats("amitxd75")
print(f"{stats['totalCommits']} commits · {stats['currentStreak']} day streak")
```

### cURL
```bash
# Stats
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75"

# Force refresh
curl "http://localhost:3001/api/github/v2/stats/amitxd75?force=true"

# REST proxy with cache
curl "http://localhost:3001/api/github/v2?endpoint=/users/amitxd75/repos&cache=true"

# Cache status
curl "http://localhost:3001/api/github/v2/cache/status"

# Clear stats cache
curl -X DELETE "http://localhost:3001/api/github/v2/cache/stats_amitxd75"

# Health
curl "http://localhost:3001/health"
```

---

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/amitxd75/github-api-backend/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/amitxd75/github-api-backend/discussions)

---

<div align="center">

**Made with ❤️ by [amitxd75](https://github.com/amitxd75)**

</div>
om/amitxd75)**

</div>
