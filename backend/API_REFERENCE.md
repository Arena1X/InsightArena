# InsightArena API Reference

Base URL: `http://localhost:3000/api/v1`

Authentication: Bearer JWT (obtained via `POST /auth/verify`)

## Table of Contents
1. Authentication
2. Users
3. Markets
4. Predictions
5. Leaderboard
6. Competitions
7. Seasons
8. Achievements
9. Analytics
10. Notifications
11. Flags
12. Admin
13. Search
14. Health

---

## Authentication

### `POST /auth/challenge`
One-line description: Generate a one-time challenge string for wallet signing.

Auth required: No

Request body:
```json
{
  "stellar_address": "string"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "challenge": "InsightArena:nonce:<timestamp>:<random>:<stellar_address>"
}
```

Error responses:
- `400` when `stellar_address` is missing or malformed
- `429` if request rate limit is exceeded
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"stellar_address":"GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN"}'
```

### `POST /auth/verify`
One-line description: Verify a signed challenge and issue a JWT session token.

Auth required: No

Request body:
```json
{
  "stellar_address": "string",
  "signed_challenge": "string"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "access_token": "string",
  "user": {
    "id": "string",
    "username": "string|null",
    "stellar_address": "string",
    "avatar_url": "string|null",
    "total_predictions": number,
    "correct_predictions": number,
    "total_staked_stroops": "string",
    "total_winnings_stroops": "string",
    "reputation_score": number,
    "season_points": number,
    "role": "string",
    "created_at": "string",
    "updated_at": "string"
  }
}
```

Error responses:
- `401` if the challenge is invalid, expired, already used, or the signature does not verify
- `429` if auth rate limit is exceeded
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "stellar_address":"GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN",
    "signed_challenge":"<hex-encoded-signature>"
  }'
```

### `POST /auth/verify-wallet`
One-line description: Verify a wallet signature without creating a session.

Auth required: No

Request body:
```json
{
  "stellar_address": "string",
  "challenge": "string",
  "signature": "string"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "verified": true
}
```

Error responses:
- `401` if the signature verification fails
- `429` if request rate limit is exceeded
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/auth/verify-wallet \
  -H "Content-Type: application/json" \
  -d '{
    "stellar_address":"GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN",
    "challenge":"InsightArena:nonce:...",
    "signature":"<hex-encoded-signature>"
  }'
```

### `GET /auth/rate-limit`
One-line description: Retrieve the authenticated user's current rate limit status.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "limit": 100,
  "remaining": 87,
  "reset_at": "2026-03-30T04:00:00.000Z"
}
```

Error responses:
- `401` when the bearer token is missing or invalid
- `429` if the user itself is rate limited
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/auth/rate-limit \
  -H "Authorization: Bearer $TOKEN"
```

---

## Users

### `GET /users/me`
One-line description: Retrieve the authenticated user's profile.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "username": "string|null",
  "stellar_address": "string",
  "avatar_url": "string|null",
  "total_predictions": number,
  "correct_predictions": number,
  "total_staked_stroops": "string",
  "total_winnings_stroops": "string",
  "reputation_score": number,
  "season_points": number,
  "role": "string",
  "created_at": "string",
  "updated_at": "string"
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /users/me`
One-line description: Update the authenticated user's public profile fields.

Auth required: Yes

Request body:
```json
{
  "username": "string (optional)",
  "avatar_url": "string (optional)"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "username": "string|null",
  "stellar_address": "string",
  "avatar_url": "string|null",
  "total_predictions": number,
  "correct_predictions": number,
  "total_staked_stroops": "string",
  "total_winnings_stroops": "string",
  "reputation_score": number,
  "season_points": number,
  "role": "string",
  "created_at": "string",
  "updated_at": "string"
}
```

