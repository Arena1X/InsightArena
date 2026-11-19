# Idempotency in InsightArena API

This document describes the idempotency features available in the InsightArena API to ensure safe request retries and prevent duplicate operations.

## Overview

Idempotency ensures that making the same request multiple times produces the same result as making it once. This is critical for distributed systems where network failures, timeouts, or client retries might cause the same request to be processed multiple times.

InsightArena provides an **optional idempotency** system via the `Idempotency-Key` header. Clients can opt-in by providing this header on POST/PATCH/DELETE requests. Without the header, requests are processed normally with standard semantics.

## Quick Start

To make a request idempotent, include the `Idempotency-Key` header with a valid UUID:

```bash
curl -X POST https://api.insightarena.com/api/v1/predictions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "market_id": "market-123",
    "outcome": "yes",
    "amount": 100
  }'
```

## How It Works

### First Request (No Prior Key)

When you send a request with a new `Idempotency-Key`:

1. The server validates the key format (must be a valid UUID)
2. The key is registered in the idempotency store (scoped to your user account)
3. Your request is processed normally
4. The response and status code are cached
5. You receive the response with status `201 Created` (or `200 OK` for updates)

### Replay Request (Same Key, Same Body)

If you retry the same request with the same key and same request body:

1. The key is found in the idempotency store
2. The original response is retrieved from cache
3. The cached response is returned with `Idempotency-Replayed: true` header
4. No duplicate operation is performed

Example response:

```json
{
  "id": "prediction-1",
  "market_id": "market-123",
  "outcome": "yes",
  "amount": 100,
  "created_at": "2026-11-19T12:00:00Z"
}
```

With header: `Idempotency-Replayed: true`

### Conflict (Same Key, Different Body)

If you attempt to use the same key with a different request body:

1. The server detects the mismatch
2. Returns `422 Unprocessable Entity`
3. Rejects the request to prevent confusion
4. Suggests using a new `Idempotency-Key`

Example error:

```json
{
  "statusCode": 422,
  "message": "Idempotency-Key was already used with a different request body",
  "error": "Unprocessable Entity"
}
```

## Key Requirements

The `Idempotency-Key` header must satisfy:

- **Format**: Valid UUID v4 (RFC 4122)
- **Case**: Case-insensitive (uppercase and lowercase accepted)
- **Format Examples**:
  - ✅ `550e8400-e29b-41d4-a716-446655440000`
  - ✅ `550E8400-E29B-41D4-A716-446655440000`
  - ❌ `550e8400e29b41d4a716446655440000` (no hyphens)
  - ❌ `not-a-uuid-here`
  - ❌ `550e8400-e29b-11d4-a716-446655440000` (version 1, not 4)

### UUID Validation

Your client library should generate UUIDs according to RFC 4122 version 4 (random). Most languages have built-in support:

**JavaScript/Node.js**:
```javascript
import { v4 as uuidv4 } from 'uuid';
const idempotencyKey = uuidv4();
```

**Python**:
```python
import uuid
idempotency_key = str(uuid.uuid4())
```

**Go**:
```go
import "github.com/google/uuid"
idempotencyKey := uuid.New().String()
```

**Java**:
```java
import java.util.UUID;
String idempotencyKey = UUID.randomUUID().toString();
```

## Key Scope and Reuse

Idempotency keys are **scoped per user account**:

- Two different users can use the same UUID independently
- The server tracks keys by `(user_id, idempotency_key)`
- Keys are stored indefinitely (currently; retention policy may change)

This means:

```
User A with key 550e... → Creates prediction A
User B with key 550e... → Creates prediction B (different user, same key allowed)
```

Each gets their own independent response.

## Supported Endpoints

Idempotency is available on all state-changing endpoints:

- **POST** endpoints (creation): Markets, Predictions, Competitions, etc.
- **PATCH** endpoints (updates): Market updates, prediction edits, etc.
- **DELETE** endpoints (deletions): Remove markets, cancel predictions, etc.

**NOT supported on**:
- **GET** endpoints (reads are already idempotent by nature)
- **HEAD**, **OPTIONS** requests

## Caching Behavior

### How Long Are Responses Cached?

Responses are cached for the **lifetime of the key**. Currently, there is no expiration, so:

- A replayed request within 1 second returns cached response
- A replayed request within 1 year returns cached response

Future versions may implement retention policies (e.g., cache for 24 hours).

### Response Content

Cached responses include:

- Response body (JSON)
- HTTP status code
- Response headers (except streaming headers)
- Timestamp of original request

Mutable fields like `updated_at` are returned as they were in the original response.

## Common Use Cases

### Retry After Network Timeout

```
Request 1: Network timeout (request sent, response lost)
Request 2: Retry with same Idempotency-Key
Response: Cached response from Request 1
```

