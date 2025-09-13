# 🚀 GitHub API Backend v2.0

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-lightgrey.svg)](https://expressjs.com/)

> **A powerful, intelligent GitHub API proxy and statistics aggregator with smart caching, robust error handling, and comprehensive user analytics.**

Perfect for portfolio websites, GitHub dashboards, and applications that need reliable GitHub data with enhanced performance and detailed user insights.

---

## ✨ Features

### 🎯 **Core Functionality**
- **GitHub API Proxy** - Access any GitHub endpoint with intelligent caching
- **Comprehensive Stats** - Detailed user analytics and contribution insights
- **Smart Caching** - Configurable TTL with automatic cleanup and size management
- **Retry Logic** - Robust error handling with exponential backoff
- **Rate Limit Aware** - Intelligent handling of GitHub's API limits

### 🛡️ **Security & Performance**
- **Security Headers** - Helmet.js integration for production security
- **CORS Configuration** - Flexible cross-origin resource sharing
- **Request Logging** - Detailed monitoring and debugging capabilities
- **Error Handling** - Comprehensive error responses with helpful suggestions
- **Memory Management** - Automatic cache cleanup to prevent memory leaks

### 🚀 **Deployment Ready**
- **Dual Deployment** - Works locally and on Netlify Functions
- **Environment Aware** - Different configurations for dev/production
- **Health Checks** - Built-in monitoring endpoints
- **Graceful Shutdown** - Proper cleanup on termination signals

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │───▶│  GitHub API      │───▶│   GitHub API    │
│  (Portfolio)    │    │    Backend       │    │   (github.com)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  Smart Cache │
                       │   (In-Memory) │
                       └──────────────┘
```

### 🔧 **Tech Stack**
- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Security**: Helmet.js, CORS
- **Deployment**: Netlify Functions + Local Server
- **Caching**: In-memory with TTL and size limits

---

## 🚀 Quick Start

### 📋 Prerequisites
- Node.js 18 or higher
- npm or yarn
- GitHub Personal Access Token (optional, for higher rate limits)

### 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/amitxd75/github-api-backend.git
cd github-api-backend

# Install dependencies
npm install

# Create environment file (optional)
cp .env.example .env
# Edit .env with your GitHub token and allowed origins
```

### 🔑 Environment Configuration

Create a `.env` file in the root directory:

```env
# GitHub Personal Access Token (optional but recommended)
# Get one at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here

# Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Environment
NODE_ENV=development
```

### 🏃‍♂️ Running Locally

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start

# Clean build artifacts
npm run clean
```

The server will start on `http://localhost:3001`

---

## 📡 API Documentation

### 🌐 Base URLs
- **Local**: `http://localhost:3001`
- **Netlify**: `https://your-site.netlify.app/.netlify/functions/api`

### 🔗 Endpoints

#### 📊 **Health Check**
```http
GET /health
```
Returns server status, uptime, and memory usage.

#### 📖 **API Documentation**
```http
GET /api
```
Interactive API documentation with examples.

#### 🐙 **GitHub API Proxy**
```http
GET /api/github/v2/?endpoint=<github-path>&cache=<true|false>
```

**Parameters:**
- `endpoint` (required): GitHub API path (e.g., `/users/octocat`)
- `cache` (optional): Enable 14-day caching (`true`/`false`)

**Examples:**
```bash
# Get user profile
curl "http://localhost:3001/api/github/v2/?endpoint=/users/octocat"

# Get user repositories with caching
curl "http://localhost:3001/api/github/v2/?endpoint=/users/octocat/repos&cache=true"

# Get repository details
curl "http://localhost:3001/api/github/v2/?endpoint=/repos/octocat/Hello-World"
```

#### 📈 **GitHub User Statistics**
```http
GET /api/github/v2/stats?username=<username>&force=<true|false>
GET /api/github/v2/stats/<username>?force=<true|false>
```

**Parameters:**
- `username` (required): GitHub username
- `force` (optional): Bypass cache and fetch fresh data

**Response Example:**
```json
{
  "username": "amitxd75",
  "followers": 42,
  "following": 15,
  "publicRepos": 25,
  "totalStars": 150,
  "totalForks": 30,
  "totalCommits": 500,
  "currentStreak": 5,
  "longestStreak": 15,
  "topLanguages": {
    "TypeScript": 45,
    "JavaScript": 30,
    "Python": 15,
    "Go": 10
  },
  "recentRepoActivity": 3,
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

#### 🗂️ **Cache Management**

**View Cache Status:**
```http
GET /api/github/v2/cache/status
```

**Clear All Cache:**
```http
DELETE /api/github/v2/cache
```

**Clear Specific Cache Entry:**
```http
DELETE /api/github/v2/cache/<endpoint-or-key>
```

---

## 🌐 Netlify Deployment

### 📝 **Step 1: Prepare for Deployment**

Ensure your `netlify.toml` is configured:

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
  NODE_VERSION = "18"

[[headers]]
  for = "/.netlify/functions/api/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, POST, PUT, DELETE, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type, Authorization"
```

### 🚀 **Step 2: Deploy to Netlify**

#### **Option A: Netlify UI**
1. Connect your GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `public` (or leave empty)
4. Add environment variables:
   ```
   GITHUB_TOKEN=your_token_here
   NODE_ENV=production
   ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
   ```

#### **Option B: Netlify CLI**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login and initialize
netlify login
netlify init

# Set environment variables
netlify env:set GITHUB_TOKEN your_token_here
netlify env:set NODE_ENV production
netlify env:set ALLOWED_ORIGINS "https://yourdomain.com"

# Deploy
netlify deploy --prod
```

### 🔗 **Step 3: Test Your Deployment**

```bash
# Health check
curl https://your-site.netlify.app/.netlify/functions/api/health

# API documentation
curl https://your-site.netlify.app/.netlify/functions/api/api

# GitHub stats
curl "https://your-site.netlify.app/.netlify/functions/api/api/github/v2/stats?username=amitxd75"
```

---

## 💻 Usage Examples

### 🐍 **Python**
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

repos = api.proxy_github_api("/users/amitxd75/repos", cache=True)
print(f"Repository count: {len(repos)}")
```

### 🟨 **JavaScript/Node.js**
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

### ⚛️ **React Hook**
```jsx
import { useState, useEffect } from 'react';

function useGitHubStats(username) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `http://localhost:3001/api/github/v2/stats?username=${username}`
        );
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [username]);

  return { stats, loading, error };
}