Error responses:
- `400` when validation fails (username length, avatar_url URL format)
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"StellarTrader42","avatar_url":"https://example.com/avatar.png"}'
```

### `GET /users/me/bookmarks`
One-line description: Get paginated bookmarked markets for the authenticated user.

Auth required: Yes

Request body: none

Query parameters:
- `page` (number, default: 1) – page number
- `limit` (number, default: 20, max: 50) – items per page

Success response:
- `200 OK`
```json
{
  "data": [/* bookmarked market objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/me/bookmarks?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /users/me/export`
One-line description: Export the authenticated user's full personal data.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  /* exported user data object */
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/users/me/export \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /users/me/preferences`
One-line description: Update the authenticated user's notification preferences.

Auth required: Yes

Request body:
```json
{
  "email_notifications": true,
  "market_resolution_notifications": false,
  "competition_notifications": true,
  "leaderboard_notifications": false,
  "marketing_emails": false
}
```
All fields are optional.

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "email_notifications": boolean,
  "market_resolution_notifications": boolean,
  "competition_notifications": boolean,
  "leaderboard_notifications": boolean,
  "marketing_emails": boolean,
  "created_at": "string",
  "updated_at": "string"
}
```

Error responses:
- `400` when validation fails
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/users/me/preferences \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_notifications":true,"marketing_emails":false}'
```

### `GET /users/:address`
One-line description: Retrieve a public user profile by Stellar address.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "username": "string|null",
  "stellar_address": "string",
  "reputation_score": number,
  "total_predictions": number,
  "correct_predictions": number,
  "created_at": "string"
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN
```

### `GET /users/:address/predictions`
One-line description: Get public predictions for a user’s resolved markets.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `outcome` (`correct`, `incorrect`, `pending`)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "chosen_outcome": "string",
      "stake_amount_stroops": "string",
      "payout_claimed": boolean,
      "payout_amount_stroops": "string",
      "tx_hash": "string|null",
      "submitted_at": "string",
      "outcome": "correct|incorrect|pending",
      "market": {
        "id": "string",
        "title": "string",
        "end_time": "string",
        "resolved_outcome": "string|null",
        "is_resolved": boolean,
        "is_cancelled": boolean
      }
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/predictions?page=1&limit=20&outcome=correct"
```

### `GET /users/:address/markets`
One-line description: List markets created by a user.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (`active`, `resolved`, `cancelled`)
- `sort_by` (`created_at`, `participant_count`)
- `order` (`asc`, `desc`)

Success response:
- `200 OK`
```json
{
  "data": [/* market list items */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/markets?page=1&limit=20&status=active"
```

### `GET /users/:address/competitions`
One-line description: Get competitions a user has participated in.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (`active`, `completed`)

Success response:
- `200 OK`
```json
{
  "data": [/* competition entries */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/competitions?page=1&limit=20"
```

### `GET /users/:address/achievements`
One-line description: Retrieve public achievements for a user.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "unlocked_at": "string|null",
    "is_unlocked": boolean
  }
]
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/achievements
```

### `POST /users/:address/follow`
One-line description: Follow another user.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "success": true,
  "message": "User followed successfully"
}
```

Error responses:
- `400` when the request is invalid
- `401` if not authenticated
- `404` if the target user is not found
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/follow \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /users/:address/unfollow`
One-line description: Unfollow a user.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "success": true,
  "message": "User unfollowed successfully"
}
```

Error responses:
- `401` if not authenticated
- `404` if the follow relationship or user is not found
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/unfollow \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /users/:address/followers`
One-line description: Get followers of a user.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "stellar_address": "string",
      "username": "string|null",
      "avatar_url": "string|null",
      "reputation_score": number
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/followers?page=1&limit=20"
```

### `GET /users/:address/following`
One-line description: Get users followed by a user.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "stellar_address": "string",
      "username": "string|null",
      "avatar_url": "string|null",
      "reputation_score": number
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/following?page=1&limit=20"
```

---

## Markets

### `GET /markets`
One-line description: List markets with filtering and pagination.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 50)
- `category` (string)
- `status` (`open`, `resolved`, `cancelled`)
- `is_public` (`true` or `false`)
- `search` (string)

Success response:
- `200 OK`
```json
{
  "data": [/* market list objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query values
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/markets?page=1&limit=20&category=Crypto&status=open&search=bitcoin"
```

### `POST /markets`
One-line description: Create a new prediction market.

Auth required: Yes

Request body:
```json
{
  "title": "string",
  "description": "string",
  "category": "Crypto|Sports|Finance|Politics|Tech",
  "outcome_options": ["string", "string"],
  "end_time": "ISO 8601 string",
  "resolution_time": "ISO 8601 string",
  "creator_fee_bps": number,
  "min_stake_stroops": "string",
  "max_stake_stroops": "string",
  "is_public": boolean
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "category": "string",
  "outcome_options": ["string"],
  "end_time": "string",
  "resolution_time": "string",
  "creator_fee_bps": number,
  "min_stake_stroops": "string",
  "max_stake_stroops": "string",
  "is_public": boolean,
  "created_at": "string",
  "updated_at": "string",
  "creator": {/* user object */}
}
```

Error responses:
- `400` if validation fails
- `401` if not authenticated
- `502` if the Soroban contract call fails
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/markets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Will BTC reach $100k by end of 2026?",
    "description":"This market resolves YES if Bitcoin reaches $100,000 USD by 2026-12-31.",
    "category":"Crypto",
    "outcome_options":["Yes","No"],
    "end_time":"2026-12-31T23:59:59.000Z",
    "resolution_time":"2027-01-07T23:59:59.000Z",
    "creator_fee_bps":100,
    "min_stake_stroops":"10000000",
    "max_stake_stroops":"1000000000",
    "is_public":true
  }'
```

### `POST /markets/bulk`
One-line description: Bulk create multiple markets in one request.

Auth required: Yes

Request body:
```json
{
  "markets": [
    { /* CreateMarketDto */ },
    { /* CreateMarketDto */ }
  ]
}
```

Query parameters: none

Success response:
- `201 Created`
```json
[
  { /* created market object */ },
  { /* created market object */ }
]
```

Error responses:
- `400` if validation fails or more than 10 markets are submitted
- `401` if not authenticated
- `502` if a contract call fails
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/markets/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"markets":[{"title":"Market 1","description":"Desc","category":"Crypto","outcome_options":["Yes","No"],"end_time":"2026-12-31T23:59:59.000Z","resolution_time":"2027-01-07T23:59:59.000Z","creator_fee_bps":100,"min_stake_stroops":"10000000","max_stake_stroops":"1000000000","is_public":true}]}'
```

### `GET /markets/featured`
One-line description: Retrieve featured markets.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 50)

Success response:
- `200 OK`
```json
{
  "data": [/* featured market objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query values
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/markets/featured?page=1&limit=20"
```

### `GET /markets/trending`
One-line description: Get trending markets sorted by score.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 50)