### Client Crash Before Receiving Response

```
Request 1: Sent, server processes, response sent but client crashes
Request 2: Client reconnects, retries with same Idempotency-Key
Response: Cached response from Request 1
```

### Duplicate Submission Prevention

```
User clicks "Submit" button
Request 1: Submitted successfully
User double-clicks (browser didn't disable button fast enough)
Request 2: Same Idempotency-Key, prevents duplicate
Response: Original cached response (no duplicate created)
```

## Best Practices

### ✅ DO

1. **Generate a new UUID for each logical request**
   - Create prediction A: `key-A-uuid`
   - Create prediction B: `key-B-uuid` (different key)

2. **Reuse the same key for retries of the same operation**
   - Initial request: `key-uuid`
   - Retry after timeout: `key-uuid` (same key)
   - Retry after client crash: `key-uuid` (same key)

3. **Include the header consistently**
   - If you include it on the first attempt, include it on retries
   - If you don't include it initially, you cannot rely on idempotency

4. **Log the Idempotency-Key for debugging**
   - Store it with the request in your logs
   - Useful for support inquiries and troubleshooting

### ❌ DON'T

1. **Reuse the same UUID for different operations**
   ```javascript
   // WRONG: Using same UUID for multiple operations
   const key = uuidv4();
   api.createPrediction(data1, key); // Prediction 1
   api.createPrediction(data2, key); // Prediction 2 (conflict!)
   ```

2. **Send non-UUID values**
   ```
   // WRONG: Not a valid UUID
   Idempotency-Key: my-request-1
   Idempotency-Key: request_123
   ```

3. **Omit the header then add it on retry**
   ```
   Request 1: No Idempotency-Key → Creates resource
   Request 2: With Idempotency-Key → No idempotency protection for Request 1
   ```

4. **Modify the request body between retries**
   ```
   Request 1: {"amount": 100}
   Request 2: {"amount": 200} (same key, different body)
   Response: 422 Unprocessable Entity
   ```

## Error Handling

### `400 Bad Request`

- Invalid header format (non-string value)
- Missing other required headers

### `422 Unprocessable Entity`

- `Idempotency-Key` is not a valid UUID
- `Idempotency-Key` already used with different request body

**Error message**:
```json
{
  "statusCode": 422,
  "message": "Idempotency-Key was already used with a different request body",
  "error": "Unprocessable Entity"
}
```

**Resolution**: Use a new UUID and retry.

### `429 Too Many Requests`

- Rate limit exceeded (idempotency is not rate-limit bypass)
- Same rate limits apply with or without idempotency

### `500 Internal Server Error`

- Idempotency cache unavailable
- Safe to retry with same key (if cache is restored)

## Example Client Implementation

**Node.js/JavaScript**:

```javascript
import { v4 as uuidv4 } from 'uuid';

async function createPredictionIdempotently(data) {
  const idempotencyKey = uuidv4();

  const request = async () => {
    return fetch('https://api.insightarena.com/api/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(data),
    });
  };

  // Retry logic
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await request();

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 422) {
        // Idempotency conflict - don't retry
        throw new Error('Request body mismatch');
      }

      if (response.status >= 500) {
        // Server error - retry
        retries--;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Other client errors - don't retry
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
```

## Performance Notes

- Idempotency caching has minimal overhead
- Cached responses are returned instantly (no re-processing)
- Cache lookup is O(1) with minimal memory footprint
- Network latency is the primary factor, not idempotency logic

## Security Considerations

- Idempotency keys are **not** secrets (they're UUIDs, not tokens)
- They're scoped to your authenticated user account
- Keys are transmitted in headers (use HTTPS)
- No sensitive data is stored in the cache beyond the response

## Limitations

- Idempotency only applies to the **API layer**
  - External side effects (email, webhooks) may still occur multiple times
  - Smart retry clients and idempotency together prevent most duplicates
- Keys are never expires (subject to change)
- Idempotency is **opt-in**: omit the header for standard (non-idempotent) requests

## FAQ

**Q: Do I have to use idempotency?**  
A: No, it's optional. Requests without the header are processed normally.

**Q: Can I use the same UUID for different API calls?**  
A: No. Each UUID should represent one atomic operation. Use a new UUID for each distinct operation.

**Q: What if the server returns 500 and I retry with the same key?**  
A: If the key was already recorded, the cached response is returned. If the cache was lost, the request is re-processed (may create duplicates if cache was not durable).

**Q: Can I use sequential numbers instead of UUIDs?**  
A: No. The header strictly validates UUID format. Use a UUID library in your language.

**Q: Do cached responses include timestamps?**  
A: Yes, responses are returned exactly as originally provided, including `created_at` and `updated_at` timestamps from the original operation.

---

**Last Updated**: November 2026  
**API Version**: v1
