# Frontend Issues & Feature Gaps

**Last Updated**: June 2026  
**Status**: Active Development  
**Priority**: High

---

## 🔴 CRITICAL ISSUES (Must Fix)

### Issue #1: Wallet Connection Redirects to Dashboard Instead of Staying on Landing Page

**Severity**: CRITICAL  
**Status**: Open  
**Component**: `WalletContext.tsx`, `Header.tsx`  
**Affected Users**: All new users

**Description**:
When a user connects their wallet from the landing page, they are immediately redirected to `/dashboard`. The expected behavior is to stay on the landing page until the user explicitly clicks on "Profile" or navigates to an authenticated route.

**Current Behavior**:

```typescript
// In WalletContext.tsx line 145
const handleModalSuccess = useCallback(
  (walletAddress: string, _jwt: string) => {
    setAddress(walletAddress);
    setToken(`wallet_${walletAddress}`);
    setUser({ username: "Alex" });
    setAuthError(null);
    setIsConnectModalOpen(false);
    router.push("/dashboard"); // ❌ PROBLEM: Always redirects
  },
  [router],
);
```

**Expected Behavior**:

- User connects wallet on landing page → stays on landing page
- User connects wallet on any public page → stays on that page
- User connects wallet on authenticated page → redirects to that page
- User can then navigate to dashboard/profile via header menu

**Root Cause**:
The `handleModalSuccess` callback always redirects to `/dashboard` regardless of where the user initiated the connection.

**Solution**:

1. Track the current pathname when modal opens
2. Only redirect if user was on an authenticated route
3. Otherwise, just close the modal and stay on current page

**Files to Modify**:

- `src/context/WalletContext.tsx`
- `src/component/Header.tsx` (optional: add visual feedback)

**Acceptance Criteria**:

- [ ] User connects wallet on `/` → stays on `/`
- [ ] User connects wallet on `/events` → stays on `/events`
- [ ] User connects wallet on `/dashboard` → stays on `/dashboard`
- [ ] Header shows connected wallet status
- [ ] User can navigate to authenticated routes via header menu

---

### Issue #2: Hardcoded Admin Allowlist in Frontend (Security Issue)

**Severity**: CRITICAL  
**Status**: Open  
**Component**: `src/component/admin/AdminGuard.tsx`  
**Security Risk**: High

**Description**:
Admin access control is hardcoded in the frontend with a single wallet address. This is a security vulnerability because:

1. Admin addresses are exposed in client-side code
2. Cannot dynamically add/remove admins without code changes
3. No backend validation of admin status
4. Easy to bypass by modifying client code

**Current Code**:

```typescript
const ADMIN_ALLOWLIST = new Set([
  "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
]);
```

**Solution**:

1. Move admin role management to backend
2. Add `role` field to user profile (admin, creator, user)
3. Fetch user role from backend after authentication
4. Validate admin status server-side for all admin endpoints
5. Remove frontend allowlist

**Files to Modify**:

- `src/component/admin/AdminGuard.tsx` (remove allowlist)
- `src/context/WalletContext.tsx` (add role to user object)
- Backend: Add role-based access control

**Acceptance Criteria**:

- [ ] Admin role fetched from backend
- [ ] Frontend allowlist removed
- [ ] Admin pages protected by backend validation
- [ ] Admins can be managed via admin dashboard

---

### Issue #3: Incomplete Claim Logic - Rewards Page

**Severity**: CRITICAL  
**Status**: Open  
**Component**: `src/app/(authenticated)/rewards/page.tsx`  
**Impact**: Users cannot claim pending rewards

**Description**:
The "Claim All Rewards" button has no implementation. It only logs to console.

**Current Code** (line 172):

```typescript
const handleClaimAll = () => {
  console.log("Claiming all pending rewards");
  // TODO: Implement actual claim logic
};
```

**Solution**:

1. Create backend API endpoint: `POST /api/rewards/claim`
2. Implement claim logic with transaction handling
3. Add loading state and error handling
4. Show success toast notification
5. Refresh rewards list after claim

**Files to Modify**:

- `src/app/(authenticated)/rewards/page.tsx`
- Backend: Create claim endpoint