Success response:
- `200 OK`
```json
{
  "data": [/* trending market objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query values
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/markets/trending?page=1&limit=20"
```

### `GET /markets/templates`
One-line description: Get predefined market templates.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "category": "string",
    "outcome_options": ["string"]
  }
]
```

Error responses:
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/templates
```

### `GET /markets/:id`
One-line description: Retrieve a market by ID or on-chain ID.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "category": "string",
  "outcome_options": ["string"],
  "end_time": "string",
  "resolution_time": "string",
  "creator_fee_bps": number,
  "min_stake_stroops": "string",
  "max_stake_stroops": "string",
  "is_public": boolean,
  "is_resolved": boolean,
  "is_cancelled": boolean,
  "creator": {/* user object */}
}
```

Error responses:
- `404` if the market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/<market-id>
```

### `DELETE /markets/:id`
One-line description: Cancel a market if the caller is the creator or admin.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_cancelled": true,
  /* updated market object */
}
```

Error responses:
- `400` if the market has ended or already resolved
- `401` if not authenticated
- `403` if not authorized
- `404` if the market is not found
- `502` if the refund/contract call fails
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/markets/<market-id> \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /markets/:id/predictions`
One-line description: Get anonymous market prediction statistics by outcome.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
[
  {
    "outcome": "string",
    "count": number,
    "stake_total_stroops": "string",
    "probability": number
  }
]
```

Error responses:
- `404` if the market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/<market-id>/predictions
```

### `GET /markets/:id/analytics`
One-line description: Get analytics for a specific market.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "market_id": "uuid",
  "total_pool_stroops": "string",
  "participant_count": number,
  "outcome_distribution": [
    {
      "outcome": "string",
      "count": number,
      "percentage": number
    }
  ],
  "time_remaining_seconds": number
}
```

Error responses:
- `404` if the market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/<market-id>/analytics
```

### `POST /markets/:id/comments`
One-line description: Post a comment on a market.

Auth required: Yes

Request body:
```json
{
  "content": "string",
  "parentId": "string (optional)"
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "content": "string",
  "parentId": "string|null",
  "market_id": "string",
  "user_id": "string",
  "created_at": "string"
}
```

Error responses:
- `400` if `content` is missing
- `401` if not authenticated
- `404` if market or parent comment is not found
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/markets/<market-id>/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Great market idea!"}'
```

### `GET /markets/:id/comments`
One-line description: Fetch comments for a market.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
[
  {
    "id": "string",
    "content": "string",
    "parentId": "string|null",
    "market_id": "string",
    "user_id": "string",
    "created_at": "string",
    "replies": [/* nested comments */]
  }
]
```

