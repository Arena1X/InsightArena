// Smoke-level performance check for CI (#2212).
//
// A short, low-concurrency run (~30s by default) against cheap public
// endpoints that do not need seeded data or auth. It enforces the same kind
// of pass/fail thresholds as the full load tests: if p(95)/p(99) latency or
// the error rate exceeds its budget, k6 exits non-zero and the CI job fails.
//
//   pnpm run perf:smoke                  # should exit 0 against a healthy API
//   pnpm run perf:smoke:breach-check     # forces an impossible budget and
//                                        # asserts that k6 exits non-zero
//
// Tunables (env):
//   API_BASE_URL       base URL of the running API (default http://localhost:3000)
//   SMOKE_PATHS        comma-separated paths to hit
//                      (default /api/v1/health/live,/api/v1/health/ping)
//   SMOKE_VUS          concurrent virtual users (default 5)
//   SMOKE_DURATION     run length (default 30s)
//   K6_P95_MS / K6_P99_MS / K6_ERROR_RATE — threshold budgets
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { buildThresholds } from './k6-config.js';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const PATHS = (__ENV.SMOKE_PATHS || '/api/v1/health/live,/api/v1/health/ping')
  .split(',')
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

export const options = {
  vus: Number(__ENV.SMOKE_VUS || 5),
  duration: __ENV.SMOKE_DURATION || '30s',
  // Smoke budgets are a little looser than the full load profile because CI
  // runners are noisy; override with K6_P95_MS / K6_P99_MS / K6_ERROR_RATE.
  thresholds: buildThresholds({
    p95: Number(__ENV.K6_P95_MS || 300),
    p99: Number(__ENV.K6_P99_MS || 800),
    errorRate: Number(__ENV.K6_ERROR_RATE || 0.01),
  }),
};

export default function () {
  for (const path of PATHS) {
    const res = http.get(`${BASE_URL}${path}`, { tags: { name: path } });
    const ok = check(res, {
      [`${path} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  }
  sleep(1);
}