**Acceptance Criteria**:

- [ ] Claim button shows loading state
- [ ] API call to backend succeeds
- [ ] Rewards list updates after claim
- [ ] Success notification shown
- [ ] Error handling for failed claims

---

### Issue #4: Incomplete Claim Logic - My Predictions Page

**Severity**: CRITICAL  
**Status**: Open  
**Component**: `src/app/(authenticated)/my-predictions/page.tsx`  
**Impact**: Users cannot claim prediction payouts

**Description**:
The "Claim Payout" button has no implementation. It only logs to console.

**Current Code** (line 202):

```typescript
const handleClaimPayout = (predictionId: string) => {
  console.log("Claiming payout for prediction:", predictionId);
  // TODO: Implement actual claim logic
};
```

**Solution**:

1. Create backend API endpoint: `POST /api/predictions/:id/claim`
2. Implement payout calculation and transfer
3. Add loading state and error handling
4. Show success toast notification
5. Update prediction status to "claimed"

**Files to Modify**:

- `src/app/(authenticated)/my-predictions/page.tsx`
- Backend: Create claim endpoint

**Acceptance Criteria**:

- [ ] Claim button shows loading state
- [ ] API call to backend succeeds
- [ ] Prediction status updates to "claimed"
- [ ] Success notification shown
- [ ] Error handling for failed claims

---

## 🟠 HIGH PRIORITY ISSUES

### Issue #5: No Real Backend Integration for Rewards

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/(authenticated)/rewards/page.tsx`  
**Impact**: All reward data is mocked

**Description**:
The rewards page uses hardcoded mock data instead of fetching from backend. No API integration exists.

**Mock Data**:

```typescript
const MOCK_ENTRIES = [
  { id: "1", title: "First Prediction", points: 100, date: "2026-01-15" },
  // ... more mock entries
];
```

**Missing APIs**:

- `GET /api/rewards/history` - Fetch reward history
- `GET /api/rewards/pending` - Fetch pending rewards
- `GET /api/achievements` - Fetch user achievements
- `POST /api/rewards/claim` - Claim rewards

**Solution**:

1. Create API service layer in `src/services/api.ts`
2. Implement data fetching with error handling
3. Add loading and error states
4. Cache data appropriately

**Files to Modify**:

- `src/app/(authenticated)/rewards/page.tsx`
- `src/services/api.ts` (create)
- Backend: Create reward endpoints

---

### Issue #6: No Real Backend Integration for Predictions

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/(authenticated)/my-predictions/page.tsx`  
**Impact**: All prediction data is mocked

**Description**:
The my-predictions page uses hardcoded mock data instead of fetching from backend.

**Missing APIs**:

- `GET /api/predictions` - Fetch user predictions
- `GET /api/predictions?status=pending` - Filter by status
- `GET /api/predictions?sort=date` - Sort predictions
- `POST /api/predictions/:id/claim` - Claim payout

**Solution**:

1. Implement data fetching from backend
2. Add filtering and sorting
3. Add pagination for large datasets
4. Add loading and error states

---

### Issue #7: Placeholder User Data in Profile Page

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/(authenticated)/profile/page.tsx`  
**Impact**: Users see fake profile information

**Description**:
Profile page uses hardcoded placeholder data instead of fetching real user data.

**Current Code** (lines 22-26):

```typescript
const USER = {
  username: "You_Arena",
  stellarAddress: "GBXXX...4FD1C5ABCDE",
  joinDate: "January 2026",
  tier: "Gold",
};
```

**Solution**:

1. Fetch user profile from backend: `GET /api/users/profile`
2. Display real user data
3. Add edit profile functionality
4. Add loading and error states

---

### Issue #8: Admin Dashboard - Toggles Not Wired

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/admin/dashboard/page.tsx`  
**Impact**: Admin features don't persist

**Description**:
Announcement and maintenance mode toggles work locally but don't call backend API.

**Missing APIs**:

- `POST /api/admin/announcements` - Create/update announcement
- `POST /api/admin/maintenance` - Toggle maintenance mode
- `GET /api/admin/status` - Fetch current status

**Solution**:

1. Create backend endpoints for admin settings
2. Wire up toggle handlers to API calls
3. Add loading states
4. Show success/error notifications

---

### Issue #9: Admin Users - Ban/Unban Not Wired

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/admin/users/page.tsx`  
**Impact**: User moderation doesn't work

**Description**:
Ban/Unban buttons toggle locally but don't call backend API.

**Missing API**:

- `POST /api/admin/users/:id/ban` - Ban user
- `POST /api/admin/users/:id/unban` - Unban user

**Solution**:

1. Create backend endpoints for user moderation
2. Wire up buttons to API calls
3. Add confirmation dialogs
4. Show success/error notifications

---

### Issue #10: Admin Fees - Save Not Wired

**Severity**: HIGH  
**Status**: Open  
**Component**: `src/app/admin/fees/page.tsx`  
**Impact**: Fee configuration doesn't persist

**Description**:
Fee form submission shows alert but doesn't persist to backend.

**Missing API**:

- `POST /api/admin/fees` - Update fee configuration
- `GET /api/admin/fees` - Fetch current fees

**Solution**:

1. Create backend endpoints for fee management
2. Wire up form submission to API
3. Add validation
4. Show success/error notifications

---

## 🟡 MEDIUM PRIORITY ISSUES

### Issue #11: Missing Creator Events Detail Page

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/app/(authenticated)/creator-events/page.tsx`  
**Impact**: Cannot view event details

**Description**:
EventCard has `onViewDetails` callback but no detail page exists at `/creator-events/[id]`.

**Solution**:

1. Create `src/app/(authenticated)/creator-events/[id]/page.tsx`
2. Fetch event details from backend
3. Display event information, participants, results
4. Add edit/delete functionality for creator

---

### Issue #12: Competitions - Create Feature Not Wired

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/app/(authenticated)/competitions/page.tsx`  
**Impact**: Cannot create competitions

**Description**:
"Create Competition" button opens modal but doesn't persist to backend.

**Missing API**:

- `POST /api/competitions` - Create competition
- `GET /api/competitions` - Fetch competitions

**Solution**:

1. Create backend endpoints
2. Wire up form submission
3. Add validation
4. Redirect to competition detail page after creation

---

### Issue #13: Markets - Create Feature Not Wired

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/app/(authenticated)/my-markets/page.tsx`  
**Impact**: Cannot create markets

**Description**:
"+ Create Market" button has no implementation.

**Missing API**:

- `POST /api/markets` - Create market
- `GET /api/markets` - Fetch markets

**Solution**:

1. Create backend endpoints
2. Implement market creation flow
3. Add form validation
4. Redirect to market detail page

---

### Issue #14: Settings - No Persistence

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/app/(authenticated)/settings/page.tsx`  
**Impact**: Settings changes don't save

**Description**:
All form changes are local state only, no backend save.

**Missing APIs**:

- `POST /api/users/profile` - Update profile
- `POST /api/users/preferences` - Update notification preferences
- `POST /api/users/privacy` - Update privacy settings

**Solution**:

1. Create backend endpoints
2. Wire up form submissions
3. Add validation
4. Show success/error notifications

---

### Issue #15: Wallet Page - Export Feature Disabled

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/app/(authenticated)/wallet/page.tsx`  
**Impact**: Cannot export transaction history

**Description**:
"Export Transaction History" button is disabled with no implementation.

**Solution**:

1. Implement CSV export functionality
2. Add date range filtering
3. Generate downloadable file
4. Show success notification

---

