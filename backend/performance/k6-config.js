import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const p50Latency = new Trend('p50_latency');
const p95Latency = new Trend('p95_latency');
const p99Latency = new Trend('p99_latency');
const throughput = new Counter('throughput');

// Configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 100 },   // Stay at 100 users
    { duration: '1m', target: 50 },    // Ramp down to 50 users
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    errors: ['rate<0.05'],             // Custom error rate below 5%
  },
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