Error responses:
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/<market-id>/comments
```

### `GET /markets/:id/report`
One-line description: Generate a detailed market report.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "market_id": "string",
  "title": "string",
  "outcome_distribution": [/* distribution data */],
  "timeline": [/* timeline points */],
  "statistics": {/* aggregated stats */}
}
```

Error responses:
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/markets/<market-id>/report
```

### `POST /markets/:id/bookmark`
One-line description: Bookmark a market for the authenticated user.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `201 Created`
```json
{
  "success": true
}
```

Error responses:
- `401` if not authenticated
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/markets/<market-id>/bookmark \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /markets/:id/bookmark`
One-line description: Remove a market bookmark.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "success": true
}
```

Error responses:
- `401` if not authenticated
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/markets/<market-id>/bookmark \
  -H "Authorization: Bearer $TOKEN"
```

---

## Predictions

### `POST /predictions`
One-line description: Submit a prediction to a market.

Auth required: Yes

Request body:
```json
{
  "market_id": "string",
  "chosen_outcome": "string",
  "stake_amount_stroops": "string"
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "market_id": "string",
  "chosen_outcome": "string",
  "stake_amount_stroops": "string",
  "payout_claimed": boolean,
  "submitted_at": "string",
  "status": "string",
  "user_id": "string"
}
```

Error responses:
- `400` when market is closed or outcome is invalid
- `401` if not authenticated
- `404` if market is not found
- `409` if duplicate prediction is detected
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/predictions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "market_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "chosen_outcome":"Yes",
    "stake_amount_stroops":"10000000"
  }'
```

### `GET /predictions/me`
One-line description: Get the authenticated user's own predictions.

Auth required: Yes

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (`active`, `won`, `lost`, `pending`)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "chosen_outcome": "string",
      "stake_amount_stroops": "string",
      "payout_claimed": boolean,
      "payout_amount_stroops": "string",
      "tx_hash": "string|null",
      "note": "string|null",
      "submitted_at": "string",
      "status": "active|won|lost|pending",
      "market": {
        "id": "string",
        "title": "string",
        "end_time": "string",
        "resolved_outcome": "string|null",
        "is_resolved": boolean,
        "is_cancelled": boolean
      }
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/predictions/me?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /predictions/:id/note`
One-line description: Update the authenticated user's personal note for a prediction.

Auth required: Yes

Request body:
```json
{
  "note": "string"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "note": "string",
  "updated_at": "string"
}
```

Error responses:
- `404` if the prediction is not found or not owned by the user
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/predictions/<prediction-id>/note \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"I expect this to win based on recent news."}'
```

---

## Leaderboard

### `GET /leaderboard`
One-line description: Get the global leaderboard with optional season filtering.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 100)
- `season_id` (string)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "rank": number,
      "user_id": "string",
      "username": "string|null",
      "stellar_address": "string",
      "reputation_score": number,
      "accuracy_rate": "string",
      "total_winnings_stroops": "string",
      "season_points": number|null
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query data
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/leaderboard?page=1&limit=20"
```

### `GET /leaderboard/history`
One-line description: Get historical leaderboard snapshots.

Auth required: No

Request body: none

