import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const p50Latency = new Trend('p50_latency');
const p95Latency = new Trend('p95_latency');
const p99Latency = new Trend('p99_latency');
const throughput = new Counter('throughput');

// Pass/fail thresholds (#2212).
//
// k6 evaluates these at the end of every run and exits non-zero (code 99)
// when any of them is breached, so a latency or error-rate regression fails
// the run (and therefore CI). Limits can be tightened/loosened per run via
// environment variables without editing the scripts:
//   K6_P95_MS     — p(95) request latency budget in ms   (default 200)
//   K6_P99_MS     — p(99) request latency budget in ms   (default 500)
//   K6_ERROR_RATE — max failed-request / failed-check ratio (default 0.05)
const P95_MS = Number(__ENV.K6_P95_MS || 200);
const P99_MS = Number(__ENV.K6_P99_MS || 500);
const ERROR_RATE = Number(__ENV.K6_ERROR_RATE || 0.05);

export function buildThresholds({
  p95 = P95_MS,
  p99 = P99_MS,
  errorRate = ERROR_RATE,
} = {}) {
  return {
    http_req_duration: [`p(95)<${p95}`, `p(99)<${p99}`],
    http_req_failed: [`rate<${errorRate}`],
    errors: [`rate<${errorRate}`],
  };
}

export const thresholds = buildThresholds();

export const loadStages = [
  { duration: '30s', target: 10 },   // Ramp up to 10 users
  { duration: '1m', target: 50 },    // Ramp up to 50 users
  { duration: '2m', target: 100 },   // Ramp up to 100 users
  { duration: '2m', target: 100 },   // Stay at 100 users
  { duration: '1m', target: 50 },    // Ramp down to 50 users
  { duration: '30s', target: 0 },    // Ramp down to 0
];

// Full load profile. Scripts must re-export this (`export { options } from
// './k6-config.js'`) — k6 only applies `options`, and therefore thresholds,
// that are exported from the entry script itself.
export const options = {
  stages: loadStages,
  thresholds,
};

// Base URL from environment variable
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

// Helper function to make authenticated requests
function makeAuthenticatedRequest(method, endpoint, body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const params = {
    headers,
  };

  let response;
  if (method === 'GET') {
    response = http.get(`${BASE_URL}${endpoint}`, params);
  } else if (method === 'POST') {
    response = http.post(`${BASE_URL}${endpoint}`, JSON.stringify(body), params);
  } else if (method === 'PUT') {
    response = http.put(`${BASE_URL}${endpoint}`, JSON.stringify(body), params);
  } else if (method === 'DELETE') {
    response = http.del(`${BASE_URL}${endpoint}`, null, params);
  }

  // Record custom metrics
  p50Latency.add(response.timings.duration);
  p95Latency.add(response.timings.duration);
  p99Latency.add(response.timings.duration);
  throughput.add(1);

  return response;
}

// Helper function to check response and record errors
function checkResponse(response, checks) {
  const success = check(response, checks);
  errorRate.add(!success);
  return success;
}

export { makeAuthenticatedRequest, checkResponse, BASE_URL };
