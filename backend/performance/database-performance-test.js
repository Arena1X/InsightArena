import { makeAuthenticatedRequest, checkResponse } from './k6-config.js';

// Test data
const TEST_USER = {
  email: 'perf-test@example.com',
  password: 'TestPassword123!',
};

let authToken = null;
let testEventId = null;
let testMatchId = null;

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

  return { authToken };
}

export default function(data) {
  const token = data.authToken;

  // Test 1: Simple query - Get single event by ID
  const eventResponse = makeAuthenticatedRequest('GET', `/events/${testEventId || '1'}`, null, token);
  checkResponse(eventResponse, {
    'single event query status is 200': (r) => r.status === 200,
    'single event query < 100ms': (r) => r.timings.duration < 100,
  });

  // Test 2: Paginated query - Get events with pagination
  const paginatedEventsResponse = makeAuthenticatedRequest('GET', '/events?page=1&limit=50', null, token);
  checkResponse(paginatedEventsResponse, {
    'paginated events query status is 200': (r) => r.status === 200,
    'paginated events query < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 3: Filtered query - Get events with filters
  const filteredEventsResponse = makeAuthenticatedRequest('GET', '/events?status=active&page=1&limit=20', null, token);
  checkResponse(filteredEventsResponse, {
    'filtered events query status is 200': (r) => r.status === 200,
    'filtered events query < 250ms': (r) => r.timings.duration < 250,
  });

  // Test 4: Join query - Get event with matches
  if (testEventId) {
    const eventMatchesResponse = makeAuthenticatedRequest('GET', `/events/${testEventId}/matches`, null, token);
    checkResponse(eventMatchesResponse, {
      'event matches join query status is 200': (r) => r.status === 200,
      'event matches join query < 300ms': (r) => r.timings.duration < 300,
    });
  }

  // Test 5: Aggregation query - Get user statistics
  const statsResponse = makeAuthenticatedRequest('GET', '/users/statistics', null, token);
  checkResponse(statsResponse, {
    'user statistics query status is 200': (r) => r.status === 200,
    'user statistics query < 300ms': (r) => r.timings.duration < 300,
  });

  // Test 6: Complex query - Get submissions with filters and date range
  const submissionsResponse = makeAuthenticatedRequest('GET', '/oracle/submissions?status=submitted&dateFrom=2024-01-01T00:00:00Z&page=1&limit=50', null, token);
  checkResponse(submissionsResponse, {
    'complex submissions query status is 200': (r) => r.status === 200,
    'complex submissions query < 400ms': (r) => r.timings.duration < 400,
  });

  sleep(0.1);
}

export function teardown(data) {
  console.log('Teardown: Database performance test completed');
}
