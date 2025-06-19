---

```markdown
# GitHub API Backend

An intelligent GitHub proxy and stats aggregator with smart caching, error handling, and optional Netlify deployment.

---

## Netlify Deployment Guide

This guide will help you deploy the GitHub API Backend to Netlify Functions.

### Prerequisites

- Netlify account
- GitHub repository
- GitHub token (optional, for higher rate limits)

### Step 1: Prepare Repository

Ensure your project structure includes:

```

├── netlify/
│   └── functions/
│       └── api.ts
├── src/
│   ├── routes/
│   │   └── github.ts
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   └── requestLogger.ts
|   |__ types.ts
│   └── server.ts
├── package.json
├── tsconfig.json
└── netlify.toml (optional)

````

Create `netlify.toml` (optional):

```toml
[build]
  functions = "netlify/functions"
  publish = "public"

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

[[redirects]]
  from = "/"
  to = "/.netlify/functions/api/api"
  status = 200

[build.environment]
  NODE_VERSION = "18"
````

### Step 2: Deploy to Netlify

#### Option A: Netlify UI

1. Connect GitHub repo
2. Configure build:

   * Build command: `npm run build`
   * Publish dir: `public` or leave empty
   * Functions dir: `netlify/functions`
3. Add env vars:

   ```
   GITHUB_TOKEN=
   NODE_ENV=production
   ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
   ```
4. Deploy

#### Option B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
netlify env:set GITHUB_TOKEN your_token
netlify env:set NODE_ENV production
netlify env:set ALLOWED_ORIGINS "https://yourdomain.com,http://localhost:3000"
```

---

## API Documentation (v2)

### Base URLs

```
Local:    http://localhost:3001
Netlify:  https://your-site.netlify.app/.netlify/functions/api
```

### Endpoints

#### `GET /api/github/v2/?endpoint=<path>&cache=<true|false>`

Proxy GitHub REST API.

Example:

```
/api/github/v2/?endpoint=/users/amitminer
```

#### `GET /api/github/v2/stats?username=<username>&force=<true|false>`

Aggregated GitHub stats with caching.

Example:

```
/api/github/v2/stats?username=amitxd75
```

#### `GET /api/github/v2/cache/status`

View current cache stats.

#### `DELETE /api/github/v2/cache`

Clear all cache entries.

#### `DELETE /api/github/v2/cache/:endpoint`

Clear specific cached endpoint (e.g., `stats_amitxd75` or `/users/octocat`).

---

### Python Usage

```python
import requests

# Fetch GitHub stats
def fetch_stats(username, force=False):
  res = requests.get(
    "https://your-site.netlify.app/.netlify/functions/api/api/github/v2/stats",
    params={"username": username, "force": str(force).lower()}
  )
  res.raise_for_status()
  return res.json()

# Proxy GitHub endpoint 
def proxy(endpoint):
  res = requests.get(
    "https://your-site.netlify.app/.netlify/functions/api/api/github/v2/",
    params={"endpoint": endpoint}
  )
  res.raise_for_status()
  return res.json()
```

For more API usage examples and detailed documentation, please refer to [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)


---

### Caching

* `?endpoint` requests: 14 days
* `/stats`: 6 hours
* Use `force=true` to bypass

---

## Environment Variables

| Name              | Required | Description                           |
| ----------------- | -------- | ------------------------------------- |
| `GITHUB_TOKEN`    | Optional | Enables higher GitHub API rate limit  |
| `NODE_ENV`        | No       | Set to `production` or `development`  |
| `ALLOWED_ORIGINS` | No       | CORS policy origins (comma-separated) |

---

## Debug & Monitoring

* Enable debug: `netlify env:set NODE_ENV development`
* View logs: Netlify dashboard → Functions → Logs
* Monitor usage: Build logs, analytics, error handling

---

## Performance Tips

* Avoid repeated `force=true` unless needed
* Use GitHub tokens in production
* Keep bundle size minimal via esbuild
* Use pre-aggregated stats over raw proxy calls when possible

---

## Deployment URLs (Examples)

* Health Check: `https://your-site.netlify.app/.netlify/functions/api/health`
* API Docs: `https://your-site.netlify.app/.netlify/functions/api/api`
* GitHub Stats: `https://your-site.netlify.app/.netlify/functions/api/api/github/v2/stats?username=username`
* Proxy GitHub: `https://your-site.netlify.app/.netlify/functions/api/api/github/v2/?endpoint=/users/username`

```
