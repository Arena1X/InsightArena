import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import websocket from 'k6/x/websocket';

// Custom metrics
const wsErrorRate = new Rate('ws_errors');
const wsLatency = new Trend('ws_latency');
const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages');

// Configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 concurrent connections
    { duration: '1m', target: 50 },    // Ramp up to 50 concurrent connections
    { duration: '2m', target: 100 },   // Ramp up to 100 concurrent connections
    { duration: '2m', target: 100 },   // Stay at 100 concurrent connections
    { duration: '1m', target: 50 },    // Ramp down to 50 concurrent connections
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    ws_errors: ['rate<0.05'],          // Error rate must be below 5%
  },
};

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export default function() {
  const url = `${WS_URL}/ws?token=${AUTH_TOKEN}`;
  const ws = new websocket.WebSocket(url);

  ws.onOpen(() => {
    console.log('WebSocket connection opened');
    wsConnections.add(1);
  });

  ws.onMessage((message) => {
    wsMessages.add(1);
    const data = JSON.parse(message);
    
    // Calculate latency if message has timestamp
    if (data.timestamp) {
      const latency = Date.now() - data.timestamp;
      wsLatency.add(latency);
    }
  });

  ws.onError((error) => {
    console.error('WebSocket error:', error);
    wsErrorRate.add(1);
  });

  ws.onClose(() => {
    console.log('WebSocket connection closed');
  });

  // Send messages periodically
  const sendMessageInterval = setInterval(() => {
    if (ws.readyState === websocket.OPEN) {
      const message = {
        type: 'ping',
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(message));
    }
  }, 1000);

  // Keep connection open for duration of test
  sleep(30);

  // Cleanup
  clearInterval(sendMessageInterval);
  ws.close();
}

export function teardown() {
  console.log('Teardown: WebSocket load test completed');
}