### Issue #16: Weak Authentication Flow

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/context/WalletContext.tsx`  
**Impact**: No real security

**Description**:
Mock JWT generation with no real backend validation.

**Current Code** (line 110):

```typescript
setToken(`mock_jwt_${btoa(signature).slice(0, 24)}`);
```

**Solution**:

1. Implement real JWT generation on backend
2. Validate signature server-side
3. Return real JWT token
4. Add token refresh mechanism
5. Validate token on protected endpoints

---

### Issue #17: No Token Refresh Mechanism

**Severity**: MEDIUM  
**Status**: Open  
**Component**: `src/context/WalletContext.tsx`  
**Impact**: Tokens don't refresh, sessions expire

**Description**:
No token refresh or expiration handling.

**Solution**:

1. Implement refresh token endpoint on backend
2. Add token expiration checking
3. Automatically refresh before expiration
4. Handle refresh failures gracefully

---

### Issue #18: No Loading States for Async Operations

**Severity**: MEDIUM  
**Status**: Open  
**Component**: Multiple pages  
**Impact**: Poor UX, unclear if action is processing

**Description**:
Claim buttons and other async operations don't show loading state or success feedback.

**Solution**:

1. Add loading state to all async buttons
2. Disable button while loading
3. Show spinner or loading text
4. Add success/error toast notifications

---

### Issue #19: No Error Handling

**Severity**: MEDIUM  
**Status**: Open  
**Component**: Multiple pages  
**Impact**: Failed operations show no feedback

**Description**:
No error boundaries or error states for failed API calls.

**Solution**:

1. Create error boundary component
2. Add error states to all pages
3. Show error messages to users
4. Add retry functionality

---

### Issue #20: No Real-time Updates

**Severity**: MEDIUM  
**Status**: Open  
**Component**: Market pages  
**Impact**: Market data is stale

**Description**:
No WebSocket or polling for live market data.

**Solution**:

1. Implement WebSocket connection for live updates
2. Or implement polling with appropriate intervals
3. Update market prices in real-time
4. Show live match results

---

## 🔵 LOW PRIORITY ISSUES

### Issue #21: Placeholder Contract IDs

**Severity**: LOW  
**Status**: Open  
**Component**: `src/app/contracts/page.tsx`  
**Impact**: Users see incomplete information

**Description**:
Contract addresses shown as `CXXXXXXX...` placeholders.

**Solution**:

1. Replace with actual contract addresses
2. Add links to contract explorers
3. Display contract details

---

### Issue #22: Incomplete Privacy Policy

**Severity**: LOW  
**Status**: Open  
**Component**: `src/app/privacy/page.tsx`  
**Impact**: Legal/compliance concern

**Description**:
References "incomplete data" in privacy rights section.

**Solution**:

1. Complete privacy policy text
2. Add data retention policies
3. Add GDPR compliance information

---

### Issue #23: No Search Functionality

**Severity**: LOW  
**Status**: Open  
**Component**: Multiple pages  
**Impact**: Users cannot search

**Description**:
Search inputs exist but don't actually search.

**Missing API**:

- `GET /api/search?q=query` - Search across platform

**Solution**:

1. Create backend search endpoint
2. Implement search UI with debouncing
3. Show search results
4. Add filters

---

### Issue #24: No Notification System

**Severity**: LOW  
**Status**: Open  
**Component**: Header  
**Impact**: Users miss important updates

**Description**:
Notification preferences exist but no notification UI.

**Solution**:

1. Create notification center component
2. Add bell icon with unread count
3. Show notification list
4. Add notification preferences

---

### Issue #25: No Referral System UI

**Severity**: LOW  
**Status**: Open  
**Component**: Rewards page  
**Impact**: Referral feature not accessible

**Description**:
Referral bonus mentioned in rewards but no referral page.

**Solution**:

1. Create referral page
2. Generate referral links
3. Show referral stats
4. Track referral rewards

---

### Issue #26: Inconsistent Navigation Structure

**Severity**: LOW  
**Status**: Open  
**Component**: Header, Navigation  
**Impact**: User confusion

**Description**:
Public pages (`/markets`, `/events`) and authenticated versions (`/my-markets`, `/leaderboards`) exist but unclear which to use.

**Solution**:

1. Clarify navigation structure
2. Update header links based on auth state
3. Add breadcrumbs
4. Improve navigation documentation

---

### Issue #27: Extensive Mock Data Throughout

**Severity**: LOW  
**Status**: Open  
**Component**: Multiple pages  
**Impact**: No real data flows through app

**Description**:
All pages use hardcoded mock data instead of API calls.

**Affected Pages**:

- `/my-predictions` - MOCK_PREDICTIONS
- `/rewards` - MOCK_ENTRIES, ACHIEVEMENTS
- `/wallet` - TRANSACTIONS
- `/competitions` - eventData
- `/my-markets` - PLACEHOLDER_MARKETS

**Solution**:

1. Replace all mock data with API calls
2. Implement proper data fetching
3. Add loading and error states

---

## 📋 SUMMARY TABLE

| #   | Issue                                | Severity | Status | Component           | Est. Effort |
| --- | ------------------------------------ | -------- | ------ | ------------------- | ----------- |
| 1   | Wallet redirect to dashboard         | CRITICAL | Open   | WalletContext       | 2h          |
| 2   | Hardcoded admin allowlist            | CRITICAL | Open   | AdminGuard          | 4h          |
| 3   | Incomplete claim logic (rewards)     | CRITICAL | Open   | rewards/page        | 3h          |
| 4   | Incomplete claim logic (predictions) | CRITICAL | Open   | my-predictions/page | 3h          |
| 5   | No backend integration (rewards)     | HIGH     | Open   | rewards/page        | 6h          |
| 6   | No backend integration (predictions) | HIGH     | Open   | my-predictions/page | 6h          |
| 7   | Placeholder user data                | HIGH     | Open   | profile/page        | 3h          |
| 8   | Admin dashboard toggles              | HIGH     | Open   | admin/dashboard     | 4h          |
| 9   | Admin users ban/unban                | HIGH     | Open   | admin/users         | 4h          |
| 10  | Admin fees save                      | HIGH     | Open   | admin/fees          | 4h          |
| 11  | Missing event detail page            | MEDIUM   | Open   | creator-events      | 4h          |
| 12  | Competitions create                  | MEDIUM   | Open   | competitions        | 5h          |
| 13  | Markets create                       | MEDIUM   | Open   | my-markets          | 5h          |
| 14  | Settings persistence                 | MEDIUM   | Open   | settings            | 5h          |
| 15  | Wallet export                        | MEDIUM   | Open   | wallet              | 3h          |
| 16  | Weak auth flow                       | MEDIUM   | Open   | WalletContext       | 6h          |
| 17  | No token refresh                     | MEDIUM   | Open   | WalletContext       | 4h          |
| 18  | No loading states                    | MEDIUM   | Open   | Multiple            | 8h          |
| 19  | No error handling                    | MEDIUM   | Open   | Multiple            | 8h          |
| 20  | No real-time updates                 | MEDIUM   | Open   | Markets             | 8h          |
| 21  | Placeholder contracts                | LOW      | Open   | contracts/page      | 1h          |
| 22  | Incomplete privacy policy            | LOW      | Open   | privacy/page        | 2h          |
| 23  | No search functionality              | LOW      | Open   | Multiple            | 6h          |
| 24  | No notification system               | LOW      | Open   | Header              | 6h          |
| 25  | No referral UI                       | LOW      | Open   | rewards             | 4h          |
| 26  | Inconsistent navigation              | LOW      | Open   | Header              | 2h          |
| 27  | Extensive mock data                  | LOW      | Open   | Multiple            | 20h         |

---

## 🎯 RECOMMENDED FIX ORDER

### Phase 1: Critical Fixes (Week 1)

1. Fix wallet redirect issue (#1)
2. Move admin allowlist to backend (#2)
3. Implement claim logic for rewards (#3)
4. Implement claim logic for predictions (#4)

### Phase 2: Backend Integration (Week 2-3)

5. Integrate rewards API (#5)
6. Integrate predictions API (#6)
7. Integrate user profile API (#7)
8. Wire up admin features (#8, #9, #10)

### Phase 3: UX Improvements (Week 4)

9. Add loading states (#18)
10. Add error handling (#19)
11. Add token refresh (#17)
12. Improve auth flow (#16)

### Phase 4: Feature Completion (Week 5+)

13. Create missing pages (#11)
14. Wire up create features (#12, #13)
15. Implement settings persistence (#14)
16. Add real-time updates (#20)

---

## 📝 NOTES

- All issues should be created as GitHub issues for team members to work on
- Each issue should have acceptance criteria and test cases
- Backend API endpoints should be documented in API_REFERENCE.md
- Frontend changes should follow existing code style and patterns
- All async operations should include loading and error states
- All user-facing changes should include success notifications
