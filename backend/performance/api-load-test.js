import { makeAuthenticatedRequest, checkResponse } from './k6-config.js';

// Test data
const TEST_USER = {
  email: 'perf-test@example.com',
  password: 'TestPassword123!',
};

let authToken = null;

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
  } else {
    console.error('Setup: Failed to obtain auth token');
  }

  return { authToken };
}

export default function(data) {
  const token = data.authToken;

  // Test 1: Health check endpoint
  const healthResponse = makeAuthenticatedRequest('GET', '/health');
  checkResponse(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
  });

  // Test 2: Get events list
  const eventsResponse = makeAuthenticatedRequest('GET', '/events?page=1&limit=10', null, token);
  checkResponse(eventsResponse, {
    'events list status is 200': (r) => r.status === 200,
    'events list response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 3: Get single event
  if (eventsResponse.status === 200) {
    const eventsData = JSON.parse(eventsResponse.body);
    if (eventsData.data && eventsData.data.length > 0) {
      const eventId = eventsData.data[0].id;
      const eventResponse = makeAuthenticatedRequest('GET', `/events/${eventId}`, null, token);
      checkResponse(eventResponse, {
        'single event status is 200': (r) => r.status === 200,
        'single event response time < 150ms': (r) => r.timings.duration < 150,
      });
    }
  }

  // Test 4: Get matches for event
  if (eventsResponse.status === 200) {
    const eventsData = JSON.parse(eventsResponse.body);
    if (eventsData.data && eventsData.data.length > 0) {
      const eventId = eventsData.data[0].id;
      const matchesResponse = makeAuthenticatedRequest('GET', `/events/${eventId}/matches`, null, token);
      checkResponse(matchesResponse, {
        'matches list status is 200': (r) => r.status === 200,
        'matches list response time < 200ms': (r) => r.timings.duration < 200,
      });
    }
  }

  // Test 5: Get user profile
  const profileResponse = makeAuthenticatedRequest('GET', '/users/profile', null, token);
  checkResponse(profileResponse, {
    'user profile status is 200': (r) => r.status === 200,
    'user profile response time < 150ms': (r) => r.timings.duration < 150,
  });

  // Test 6: Get notifications
  const notificationsResponse = makeAuthenticatedRequest('GET', '/notifications?page=1&limit=10', null, token);
  checkResponse(notificationsResponse, {
    'notifications list status is 200': (r) => r.status === 200,
    'notifications list response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Small delay between iterations
  sleep(0.1);
}

export function teardown(data) {
  console.log('Teardown: Performance test completed');
}
