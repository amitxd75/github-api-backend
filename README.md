# GitHub API Backend

A standalone TypeScript/Express.js backend that provides a proxy for the GitHub API with caching capabilities.

## Features

- **GitHub API Proxy**: Securely proxy requests to GitHub API
- **Built-in Caching**: 14-day cache for improved performance
- **Rate Limit Handling**: Proper handling of GitHub API rate limits
- **CORS Support**: Configurable cross-origin resource sharing
- **Security**: Helmet.js for security headers
- **Error Handling**: Comprehensive error handling and logging
- **Health Checks**: Built-in health check endpoint
- **TypeScript**: Full TypeScript support with type safety

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Development
```bash
npm run dev
```

### 4. Production Build
```bash
npm run build
npm start
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | `3001` |
| `NODE_ENV` | Environment mode | No | `development` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Recommended | - |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | No | `http://localhost:3000` |

## API Endpoints

### GitHub API Proxy
```
GET /api/github?endpoint=<github-endpoint>&cache=<true|skills>
```

**Examples:**
- Get user repos: `/api/github?endpoint=/users/username/repos`
- Get specific repo: `/api/github?endpoint=/repos/username/repo-name`
- With caching: `/api/github?endpoint=/users/username/repos&cache=true`

### Cache Management
- `GET /api/github/cache/status` - View cache status
- `DELETE /api/github/cache` - Clear all cache
- `DELETE /api/github/cache/*` - Clear specific endpoint cache

### Health Check
```
GET /health
```

## Usage Examples

### Basic Repository Fetch
```javascript
const response = await fetch('http://localhost:3001/api/github?endpoint=/users/octocat/repos');
const repos = await response.json();
```

### With Caching Enabled
```javascript
const response = await fetch('http://localhost:3001/api/github?endpoint=/users/octocat/repos&cache=true');
const repos = await response.json();
```

### Error Handling
```javascript
try {
  const response = await fetch('http://localhost:3001/api/github?endpoint=/users/nonexistent/repos');
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error);
    return;
  }
  
  const data = await response.json();
  console.log('Success:', data);
} catch (error) {
  console.error('Network Error:', error);
}
```

## Deployment

### Using PM2
```bash
npm install -g pm2
npm run build
pm2 start dist/server.js --name "github-api-backend"
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

### Environment-specific Deployment

**Development:**
```bash
NODE_ENV=development npm run dev
```

**Production:**
```bash
NODE_ENV=production npm run build && npm start
```

## Security Considerations

1. **GitHub Token**: Use a GitHub Personal Access Token for higher rate limits
2. **CORS**: Configure `ALLOWED_ORIGINS` for your frontend domains
3. **Environment**: Never commit `.env` files
4. **Rate Limiting**: Consider adding rate limiting for public deployments

## Monitoring

The backend includes comprehensive logging:
- Request/response logging
- Error tracking
- Cache hit/miss logging
- Rate limit monitoring

## Troubleshooting

### Common Issues

**Rate Limit Exceeded:**
- Add `GITHUB_TOKEN` to your `.env` file
- Check rate limit status in API responses

**CORS Errors:**
- Add your frontend domain to `ALLOWED_ORIGINS`
- Ensure origins include protocol (http/https)

**Network Issues:**
- Check internet connectivity
- Verify GitHub API status

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and stack traces.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details