Query parameters:
- `date` (ISO date string)
- `season_id` (UUID)
- `user_id` (UUID)
- `address` (string)
- `page` (number, default: 1)
- `limit` (number, default: 20)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "rank": number,
      "user_id": "string",
      "username": "string|null",
      "stellar_address": "string",
      "reputation_score": number,
      "accuracy_rate": "string",
      "total_winnings_stroops": "string",
      "season_points": number,
      "snapshot_date": "string",
      "rank_change": number|null
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query data
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/leaderboard/history?season_id=<season-id>&page=1&limit=20"
```

---

## Competitions

### `GET /competitions`
One-line description: List competitions with pagination and optional status filtering.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (`active`, `completed`)

Success response:
- `200 OK`
```json
{
  "data": [/* competition objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query data
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/competitions?page=1&limit=20&status=active"
```

### `POST /competitions`
One-line description: Create a new competition.

Auth required: Yes

Request body:
```json
{
  "title": "string",
  "description": "string",
  "start_time": "ISO 8601 string",
  "end_time": "ISO 8601 string",
  "prize_pool_stroops": "string",
  "max_participants": number (optional),
  "visibility": "public|private"
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "start_time": "string",
  "end_time": "string",
  "prize_pool_stroops": "string",
  "max_participants": number|null,
  "visibility": "string",
  "created_at": "string",
  "updated_at": "string"
}
```

Error responses:
- `400` when validation fails or `end_time` is before `start_time`
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/competitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Q1 2026 Prediction Championship",
    "description":"Compete to become the top predictor of Q1 2026.",
    "start_time":"2026-04-01T00:00:00.000Z",
    "end_time":"2026-06-30T23:59:59.000Z",
    "prize_pool_stroops":"5000000000",
    "visibility":"public"
  }'
```

### `GET /competitions/:id`
One-line description: Retrieve a competition by ID.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "start_time": "string",
  "end_time": "string",
  "prize_pool_stroops": "string",
  "visibility": "string",
  "participant_count": number,
  "status": "active|completed"
}
```

Error responses:
- `404` if competition not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/competitions/<competition-id>
```

### `GET /competitions/:id/participants`
One-line description: Get paginated participants for a competition.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)

Success response:
- `200 OK`
```json
{
  "data": [/* participant objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `404` if competition not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/competitions/<competition-id>/participants?page=1&limit=20"
```

### `GET /competitions/:id/my-rank`
One-line description: Get the authenticated user's rank in a competition.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "competition_id": "string",
  "user_id": "string",
  "rank": number,
  "score": number,
  "percentile": number
}
```

Error responses:
- `401` if not authenticated
- `404` if competition or participant data is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/competitions/<competition-id>/my-rank \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /competitions/:id/join`
One-line description: Join a competition.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "message": "Successfully joined competition",
  "competition_id": "string",
  "participant_id": "string"
}
```

Error responses:
- `400` when the competition has ended or is full
- `401` if not authenticated
- `404` if competition not found
- `409` if already joined
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/competitions/<competition-id>/join \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /competitions/:id/leave`
One-line description: Leave a competition before it starts.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "message": "Successfully left competition",
  "competition_id": "string"
}
```

Error responses:
- `400` if the competition already started
- `401` if not authenticated
- `404` if competition not found
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/competitions/<competition-id>/leave \
  -H "Authorization: Bearer $TOKEN"
```

---

## Seasons

### `GET /seasons`
One-line description: List all seasons.

Auth required: No

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 50)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "season_number": number,
      "name": "string",
      "starts_at": "string",
      "ends_at": "string",
      "reward_pool_stroops": "string",
      "is_active": boolean,
      "is_finalized": boolean,
      "top_winner": {
        "user_id": "string",
        "username": "string|null",
        "stellar_address": "string"
      }|null
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` on invalid query data
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/seasons?page=1&limit=20"
```

### `GET /seasons/active`
One-line description: Get the currently active season.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "season_number": number,
  "name": "string",
  "starts_at": "string",
  "ends_at": "string",
  "reward_pool_stroops": "string",
  "is_active": true,
  "is_finalized": boolean,
  "top_winner": {/* optional */}
}
```

Error responses:
- `404` if no active season exists
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/seasons/active
```

### `GET /seasons/current`
One-line description: Alias for `/seasons/active`.

Auth required: No

Request body: none

Query parameters: none

Success response: same as `/seasons/active`

Error responses:
- `404` if no current season exists
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/seasons/current
```

### `POST /seasons`
One-line description: Create a new season (admin only).

Auth required: Yes (Admin)

Request body:
```json
{
  "name": "string",
  "season_number": number,
  "starts_at": "ISO 8601 string",
  "ends_at": "ISO 8601 string",
  "reward_pool_stroops": "string",
  "is_active": boolean,
  "is_finalized": boolean
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "name": "string",
  "season_number": number,
  "starts_at": "string",
  "ends_at": "string",
  "reward_pool_stroops": "string",
  "is_active": boolean,
  "is_finalized": boolean,
  "created_at": "string",
  "updated_at": "string"
}
```

Error responses:
- `401` if not authenticated
- `403` if user is not admin
- `409` if season overlaps or duplicate season number exists
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/seasons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Season 5",
    "season_number":5,
    "starts_at":"2026-07-01T00:00:00.000Z",
    "ends_at":"2026-09-30T23:59:59.000Z",
    "reward_pool_stroops":"10000000000",
    "is_active":true,
    "is_finalized":false
  }'
```

### `POST /seasons/:id/finalize`
One-line description: Finalize a season and record its top winner (admin only).

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_finalized": true,
  "top_winner": {/* winner info */}
}
```

Error responses:
- `401` if not authenticated
- `403` if user is not admin
- `404` if season is not found
- `409` if season is already finalized
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/seasons/<season-id>/finalize \
  -H "Authorization: Bearer $TOKEN"
```

