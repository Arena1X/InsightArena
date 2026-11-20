import { makeAuthenticatedRequest, checkResponse } from './k6-config.js';

// Test data
const ORACLE_API_KEY = __ENV.ORACLE_API_KEY || 'test-oracle-api-key';
const MIN_QUORUM = __ENV.ORACLE_MIN_QUORUM || '3';

export default function() {
  // Test 1: Get pending matches (oracle endpoint)
  const pendingMatchesResponse = makeAuthenticatedRequest('GET', '/oracle/pending-matches?page=1&limit=20', null, null);
  checkResponse(pendingMatchesResponse, {
    'pending matches status is 200': (r) => r.status === 200,
    'pending matches response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 2: Get submission history
  const submissionsResponse = makeAuthenticatedRequest('GET', '/oracle/submissions?page=1&limit=20', null, null);
  checkResponse(submissionsResponse, {
    'submissions history status is 200': (r) => r.status === 200,
    'submissions history response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 3: Filter submissions by status
  const filteredSubmissionsResponse = makeAuthenticatedRequest('GET', '/oracle/submissions?status=submitted&page=1&limit=20', null, null);
  checkResponse(filteredSubmissionsResponse, {
    'filtered submissions status is 200': (r) => r.status === 200,
    'filtered submissions response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 4: Finalize with quorum (should succeed when quorum is met)
  const finalizeQuorumResponse = makeAuthenticatedRequest('POST', '/oracle/finalize', {
    match_id: 'test-match-quorum',
    min_quorum: MIN_QUORUM,
  }, null);
  checkResponse(finalizeQuorumResponse, {
    'finalize with quorum status is 200': (r) => r.status === 200,
    'finalize with quorum response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test 5: Finalize below quorum (should revert with QuorumNotMet)
  const finalizeBelowQuorumResponse = makeAuthenticatedRequest('POST', '/oracle/finalize', {
    match_id: 'test-match-below-quorum',
    min_quorum: '999',
  }, null);
  checkResponse(finalizeBelowQuorumResponse, {
    'finalize below quorum reverts': (r) => r.status === 400 || r.status === 409,
    'finalize below quorum response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Small delay between iterations
  sleep(0.1);
}
