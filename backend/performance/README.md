# Performance Testing Suite

This directory contains performance tests for the InsightArena backend API using k6.

## Setup

### Install k6

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Or download from https://k6.io/
```

### Install WebSocket extension (for WebSocket tests)

```bash
# Install xk6
go install go.k6.io/xk6/cmd/xk6@latest

# Build k6 with WebSocket support
xk6 build --with github.com/grafana/xk6-websocket
```

### Environment Variables

Create a `.env` file in the `performance` directory or export the following variables:

```bash
export API_BASE_URL=http://localhost:3000
export ORACLE_API_KEY=your-oracle-api-key
export WEBHOOK_SECRET=your-webhook-secret
export WS_URL=ws://localhost:3000
export AUTH_TOKEN=your-auth-token
```

## Running Tests

### API Load Test

Tests main API endpoints under load with 100 concurrent users.

```bash
k6 run performance/api-load-test.js
```

### Oracle Load Test

Tests oracle-specific endpoints under load.

```bash
k6 run performance/oracle-load-test.js
```

### Webhook Load Test

Tests webhook endpoint with signature verification under load.

```bash
k6 run performance/webhook-load-test.js
```

### Database Performance Test

Tests database query performance for various query types.

```bash
k6 run performance/database-performance-test.js
```

### Cache Effectiveness Test

Tests cache hit/miss performance and cache effectiveness.

```bash
k6 run performance/cache-effectiveness-test.js
```

### WebSocket Load Test

Tests WebSocket connection scalability and message throughput.

```bash
# Requires k6 built with WebSocket support
k6 run performance/websocket-load-test.js
```

## Test Scenarios

### Load Test Configuration

All load tests use the following ramp-up pattern:

- 30s: Ramp up to 10 users
- 1m: Ramp up to 50 users
- 2m: Ramp up to 100 users
- 2m: Stay at 100 users
- 1m: Ramp down to 50 users
- 30s: Ramp down to 0 users

Total duration: ~6 minutes

### Performance Thresholds

#### API Endpoints
- **p95 latency**: < 200ms
- **Error rate**: < 5%
- **Throughput**: Target 1000 RPS at peak load

#### Webhook Endpoints
- **p95 latency**: < 500ms (includes signature verification)
- **Error rate**: < 5%

#### Database Queries
- **Simple queries**: < 100ms
- **Paginated queries**: < 200ms
- **Filtered queries**: < 250ms
- **Join queries**: < 300ms
- **Aggregation queries**: < 300ms
- **Complex queries**: < 400ms

#### Cache Effectiveness
- **Cache hit latency**: < 50ms
- **Cache miss latency**: < 200ms
- **Cache hit rate**: > 80%

## Metrics

### Custom Metrics

All tests track the following custom metrics:

- `errors`: Error rate
- `p50_latency`: 50th percentile latency
- `p95_latency`: 95th percentile latency
- `p99_latency`: 99th percentile latency
- `throughput`: Total requests processed

### Additional Metrics (WebSocket)

- `ws_errors`: WebSocket error rate
- `ws_latency`: WebSocket message latency
- `ws_connections`: Total WebSocket connections
- `ws_messages`: Total WebSocket messages

## Output

k6 provides the following output:

- **Console**: Real-time progress and statistics
- **End report**: Summary of all metrics
- **JSON output**: Can be exported with `--out json=results.json`

### Export Results

```bash
k6 run --out json=results.json performance/api-load-test.js
```

## Pass/Fail Thresholds

Every HTTP script enforces latency and error-rate thresholds. k6 checks them
at the end of the run and **exits non-zero (code 99) when any is breached**,
so a regression fails the run and the CI job.

The shared thresholds live in `k6-config.js` (`buildThresholds()`), and each
script that uses them re-exports `options` from it — k6 only applies options
exported by the entry script.

| Metric              | Load default | Smoke default | Override        |
| ------------------- | ------------ | ------------- | --------------- |
| `http_req_duration` | p(95) < 200ms | p(95) < 300ms | `K6_P95_MS`     |
| `http_req_duration` | p(99) < 500ms | p(99) < 800ms | `K6_P99_MS`     |
| `http_req_failed`   | rate < 5%    | rate < 1%     | `K6_ERROR_RATE` |
| `errors` (checks)   | rate < 5%    | rate < 1%     | `K6_ERROR_RATE` |

### Smoke check

`smoke-test.js` is a short run (5 VUs for 30s by default) against public
health endpoints that need no seed data:

```bash
pnpm run perf:smoke                # exits 0 when all thresholds pass
pnpm run perf:smoke:breach-check   # forces p(95)<0ms; passes only if k6 fails
```

Tune with `API_BASE_URL`, `SMOKE_PATHS`, `SMOKE_VUS` and `SMOKE_DURATION`.

In GitHub Actions the optional **Performance smoke (k6)** job in
`.github/workflows/backend-ci.yml` runs both commands against a freshly built
API. It runs when the workflow is dispatched manually or on pull requests
labelled `perf`, and is capped at 10 minutes.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Tests

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Start application
        run: npm run start:prod &
      
      - name: Wait for application
        run: sleep 30
      
      - name: Run performance tests
        env:
          API_BASE_URL: http://localhost:3000
        run: |
          k6 run performance/api-load-test.js
          k6 run performance/oracle-load-test.js
          k6 run performance/webhook-load-test.js
```