---

## Achievements

### `GET /users/:address/achievements`
One-line description: Fetch achievement badges for a user.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "unlocked_at": "string|null",
    "is_unlocked": boolean
  }
]
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/achievements
```

---

## Analytics

### `GET /analytics/dashboard`
One-line description: Get authenticated user's analytics dashboard KPIs.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "total_predictions": number,
  "accuracy_rate": number,
  "win_rate": number,
  "total_winnings_stroops": "string",
  "active_markets": number,
  "leaderboard_position": number,
  "season_points": number
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/analytics/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /analytics/markets/:id`
One-line description: Get analytics for a specific market.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "market_id": "string",
  "title": "string",
  "pool_size_stroops": "string",
  "participants": number,
  "outcome_distribution": [/* data */],
  "time_remaining": "string",
  "is_resolved": boolean
}
```

Error responses:
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/analytics/markets/<market-id>
```

### `GET /analytics/markets/:id/history`
One-line description: Get market history over time.

Auth required: No

Request body: none

Query parameters:
- `from` (ISO 8601 string, optional)
- `to` (ISO 8601 string, optional)
- `interval` (string, optional)

Success response:
- `200 OK`
```json
{
  "market_id": "string",
  "history": [
    {
      "timestamp": "string",
      "pool_size_stroops": "string",
      "participant_count": number,
      "prices": {/* outcome prices */}
    }
  ]
}
```

Error responses:
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/analytics/markets/<market-id>/history?from=2026-01-01T00:00:00.000Z&to=2026-01-07T00:00:00.000Z"
```

### `GET /analytics/users/:address/trends`
One-line description: Get user trend metrics over time.

Auth required: No

Request body: none

Query parameters:
- `days` (number, default: 30, max: 90)

Success response:
- `200 OK`
```json
{
  "stellar_address": "string",
  "accuracy_trend": [/* daily accuracy points */],
  "volume_trend": [/* daily stake totals */],
  "profit_loss_trend": [/* daily P/L */],
  "category_performance": [/* category stats */]
}
```

Error responses:
- `404` if the user is not found
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/analytics/users/GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN/trends?days=30"
```

### `GET /analytics/categories`
One-line description: Get aggregated category analytics.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "categories": [
    {
      "name": "string",
      "market_count": number,
      "volume_stroops": "string",
      "participant_count": number,
      "trending_score": number
    }
  ]
}
```

Error responses:
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/analytics/categories
```

---

## Notifications

### `GET /notifications`
One-line description: Retrieve notifications for the authenticated user.

Auth required: Yes

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `unread_only` (boolean)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "type": "string",
      "message": "string",
      "is_read": boolean,
      "created_at": "string"
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/notifications?page=1&limit=20&unread_only=true" \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /notifications/:id/read`
One-line description: Mark a specific notification as read.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `204 No Content`

Error responses:
- `401` if not authenticated
- `404` if notification not found
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/notifications/<notification-id>/read \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /notifications/read-all`
One-line description: Mark all notifications as read.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "updated": number
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/notifications/read-all \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /notifications/:id`
One-line description: Delete a notification.

Auth required: Yes

Request body: none

Query parameters: none

Success response:
- `204 No Content`

Error responses:
- `401` if not authenticated
- `404` if notification not found
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/notifications/<notification-id> \
  -H "Authorization: Bearer $TOKEN"
```

---

## Flags

### `POST /flags`
One-line description: Submit a flag for a market.

Auth required: Yes

Request body:
```json
{
  "market_id": "string",
  "reason": "string",
  "description": "string (optional)"
}
```

Query parameters: none

Success response:
- `201 Created`
```json
{
  "id": "string",
  "market_id": "string",
  "user_id": "string",
  "reason": "string",
  "description": "string|null",
  "status": "string",
  "created_at": "string"
}
```

Error responses:
- `400` if validation fails
- `401` if not authenticated
- `404` if the market is not found
- `409` if the market has already been flagged by the same user
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/flags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "market_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "reason":"Duplicate content",
    "description":"This market appears to be a duplicate of another active market."
  }'
```

### `GET /flags/my-flags`
One-line description: List flags submitted by the authenticated user.

Auth required: Yes

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 10)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "market_id": "string",
      "reason": "string",
      "description": "string|null",
      "status": "string",
      "created_at": "string"
    }
  ],
  "meta": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
