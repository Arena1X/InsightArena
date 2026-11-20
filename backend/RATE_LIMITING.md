# Rate Limiting Documentation

This document describes the rate limiting strategy used in the InsightArena API to protect the platform from abuse and ensure fair resource distribution among users.

## Overview

The InsightArena API implements a **multi-tier rate limiting system** using the `@nestjs/throttler` package. Different endpoint categories have different limits to balance availability with protection.

## Rate Limit Tiers

The API implements four distinct rate limit tiers, each with configurable limits via environment variables:

### 1. **Default Tier**
- **Default Limit**: 100 requests
- **Time Window**: 60,000 ms (1 minute)
- **Use Case**: General-purpose endpoints
- **Config**: `RATE_LIMIT_DEFAULT_LIMIT`, `RATE_LIMIT_DEFAULT_TTL_MS`

### 2. **Auth Tier**
- **Default Limit**: 10 requests
- **Time Window**: 60,000 ms (1 minute)
- **Use Case**: Authentication endpoints (challenge, verify)
- **Config**: `RATE_LIMIT_AUTH_LIMIT`, `RATE_LIMIT_AUTH_TTL_MS`
- **Rationale**: Prevents brute-force attacks on authentication

### 3. **Read Tier**
- **Default Limit**: 200 requests
- **Time Window**: 60,000 ms (1 minute)
- **Use Case**: Read-only endpoints (GET requests)
- **Config**: `RATE_LIMIT_READ_LIMIT`, `RATE_LIMIT_READ_TTL_MS`
- **Rationale**: Read operations are cheaper; higher limit encourages data retrieval

### 4. **Write Tier**
- **Default Limit**: 30 requests
- **Time Window**: 60,000 ms (1 minute)
- **Use Case**: State-changing endpoints (POST, PATCH, DELETE)
- **Config**: `RATE_LIMIT_WRITE_LIMIT`, `RATE_LIMIT_WRITE_TTL_MS`
- **Rationale**: Write operations consume more resources; lower limit prevents abuse

## Checking Your Rate Limit Status

### API Endpoint
```
GET /api/v1/auth/rate-limit
```

**Authentication**: Required (Bearer JWT)

**Response** (200 OK):
```json
{
  "default": {
    "limit": 100,
    "remaining": 87,
    "reset_at": "2026-03-30T04:00:00.000Z"
  },
  "auth": {
    "limit": 10,
    "remaining": 9,
    "reset_at": "2026-03-30T04:00:00.000Z"
  },
  "read": {
    "limit": 200,
    "remaining": 150,
    "reset_at": "2026-03-30T04:00:00.000Z"
  },
  "write": {
    "limit": 30,
    "remaining": 28,
    "reset_at": "2026-03-30T04:00:00.000Z"
  }
}
```

### Example
```bash
curl -X GET http://localhost:3000/api/v1/auth/rate-limit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## HTTP Headers

When you approach or exceed rate limits, the API includes rate-limit information in response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | The rate limit ceiling for the current tier |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the rate limit resets |

Example Response Headers:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1711864800
```

## When You Hit the Rate Limit

If you exceed the rate limit for any tier:

- **HTTP Status**: `429 Too Many Requests`
- **Response Body**: Error message indicating rate limit exceeded
- **Retry**: Wait until `reset_at` timestamp before retrying

### Example 429 Response
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

## Best Practices

### 1. **Cache Results Locally**
- Implement client-side caching to reduce redundant API calls
- Use the `reset_at` timestamp to know when to invalidate cache

### 2. **Batch Operations**
- When possible, combine multiple operations into batch endpoints
- This reduces the total number of requests needed

### 3. **Monitor Rate Limit Status**
- Call `GET /auth/rate-limit` periodically to check current usage
- Implement backoff logic when `remaining` approaches 0

### 4. **Handle 429 Errors Gracefully**
```javascript
// Example retry logic
const makeRequest = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error.status === 429) {
      const resetAt = new Date(error.headers['X-RateLimit-Reset'] * 1000);
      const waitTime = resetAt - Date.now();
      console.log(`Rate limited. Retry after ${waitTime}ms`);
      await sleep(waitTime);
      return makeRequest(url, options); // Retry
    }
    throw error;
  }
};
```

### 5. **Prioritize Critical Operations**
- Use write-tier limits wisely for important operations
- Batch non-critical reads to stay within read-tier limits

## Configuration

Rate limits are configurable via environment variables. Set these in your `.env` file:

```env
# Default tier (general endpoints)
RATE_LIMIT_DEFAULT_LIMIT=100
RATE_LIMIT_DEFAULT_TTL_MS=60000

# Auth tier (authentication endpoints)
RATE_LIMIT_AUTH_LIMIT=10
RATE_LIMIT_AUTH_TTL_MS=60000

# Read tier (GET endpoints)
RATE_LIMIT_READ_LIMIT=200
RATE_LIMIT_READ_TTL_MS=60000

# Write tier (POST, PATCH, DELETE endpoints)
RATE_LIMIT_WRITE_LIMIT=30
RATE_LIMIT_WRITE_TTL_MS=60000
```

## Technical Implementation

Rate limiting is implemented using:
- **Library**: `@nestjs/throttler`
- **Storage**: Configurable backend (Redis recommended for distributed systems)
- **Identification**: User ID from JWT token (or IP address for unauthenticated endpoints)

### Service: `RateLimitService`

The `RateLimitService` in `src/auth/rate-limit.service.ts` provides:
- `getStatus(identifier: string)` - Get rate limit status across all tiers
- `getTierStatus(identifier: string, tier: string)` - Get status for a specific tier

## Troubleshooting

### Getting 429 errors frequently?
1. Check your rate-limit status: `GET /auth/rate-limit`
2. Identify which tier(s) are being exhausted
3. Optimize your request pattern to use fewer requests of that tier
4. Contact support if you need a higher tier limit

### Unsure about tier assignment?
- Authentication endpoints → Auth tier (lower limit)
- GET requests → Read tier (higher limit)
- POST/PATCH/DELETE → Write tier (medium limit)
- Everything else → Default tier

## Support

If you have questions about rate limiting:
- Check the [API Reference](./API_REFERENCE.md)
- Review endpoint-specific documentation
- Contact the support team

---

**Last Updated**: November 2026
**API Version**: v1
