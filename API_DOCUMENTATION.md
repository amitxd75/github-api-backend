# 📡 GitHub API Backend v2.0 - API Documentation

## 🌟 Overview

A comprehensive GitHub API proxy and statistics aggregator featuring:

* **Smart Caching** - Configurable TTL with automatic cleanup and size management
* **Robust Error Handling** - Retry logic with exponential backoff for network failures
* **GitHub API Proxy** - Access any GitHub endpoint with intelligent caching
* **Comprehensive Stats** - Detailed user analytics and contribution insights
* **Rate Limit Aware** - Intelligent handling of GitHub's API limits with token support
* **Production Ready** - Security headers, CORS, monitoring, and health checks

---

## 🌐 Base URLs

| Environment | URL |
|-------------|-----|
| **Local Development** | `http://localhost:3001` |
| **Netlify Functions** | `https://your-site.netlify.app/.netlify/functions/api` |

---

## 🔐 Authentication

The API supports both unauthenticated and authenticated requests:

- **Without GitHub Token**: 60 requests per hour
- **With GitHub Token**: 5000 requests per hour

To use a GitHub token, set the `GITHUB_TOKEN` environment variable with a [Personal Access Token](https://github.com/settings/tokens).

---

## 📋 Endpoints

### 📊 **Health Check**

Monitor server status and performance metrics.

```http
GET /health
```

**Response Example:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "environment": "development",
  "memory": {
    "used": 45,
    "total": 128
  }
}
```

---

### 📖 **API Documentation**

Get interactive API documentation with examples.

```http
GET /api
```

**Response Example:**
```json
{
  "name": "GitHub API Backend",
  "version": "2.0.0",
  "description": "Enhanced GitHub API proxy with comprehensive stats endpoint, intelligent caching, and robust error handling",
  "author": "amitxd75",
  "endpoints": {
    "health": {
      "path": "GET /health",
      "description": "Server health check and status information"
    },
    "github": {
      "proxy": {
        "path": "GET /api/github/v2/?endpoint=<github-path>&cache=<true|false>",
        "description": "Proxy any GitHub API endpoint with optional caching",
        "examples": [
          "/api/github/v2/?endpoint=/users/octocat",
          "/api/github/v2/?endpoint=/users/octocat/repos&cache=true"
        ]
      }
    }
  }
}
```

---

### 🐙 **GitHub API Proxy**

Proxy any GitHub REST API endpoint with optional caching.

```http
GET /api/github/v2/?endpoint=<github-path>&cache=<true|false>
```

**Parameters:**
- `endpoint` (required): GitHub API path starting with `/`
- `cache` (optional): Enable 14-day caching (`true`/`false`)

**Examples:**

```bash
# Get user profile
curl "http://localhost:3001/api/github/v2/?endpoint=/users/octocat"

# Get user repositories with caching enabled
curl "http://localhost:3001/api/github/v2/?endpoint=/users/octocat/repos&cache=true"

# Get repository details
curl "http://localhost:3001/api/github/v2/?endpoint=/repos/octocat/Hello-World"

# Get repository languages
curl "http://localhost:3001/api/github/v2/?endpoint=/repos/octocat/Hello-World/languages"

# Get user events
curl "http://localhost:3001/api/github/v2/?endpoint=/users/octocat/events"
```

**Response Format:**
```json
{
  "...": "GitHub API response data",
  "_metadata": {
    "cached": false,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "endpoint": "/users/octocat",
    "rateLimit": {
      "remaining": "4999",
      "reset": "1642248600"
    }
  }
}
```

**Error Responses:**
```json
// 400 - Bad Request
{
  "error": "Endpoint parameter required",
  "usage": "GET /api/github/v2?endpoint=/users/username/repos"
}

// 401 - Authentication Failed
{
  "error": "GitHub API authentication failed",
  "details": "Invalid or expired GitHub token. Please check your GITHUB_TOKEN environment variable.",
  "suggestion": "Create a new GitHub Personal Access Token at https://github.com/settings/tokens"
}

// 429 - Rate Limit Exceeded
{
  "error": "GitHub API rate limit exceeded",
  "resetTime": "2024-01-15T11:00:00.000Z",
  "suggestion": "Add GITHUB_TOKEN to your environment variables for higher rate limits"
}