```

Error responses:
- `401` if not authenticated
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/flags/my-flags?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Admin

> All admin endpoints require an authenticated user with Admin role.

### `GET /admin/dashboard/stats`
One-line description: Get admin dashboard KPIs and counts.

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "user_count": number,
  "active_markets": number,
  "pending_flags": number,
  "total_volume_stroops": "string",
  "resolved_competitions": number,
  "open_competitions": number
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin or moderator
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/admin/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /admin/users`
One-line description: List users with filters and pagination.

Auth required: Yes (Admin)

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 10, max: 100)
- `search` (string)
- `role` (string)
- `sortBy` (string, default: `created_at`)
- `sortOrder` (`ASC` or `DESC`, default: `DESC`)

Success response:
- `200 OK`
```json
{
  "data": [/* user objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/admin/users?page=1&limit=20&search=stellar&role=admin" \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /admin/users/:id/ban`
One-line description: Ban a user.

Auth required: Yes (Admin)

Request body:
```json
{
  "reason": "string"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_banned": true,
  "ban_reason": "string"
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/<user-id>/ban \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Violation of community rules"}'
```

### `PATCH /admin/users/:id/unban`
One-line description: Remove a ban from a user.

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_banned": false
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/<user-id>/unban \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /admin/users/:id/role`
One-line description: Change a user's role.

Auth required: Yes (Admin)

Request body:
```json
{
  "role": "Admin|Moderator|User|..."
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "role": "string"
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/<user-id>/role \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"Moderator"}'
```

### `GET /admin/users/:id/activity`
One-line description: Get a user's activity log.

Auth required: Yes (Admin)

Request body: none

Query parameters:
- `page` (number, default: 1)
- `limit` (number, default: 10, max: 100)
- `actionType` (string)
- `startDate` (ISO 8601 string)
- `endDate` (ISO 8601 string)

Success response:
- `200 OK`
```json
{
  "data": [
    {
      "id": "string",
      "user_id": "string",
      "action": "string",
      "metadata": {/* object */},
      "created_at": "string"
    }
  ],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/admin/users/<user-id>/activity?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /admin/flags`
One-line description: List flags for admin review.

Auth required: Yes (Admin)

Request body: none

Query parameters: any admin flag filters from `/flags` list release

Success response:
- `200 OK`
```json
{
  "data": [/* flag objects */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/admin/flags \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /admin/flags/:id/resolve`
One-line description: Resolve a user-submitted flag.

Auth required: Yes (Admin)

Request body:
```json
{
  "action": "DISMISS|REMOVE_MARKET|BAN_USER",
  "admin_notes": "string (optional)"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "status": "resolved|dismissed|...",
  "resolved_by": "string"
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `404` if flag is not found
- `409` if the flag has already been resolved
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/flags/<flag-id>/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"DISMISS","admin_notes":"No issue found."}'
```

### `POST /admin/markets/:id/resolve`
One-line description: Resolve a market as an admin.

Auth required: Yes (Admin)

Request body:
```json
{
  "resolved_outcome": "string",
  "resolution_note": "string (optional)"
}
```

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "resolved_outcome": "string",
  "is_resolved": true
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl -X POST http://localhost:3000/api/v1/admin/markets/<market-id>/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolved_outcome":"Yes","resolution_note":"Admin resolution"}'
```

### `PATCH /admin/markets/:id/feature`
One-line description: Feature a market in admin view.

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_featured": true
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/markets/<market-id>/feature \
  -H "Authorization: Bearer $TOKEN"
```

### `PATCH /admin/markets/:id/unfeature`
One-line description: Remove a market from featured status.

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "is_featured": false
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `404` if market is not found
- `500` on server error

Example curl:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/markets/<market-id>/unfeature \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /admin/reports/activity`
One-line description: Download or view platform activity reports.

Auth required: Yes (Admin)

Request body: none

Query parameters:
- `timeframe` (`daily`, `weekly`, `monthly`)
- `format` (`json`, `csv`, default: `json`)

Success response:
- `200 OK` with JSON or CSV body

Error responses:
- `400` if timeframe or format is invalid
- `401` if not authenticated
- `403` if not admin
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/admin/reports/activity?timeframe=weekly&format=json" \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /admin/competitions/:id`
One-line description: Cancel a competition.

Auth required: Yes (Admin)

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "id": "string",
  "status": "cancelled"
}
```

Error responses:
- `401` if not authenticated
- `403` if not admin
- `404` if competition is not found
- `409` if the competition cannot be cancelled
- `502` if refund handling fails
- `500` on server error

Example curl:
```bash
curl -X DELETE http://localhost:3000/api/v1/admin/competitions/<competition-id> \
  -H "Authorization: Bearer $TOKEN"
```

---

## Search

### `GET /search`
One-line description: Search markets, users, and competitions globally.

Auth required: No

Request body: none

Query parameters:
- `query` (string, required)
- `type` (`all`, `markets`, `users`, `competitions`, default: `all`)
- `page` (number, default: 1)
- `limit` (number, default: 20)

Success response:
- `200 OK`
```json
{
  "markets": [/* market search hits */],
  "users": [/* user search hits */],
  "competitions": [/* competition search hits */],
  "total": number,
  "page": number,
  "limit": number
}
```

Error responses:
- `400` when `query` is missing or invalid
- `500` on server error

Example curl:
```bash
curl "http://localhost:3000/api/v1/search?query=bitcoin&type=markets&page=1&limit=20"
```

---

## Health

### `GET /health`
One-line description: Perform a basic health check.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "status": "ok",
  "information": {
    "database": {"status": "up"},
    "external_services": {"status": "up"}
  }
}
```

Error responses:
- `503` when one or more service checks fail
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/health
```

### `GET /health/ping`
One-line description: Perform a simple ping check.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "status": "ok"
}
```

Error responses:
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/health/ping
```

### `GET /health/detailed`
One-line description: Retrieve detailed health and component status.

Auth required: No

Request body: none

Query parameters: none

Success response:
- `200 OK`
```json
{
  "status": "ok",
  "details": {
    "database": {"status": "up","details": {}},
    "cache": {"status": "up","details": {}},
    "external": {"status": "up","details": {}}
  }
}
```

Error responses:
- `500` on server error

Example curl:
```bash
curl http://localhost:3000/api/v1/health/detailed
```

---

## Common Error Responses

- `400 Bad Request`
  - Missing or invalid fields in the request body
  - Invalid query parameters
  - Validation failures for DTOs
  - Business rule failures such as market already resolved or competition ended
- `401 Unauthorized`
  - Missing or invalid JWT
  - Accessing an authenticated endpoint without credentials
- `403 Forbidden`
  - Authenticated user lacks required role or permission
  - Attempting admin-only actions without Admin role
- `404 Not Found`
  - Requested resource does not exist
  - Referenced user, market, competition, notification, or flag not found
- `429 Too Many Requests`
  - Global rate limit exceeded
  - Auth challenge or rate-limited request body exceeded allowed frequency
- `500 Internal Server Error`
  - Unexpected server or database failure
  - External service failure such as Soroban contract call failure

---

## Pagination

Most list endpoints return a paginated response with one of these shapes:

1. Top-level pagination fields:
```json
{
  "data": [/* items */],
  "total": number,
  "page": number,
  "limit": number
}
```

2. Meta wrapper with pagination values:
```json
{
  "data": [/* items */],
  "meta": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
```

Common pagination fields:
- `page`: current page number
- `limit`: number of items per page
- `total`: total number of available items
- `totalPages`: total pages available, when returned

When paging results, use `page` and `limit` consistently across endpoints.

---

## Rate Limiting

- Global request limit: `100 requests per minute`
- If the limit is exceeded, the API returns `429 Too Many Requests`
- Common headers returned by the API:
  - `X-RateLimit-Limit`: maximum requests in the current window
  - `X-RateLimit-Remaining`: requests left in the current window
  - `X-RateLimit-Reset`: timestamp when the window resets
- Authenticated users can inspect their own rate limit via `GET /auth/rate-limit`

---

## Authentication Flow

InsightArena uses wallet-based JWT authentication with a 3-step wallet auth process.

1. Generate challenge
   - `POST /auth/challenge`
   - Send `stellar_address` in the request body.
   - The server returns a unique challenge string.
2. Sign with Freighter / wallet
   - Use your Stellar wallet (Freighter) to sign the challenge string.
   - Produce a hex-encoded signature.
3. Verify signature and receive JWT
   - `POST /auth/verify`
   - Send `stellar_address` and `signed_challenge`.
   - The server verifies the signature and returns an `access_token` JWT.

Once the JWT is received, include it in all authenticated requests:
```http
Authorization: Bearer <access_token>
```

For signature-only verification without session creation, use `POST /auth/verify-wallet`.