// Usage in component
function GitHubProfile({ username }) {
  const { stats, loading, error } = useGitHubStats(username);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!stats) return null;

  return (
    <div>
      <h2>{stats.username}</h2>
      <p>⭐ {stats.totalStars} stars</p>
      <p>🔥 {stats.currentStreak} day streak</p>
    </div>
  );
}
```

---

## ⚙️ Configuration

### 🔧 **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No | - | GitHub Personal Access Token for higher rate limits (5000 vs 60 req/hr) |
| `NODE_ENV` | No | `development` | Environment mode (`development` or `production`) |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `PORT` | No | `3001` | Port for local server (ignored in Netlify) |

### 📊 **Cache Configuration**

The caching system is automatically configured with sensible defaults:

- **General API endpoints**: 14 days TTL
- **User statistics**: 6 hours TTL
- **Maximum entries**: 1000 cached items
- **Maximum size**: 50MB total cache size
- **Cleanup strategy**: LRU (Least Recently Used)

### 🔄 **Rate Limiting**

- **Without token**: 60 requests per hour
- **With GitHub token**: 5000 requests per hour
- **Automatic retry**: Exponential backoff for failed requests
- **Rate limit headers**: Included in responses when available

---

## 🐛 Troubleshooting

### ❌ **Common Issues**

#### **"GitHub API rate limit exceeded"**
```bash
# Solution: Add a GitHub token to your environment
export GITHUB_TOKEN=your_token_here
# Or add it to your .env file
```

#### **"CORS error in browser"**
```bash
# Solution: Add your domain to ALLOWED_ORIGINS
export ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

#### **"Network connectivity issue"**
- Check your internet connection
- Verify GitHub API is accessible: `curl https://api.github.com/users/octocat`
- Check if you're behind a corporate firewall

#### **"User not found"**
- Verify the username exists on GitHub
- Check if the user's profile is public
- Ensure correct spelling of the username

### 📊 **Monitoring**

#### **Check Server Health**
```bash
curl http://localhost:3001/health
```

#### **Monitor Cache Usage**
```bash
curl http://localhost:3001/api/github/v2/cache/status
```

#### **View Logs**
```bash
# Local development
npm run dev

# Production (check your deployment platform's logs)
netlify logs
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### 🔧 **Development Setup**
```bash
# Fork and clone the repository
git clone https://github.com/yourusername/github-api-backend.git
cd github-api-backend

# Install dependencies
npm install

# Start development server
npm run dev

# Run type checking
npm run build

# Run linting
npm run lint
npm run lint:fix
```

### 📝 **Contribution Guidelines**
1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### 🐛 **Reporting Issues**
- Use the [GitHub Issues](https://github.com/amitxd75/github-api-backend/issues) page
- Include detailed reproduction steps
- Provide environment information (Node.js version, OS, etc.)
- Include relevant error messages and logs

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **GitHub API** - For providing comprehensive developer data
- **Express.js** - For the robust web framework
- **Netlify** - For excellent serverless function hosting
- **TypeScript** - For type safety and developer experience

---

## 📞 Support

- 📧 **Email**: [your-email@example.com](mailto:your-email@example.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/amitxd75/github-api-backend/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/amitxd75/github-api-backend/discussions)

---

<div align="center">

**⭐ Star this repository if it helped you!**

Made with ❤️ by [amitxd75](https://github.com/amitxd75)

</div>