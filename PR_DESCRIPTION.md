# Backend Fixes: Competition Brackets, Account Deletion, Notifications, and Export Status

This PR addresses four backend issues related to competition bracket generation, account deletion cascade, notification delivery, and export status polling.

## Changes

### Task #1836: Competition Bracket Generation for Odd Participant Counts

**File:** `backend/src/competitions/competitions.service.spec.ts`

**Changes:**
- Added test to verify bracket generation with exactly one bye for 5 participants
- Added test to verify bracket generation with zero byes for power-of-two participant count (8)
- Tests confirm that bye recipients automatically advance as winners without manual result submission

**Acceptance Criteria:**
- ✅ `generateBracket` with 5 participants produces a valid bracket with exactly one first-round bye
- ✅ The bye-recipient participant advances to round 2 without a submitted match result
- ✅ `generateBracket` with a power-of-two participant count (e.g., 8) produces a bracket with zero byes

---

### Task #1833: Account Deletion Cascade to Dependent Records

**Files:**
- `backend/src/account/account.service.ts`
- `backend/src/account/account.service.spec.ts`

**Changes:**
- Enhanced `deleteAccount` to explicitly delete all dependent records within the same transaction:
  - Bookmarks (`user_bookmarks`)
  - Follows (both as follower and following in `user_follows`)
  - API keys (`api_keys`)
  - Notification preferences (`notification_preferences`)
- Added idempotency check: if account is already deleted (deleted_at is set), return without error
- Added comprehensive test coverage for:
  - Deletion of all dependent records within transaction
  - Idempotency when called twice for the same account
  - Transaction rollback on failure

**Acceptance Criteria:**
- ✅ `deleteAccount` removes the user's bookmarks, follows, and API keys within the same transaction
- ✅ `deleteAccount` for an already-deleted address does not throw an unhandled error
- ✅ A failure partway through `deleteAccount` rolls back rather than leaving a partially-deleted account

---

### Task #1837: Competition Cancellation Notification Delivery to All Participants

**File:** `backend/src/competitions/competitions.service.spec.ts`

**Changes:**
- Added test to verify exactly one notification is sent per currently-joined participant
- Added test to verify participants who left before cancellation do not receive notifications
- Existing implementation already correctly queries the current participant list at cancellation time

**Acceptance Criteria:**
- ✅ `notifyParticipantsOfCancellation` sends exactly one notification per currently-joined participant
- ✅ A participant removed via `leave()` before cancellation does not receive a cancellation notification
- ✅ `cancel()` on an already-cancelled competition does not re-trigger notifications a second time (existing behavior via ConflictException)

---

### Task #1834: Account Export Status Polling for a Nonexistent Request

**File:** `backend/src/account/account.service.spec.ts`

**Changes:**
- Added test to verify `getExportStatus` returns not-found for random/nonexistent request IDs
- Added test to verify `getExportStatus` rejects requests for valid job IDs belonging to different users
- Added test to verify `getExportStatus` returns correct status for valid in-progress requests of the caller
- Existing implementation already correctly validates user ownership via `job.user_id !== userId` check

**Acceptance Criteria:**
- ✅ `getExportStatus` for a random/nonexistent request ID returns not-found, not a thrown 500
- ✅ `getExportStatus` for a valid request ID belonging to a different user is rejected/hidden
- ✅ `getExportStatus` for a valid, in-progress request of the caller's own returns the correct in-progress state

---

## Testing

All changes include comprehensive unit test coverage. The existing service implementations were already correct for tasks #1837 and #1834, so only test coverage was added to enforce the behavior. Tasks #1833 and #1836 required both implementation improvements and test coverage.

## Checklist

- [x] Code follows project style guidelines
- [x] Tests added/updated for all changes
- [x] No breaking changes to existing APIs
- [x] Transaction safety ensured for account deletion
- [x] Idempotency ensured for account deletion

Closes #1836, #1833, #1837, #1834
