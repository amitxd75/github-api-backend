---

# 🚀 GitHub API Backend v2.0 - API Documentation

## 🧭 Overview

A unified API backend providing:

* Direct GitHub REST access via `?endpoint=...`
* Aggregated user stats via `/stats`
* Smart cache control
* Token-based enhanced rate limits

---

## 🌍 Base URL

```
Local:    http://localhost:3001
```

---

## 🔐 Authentication

Supports unauthenticated and `GITHUB_TOKEN`-based requests.

---

## 📡 Endpoints

### `GET /api/github/v2/?endpoint=<path>&cache=<true|false>`

Proxy any GitHub REST path.

**Params:**

* `endpoint`: e.g. `/users/amitminer`
* `cache`: optional (`true` to cache for 14 days)

**Example:**

```bash
GET /api/github/v2/?endpoint=/users/amitminer
```

---

### `GET /api/github/v2/stats?username=<username>&force=<true|false>`

Aggregated GitHub stats.

**Params:**

* `username`: GitHub handle
* `force`: optional (`true` to bypass cache)

**Example:**

```bash
GET /api/github/v2/stats?username=amitxd75&force=true
```

---

### `GET /api/github/v2/cache/status`

Returns cache summary.

### `DELETE /api/github/v2/cache`

Clears all cache.

### `DELETE /api/github/v2/cache/:endpoint`

Clears cache for a specific key.

---

## 🐍 Python Examples

### Fetch Stats

```python
import requests

def fetch_stats(username, force=False):
    res = requests.get(
        "http://localhost:3001/api/github/v2/stats",
        params={"username": username, "force": str(force).lower()}
    )
    res.raise_for_status()
    return res.json()

print(fetch_stats("amitxd75")["totalStars"])
```

### Proxy GitHub API

```python
def proxy(endpoint):
    res = requests.get(
        "http://localhost:3001/api/github/v2/",
        params={"endpoint": endpoint}
    )
    res.raise_for_status()
    return res.json()

print(proxy("/users/amitminer")["login"])
```

### View Cache

```python
res = requests.get("http://localhost:3001/api/github/v2/cache/status")
print(res.json())
```

---

## ⚙️ Caching

* `?endpoint`: 14-day cache
* `/stats`: 6-hour cache
* Use `force=true` on `/stats` to refresh

---

## 🧠 Notes

* Responses include rate limit info (when available)
* `GITHUB_TOKEN` allows 5000 req/hr
* Cache keys: GitHub path or `stats_<username>`

---
