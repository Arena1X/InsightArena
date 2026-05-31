import { makeAuthenticatedRequest, checkResponse } from './k6-config.js';

// Test data
const TEST_USER = {
  email: 'perf-test@example.com',
  password: 'TestPassword123!',
};

let authToken = null;
let testEventId = null;

export function setup() {
  // Login to get auth token
  const loginResponse = makeAuthenticatedRequest('POST', '/auth/login', {
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  if (loginResponse.status === 200) {
    const data = JSON.parse(loginResponse.body);
    authToken = data.access_token;
    console.log('Setup: Auth token obtained');
  }

  // Get an event ID for cache testing
  if (authToken) {
    const eventsResponse = makeAuthenticatedRequest('GET', '/events?page=1&limit=1', null, authToken);
    if (eventsResponse.status === 200) {
      const eventsData = JSON.parse(eventsResponse.body);
      if (eventsData.data && eventsData.data.length > 0) {
        testEventId = eventsData.data[0].id;
      }
    }
  }

  return { authToken, testEventId };
}

export default function(data) {
  const token = data.authToken;
  const eventId = data.testEventId || '1';

  // Test 1: First request (cache miss) - should be slower
  const firstResponse = makeAuthenticatedRequest('GET', `/events/${eventId}`, null, token);
  checkResponse(firstResponse, {
    'first request (cache miss) status is 200': (r) => r.status === 200,
    'first request (cache miss) < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 2: Second request (cache hit) - should be faster
  const secondResponse = makeAuthenticatedRequest('GET', `/events/${eventId}`, null, token);
  checkResponse(secondResponse, {
    'second request (cache hit) status is 200': (r) => r.status === 200,
    'second request (cache hit) < 50ms': (r) => r.timings.duration < 50,
    'cache hit faster than cache miss': (r) => r.timings.duration < firstResponse.timings.duration,
  });

  // Test 3: Third request (cache hit) - should be consistently fast
  const thirdResponse = makeAuthenticatedRequest('GET', `/events/${eventId}`, null, token);
  checkResponse(thirdResponse, {
    'third request (cache hit) status is 200': (r) => r.status === 200,
    'third request (cache hit) < 50ms': (r) => r.timings.duration < 50,
  });

  // Test 4: Different endpoint - cache miss
  const differentResponse = makeAuthenticatedRequest('GET', '/events/2', null, token);
  checkResponse(differentResponse, {
    'different endpoint (cache miss) status is 200': (r) => r.status === 200,
    'different endpoint (cache miss) < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 5: Repeated access to same endpoint
  for (let i = 0; i < 5; i++) {
    const repeatedResponse = makeAuthenticatedRequest('GET', `/events/${eventId}`, null, token);
    const requestNum = i + 1;
    checkResponse(repeatedResponse, {
      ['repeated request ' + requestNum + ' (cache hit) status is 200']: (r) => r.status === 200,
      ['repeated request ' + requestNum + ' (cache hit) < 50ms']: (r) => r.timings.duration < 50,
    });
  }

  sleep(0.05);
}

export function teardown(data) {
  console.log('Teardown: Cache effectiveness test completed');
}