## Performance Benchmarks

### Current Benchmarks (to be updated after initial runs)

#### API Load Test
- **p50 latency**: TBD
- **p95 latency**: TBD
- **p99 latency**: TBD
- **Throughput**: TBD
- **Error rate**: TBD

#### Oracle Load Test
- **p50 latency**: TBD
- **p95 latency**: TBD
- **p99 latency**: TBD
- **Throughput**: TBD
- **Error rate**: TBD

#### Webhook Load Test
- **p50 latency**: TBD
- **p95 latency**: TBD
- **p99 latency**: TBD
- **Throughput**: TBD
- **Error rate**: TBD

#### Database Performance Test
- **Simple query**: TBD
- **Paginated query**: TBD
- **Filtered query**: TBD
- **Join query**: TBD
- **Aggregation query**: TBD
- **Complex query**: TBD

#### Cache Effectiveness Test
- **Cache hit latency**: TBD
- **Cache miss latency**: TBD
- **Cache hit rate**: TBD

#### WebSocket Load Test
- **Connection latency**: TBD
- **Message latency**: TBD
- **Max concurrent connections**: TBD
- **Message throughput**: TBD

## Known Bottlenecks

### Identified Issues

1. **Database Query Performance**
   - Issue: Complex queries with multiple joins are slow
   - Impact: High load on events with matches endpoint
   - Solution: Add database indexes, consider query optimization

2. **Cache Configuration**
   - Issue: Cache TTL may be too short for frequently accessed data
   - Impact: Increased database load
   - Solution: Adjust cache TTL based on data access patterns

3. **Webhook Signature Verification**
   - Issue: HMAC-SHA256 verification adds latency
   - Impact: Webhook endpoint p95 latency
   - Solution: Consider caching verified signatures for short periods

### Recommendations

1. **Database Optimization**
   - Add composite indexes for frequently queried columns
   - Implement query result caching for complex queries
   - Consider read replicas for high-traffic endpoints

2. **Caching Strategy**
   - Implement multi-level caching (memory + Redis)
   - Use cache warming for frequently accessed data
   - Implement cache invalidation strategies

3. **API Optimization**
   - Implement response compression
   - Add CDN for static assets
   - Consider GraphQL for complex data requirements

4. **Monitoring**
   - Set up APM monitoring (e.g., New Relic, Datadog)
   - Implement real-time performance dashboards
   - Set up alerting for performance degradation

## Troubleshooting

### Common Issues

**Test fails with connection refused**
- Ensure the API server is running
- Check API_BASE_URL environment variable
- Verify server is accessible from test machine

**High error rates**
- Check server logs for errors
- Verify authentication tokens are valid
- Ensure test data exists in database

**WebSocket tests fail**
- Ensure k6 is built with WebSocket support
- Check WS_URL environment variable
- Verify WebSocket endpoint is enabled

## Contributing

When adding new performance tests:

1. Follow the existing naming convention
2. Include proper thresholds in options
3. Add custom metrics for relevant measurements
4. Document the test purpose in this README
5. Update benchmarks after initial runs
