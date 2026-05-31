import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

// Custom metrics
const webhookErrorRate = new Rate('webhook_errors');
const webhookLatency = new Trend('webhook_latency');

// Configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 concurrent webhooks
    { duration: '1m', target: 50 },    // Ramp up to 50 concurrent webhooks
    { duration: '2m', target: 100 },   // Ramp up to 100 concurrent webhooks
    { duration: '2m', target: 100 },   // Stay at 100 concurrent webhooks
    { duration: '1m', target: 50 },    // Ramp down to 50 concurrent webhooks
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of webhook requests must complete below 500ms
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    webhook_errors: ['rate<0.05'],     // Custom error rate below 5%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WEBHOOK_SECRET || 'test-secret-key';

// Helper function to generate webhook signature
function generateWebhookSignature(timestamp, body) {
  const message = `${timestamp}.${body}`;
  const hmac = crypto.hmac('sha256', WEBHOOK_SECRET, message);
  return hmac;
}

export default function() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const webhookPayload = {
    match_id: Math.floor(Math.random() * 1000).toString(),
    winning_team: ['TEAM_A', 'TEAM_B', 'DRAW'][Math.floor(Math.random() * 3)],
    confidence_score: Math.floor(Math.random() * 40) + 60, // 60-100
    data_source: 'https://api.example.com/match-result',
    timestamp: new Date().toISOString(),
    metadata: {
      source: 'performance-test',
    },
  };

  const body = JSON.stringify(webhookPayload);
  const signature = generateWebhookSignature(timestamp, body);

  const headers = {
    'Content-Type': 'application/json',
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
  };

  const response = http.post(`${BASE_URL}/oracle/webhooks/match-result`, body, { headers });

  // Record metrics
  webhookLatency.add(response.timings.duration);
  webhookErrorRate.add(response.status !== 202);

  check(response, {
    'webhook accepted with 202': (r) => r.status === 202,
    'webhook response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.05); // Small delay between webhook submissions
}