// 404 - Not Found
{
  "error": "Repository or resource not found",
  "endpoint": "/users/nonexistent",
  "suggestion": "Check if the username/repository exists and is public"
}
```

---

### 📈 **GitHub User Statistics**

Get comprehensive GitHub user statistics with intelligent caching.

```http
GET /api/github/v2/stats?username=<username>&force=<true|false>
GET /api/github/v2/stats/<username>?force=<true|false>
```

**Parameters:**
- `username` (required): GitHub username
- `force` (optional): Bypass cache and fetch fresh data (`true`/`false`)

**Examples:**

```bash
# Get user stats (cached for 6 hours)
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75"

# Force refresh stats
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75&force=true"

# Alternative URL format
curl "http://localhost:3001/api/github/v2/stats/amitxd75"
```

**Response Example:**
```json
{
  "username": "amitxd75",
  "followers": 42,
  "following": 15,
  "publicRepos": 25,
  "publicGists": 5,
  "accountCreated": "2020-01-15T10:30:00Z",
  "lastActivity": "2024-01-15T09:45:00Z",
  
  "totalRepos": 30,
  "totalStars": 150,
  "totalForks": 25,
  "contributedTo": 5,
  
  "totalCommits": 500,
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

**Field Descriptions:**

| Field | Description |
|-------|-------------|
| `username` | GitHub username |
| `followers` | Number of followers |
| `following` | Number of users being followed |
| `publicRepos` | Number of public repositories |
| `publicGists` | Number of public gists |
| `accountCreated` | Account creation date |
| `lastActivity` | Most recent activity date |
| `totalRepos` | Total repositories (including forks) |
| `totalStars` | Total stars received across original repositories |
| `totalForks` | Total forks of user's repositories |
| `contributedTo` | Number of repositories that are forks |
| `totalCommits` | Recent commits (from events API) |
| `totalPRs` | Recent pull requests |
| `totalIssues` | Recent issues |
| `currentStreak` | Current contribution streak in days |
| `longestStreak` | Longest contribution streak in days |
| `topLanguages` | Top 5 programming languages by percentage |
| `recentRepoActivity` | Repositories with activity in last 30 days |
| `lastUpdated` | When stats were calculated |
| `cacheAge` | Age of cached data in seconds (if cached) |

---

### 🗂️ **Cache Management**

Monitor and manage the intelligent caching system.

#### **View Cache Status**

```http
GET /api/github/v2/cache/status
```

**Response Example:**
```json
{
  "summary": {
    "totalEntries": 45,
    "totalSize": "2.34 KB",
    "sizePercentage": "0.1%",
    "entriesPercentage": "4.5%"
  },
  "breakdown": {
    "statsEntries": 12,
    "endpointEntries": 33
  },
  "performance": {
    "averageAge": "45 minutes",
    "oldestEntry": "120 minutes",
    "hitRateEstimate": "Not tracked"
  },
  "configuration": {
    "maxEntries": 1000,
    "maxSize": "50MB",
    "generalCacheDuration": "14 days",
    "statsCacheDuration": "6 hours"
  },
  "endpoints": [
    "/users/octocat",
    "/users/amitxd75/repos",
    "stats_amitxd75"
  ]
}
```

#### **Clear All Cache**

```http
DELETE /api/github/v2/cache
```

**Response Example:**
```json
{
  "message": "Cache cleared successfully",
  "entriesCleared": 45,
  "sizeFreed": "2.34 KB",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### **Clear Specific Cache Entry**

```http
DELETE /api/github/v2/cache/<endpoint-or-key>
```

**Examples:**
```bash
# Clear endpoint cache
curl -X DELETE "http://localhost:3001/api/github/v2/cache/users/octocat"

# Clear stats cache
curl -X DELETE "http://localhost:3001/api/github/v2/cache/stats_amitxd75"
```

**Response Example:**
```json
{
  "message": "Cache cleared for endpoint: /users/octocat",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🔄 Caching Strategy

### **Cache Durations**
- **General API endpoints**: 14 days TTL
- **User statistics**: 6 hours TTL
- **Maximum entries**: 1000 cached items
- **Maximum size**: 50MB total cache size

### **Cache Cleanup**
- **Strategy**: LRU (Least Recently Used)
- **Trigger**: Automatic when limits exceeded
- **Buffer**: Removes 20% extra entries for efficiency

### **Cache Keys**
- **Endpoints**: GitHub API path (e.g., `/users/octocat`)
- **Stats**: `stats_<username>` (e.g., `stats_amitxd75`)

### **Force Refresh**
Use `force=true` parameter to bypass cache:
```bash
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75&force=true"
```

---

## 🚨 Error Handling

### **Error Response Format**
```json
{
  "error": "Error description",
  "details": "Additional error details",
  "suggestion": "Helpful suggestion for resolution",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### **Common Error Codes**

| Code | Description | Solution |
|------|-------------|----------|
| `400` | Bad Request - Invalid parameters | Check endpoint format and parameters |
| `401` | Authentication Failed | Verify GitHub token |
| `404` | Resource Not Found | Check username/repository exists |
| `429` | Rate Limit Exceeded | Add GitHub token or wait for reset |
| `500` | Internal Server Error | Check server logs |
| `503` | Service Unavailable | Check network connectivity |

---

## 📊 Rate Limiting

### **GitHub API Limits**
- **Without token**: 60 requests per hour
- **With token**: 5000 requests per hour

### **Rate Limit Headers**
Responses include rate limit information when available:
```json
{
  "_metadata": {
    "rateLimit": {
      "remaining": "4999",
      "reset": "1642248600"
    }
  }
}
```

### **Best Practices**
1. **Use GitHub tokens** for higher limits
2. **Enable caching** for frequently accessed data
3. **Monitor rate limits** via response headers
4. **Use stats endpoint** instead of multiple API calls

---

## 🔧 Configuration

### **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No | - | GitHub Personal Access Token |
| `NODE_ENV` | No | `development` | Environment mode |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | CORS origins |
| `PORT` | No | `3001` | Server port (local only) |

### **GitHub Token Setup**
1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Generate new token with `public_repo` scope
3. Add to environment: `GITHUB_TOKEN=your_token_here`

---

## 🌐 CORS Configuration

The API supports cross-origin requests from configured domains:

```javascript
// Default allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://yourdomain.com'
];
```

Configure via `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://yourdomain.com,https://app.netlify.app
```

---

## 📝 Usage Examples

### **JavaScript/Node.js**
```javascript
class GitHubAPI {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getUserStats(username, force = false) {
    const response = await fetch(
      `${this.baseUrl}/api/github/v2/stats?username=${username}&force=${force}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async proxyGitHubAPI(endpoint, cache = false) {
    const response = await fetch(
      `${this.baseUrl}/api/github/v2/?endpoint=${encodeURIComponent(endpoint)}&cache=${cache}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

// Usage
const api = new GitHubAPI();
const stats = await api.getUserStats('amitxd75');
console.log(`Total stars: ${stats.totalStars}`);
```

### **Python**
```python
import requests

class GitHubAPI:
    def __init__(self, base_url="http://localhost:3001"):
        self.base_url = base_url
    
    def get_user_stats(self, username, force=False):
        """Get comprehensive GitHub user statistics."""
        response = requests.get(
            f"{self.base_url}/api/github/v2/stats",
            params={"username": username, "force": str(force).lower()}
        )
        response.raise_for_status()
        return response.json()
    
    def proxy_github_api(self, endpoint, cache=False):
        """Proxy any GitHub API endpoint."""
        response = requests.get(
            f"{self.base_url}/api/github/v2/",
            params={"endpoint": endpoint, "cache": str(cache).lower()}
        )
        response.raise_for_status()
        return response.json()

# Usage
api = GitHubAPI()
stats = api.get_user_stats("amitxd75")
print(f"Total stars: {stats['totalStars']}")
```

### **cURL**
```bash
# Get user stats
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75"

# Proxy GitHub API with caching
curl "http://localhost:3001/api/github/v2/?endpoint=/users/amitxd75/repos&cache=true"

# Force refresh stats
curl "http://localhost:3001/api/github/v2/stats?username=amitxd75&force=true"

# Check cache status
curl "http://localhost:3001/api/github/v2/cache/status"

# Clear specific cache
curl -X DELETE "http://localhost:3001/api/github/v2/cache/stats_amitxd75"
```

---

## 🚀 Performance Tips

1. **Use caching** for frequently accessed data
2. **Batch requests** when possible
3. **Monitor cache status** to optimize usage
4. **Use GitHub tokens** for higher rate limits
5. **Prefer stats endpoint** over multiple API calls
6. **Avoid force refresh** unless necessary

---

## 🔍 Monitoring

### **Health Checks**
```bash
curl http://localhost:3001/health
```

### **Cache Monitoring**
```bash
curl http://localhost:3001/api/github/v2/cache/status
```

### **Logs**
- Request/response logging with timing
- Error logging with context
- Cache operations logging
- Rate limit monitoring

---

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/amitxd75/github-api-backend/issues)
- 📖 **Documentation**: [GitHub Repository](https://github.com/amitxd75/github-api-backend)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/amitxd75/github-api-backend/discussions)

---

<div align="center">

**Made with ❤️ by [amitxd75](https://github.com/amitxd75)**

</div>