# Implementation Plan: Optimistic UI for Notifications Mark-All-Read (Issue #2000)

## Exploration Summary

The codebase already has a well-established pattern for optimistic UI with rollback. Found:
- **NotificationsCard component**: Located at `frontend/src/component/NotificationsCard.tsx`. Contains mock data and state management for notifications with a `handleMarkAllRead` function that currently does nothing (placeholder for API integration).
- **Unread badge**: Located in `frontend/src/component/header/UserWalletControls.tsx` — a pulsing orange badge on the Bell icon that shows all notifications are unread.
- **Optimistic update pattern**: Examined `useOptimisticPrediction.ts` hook which provides a proven pattern: save previous state before mutation, update UI optimistically, restore on error.
- **Test framework**: Vitest with React Testing Library. Test files use `.test.tsx` extension. Test pattern follows: render, fireEvent, verify.
- **API client**: Uses `apiClient` from `frontend/src/lib/api.ts` with automatic retry for GET, single attempt for POST/PATCH/DELETE.

**Key findings**:
1. No mark-all-read API endpoint exists yet in the API client—will be integrated once backend adds it.
2. NotificationsCard is used on the dashboard and needs to update notifications state.
3. The unread badge in UserWalletControls uses a hardcoded pulsing animation—it doesn't pull unread count from shared state.
4. No global notification context exists yet; state is currently local to NotificationsCard.

## Design Decisions

1. **State Management**: Create a `NotificationContext` to hold notifications and unread count. This allows the unread badge (in UserWalletControls, which cannot access local component state) to stay synchronized. A context is lighter than Redux and matches the codebase's existing pattern (WalletContext, ThemeContext, etc.).

2. **Optimistic Update Pattern**: Save previous notifications before mutating. Mark all as read optimistically. On API failure, restore previous state and show error. Follows the proven `useOptimisticPrediction` pattern.

3. **Unread Badge Logic**: The unread badge should only render when `unreadCount > 0`. Add a `useNotifications` hook that consumers call to read unread count. Update UserWalletControls to use this hook and conditionally render the badge.

4. **API Integration Point**: Add `markAllNotificationsAsRead()` to `api.ts`. Once the backend adds the endpoint, the hook will call `apiClient.post()`. For now, it resolves immediately (placeholder).

5. **Test Coverage**: Three tests per the requirements:
   - Mark-all-read updates UI immediately (optimistic).
   - Failed request rolls back the read state.
   - Unread badge updates in sync (via context).

## Implementation Steps

### 1. Create NotificationContext
**What**: Create a React Context to manage notification state globally so both NotificationsCard and the unread badge can consume it.

**Files to create**: `frontend/src/context/NotificationContext.tsx`

**Details**:
- Export `NotificationContext` and `NotificationProvider`.
- State: `notifications` (array), `unreadCount` (derived from notifications where `isRead === false`).
- Provide actions: `setNotifications()` (full array replacement), `updateNotification()` (single item by id), `markAllAsRead()` (optimistic action with rollback on error).
- `markAllAsRead()` should:
  - Save current notifications before mutation.
  - Set all notifications to `isRead: true` optimistically.
  - Call the API endpoint.
  - On error, restore previous notifications and throw the error.
- Export a `useNotifications()` hook that returns `{ notifications, unreadCount, markAllAsRead }`.

**Verify**: Manually check file exists and exports are correct. No tests needed for context itself.

---

### 2. Add markAllNotificationsAsRead to API client
**What**: Add API function to `frontend/src/lib/api.ts` for the mark-all-read endpoint.

**Files to modify**: `frontend/src/lib/api.ts`

**Details**:
- Add function: `async function markAllNotificationsAsRead(options?: ApiOptions): Promise<void>`
- Call `apiClient.post('/api/notifications/mark-all-read', undefined, options)`.
- For now, the endpoint doesn't exist on the backend, so the call will fail. But structure it correctly so it works once the backend adds it. Add a comment explaining the integration point.

**Verify**: Grep for the function name and confirm it's exported.

---

### 3. Update NotificationsCard to use NotificationContext
**What**: Replace local notification state with context. Use the context's `markAllAsRead()` action for the button.

**Files to modify**: `frontend/src/component/NotificationsCard.tsx`

**Details**:
- Import `useNotifications` from the context.
- Remove local `useState` for notifications; fetch from context instead.
- Remove the local `handleMarkAllRead` function; call `markAllAsRead()` from context directly.
- Keep the `activeCategory` tab state local (it's UI-only, doesn't need to be global).
- Keep the `markAllError` state local (it's a transient error message for this component).
- When `markAllAsRead()` rejects, catch the error and set `markAllError` to display the error message.
- Restructure the error display and button handler to work with the context action.

**Verify**: Run tests for NotificationsCard. Existing tests should pass or be updated to use the context.

---

### 4. Update UserWalletControls to show unread badge from context
**What**: Connect the unread badge to the actual unread count from NotificationContext, not just a static pulsing animation.

**Files to modify**: `frontend/src/component/header/UserWalletControls.tsx`

**Details**:
- Import `useNotifications` hook.
- Call it to get `unreadCount`.
- Render the badge only when `unreadCount > 0`. Change the text to show the count if feasible, or keep the pulsing dot but at least make it conditional.
- Current badge jsx: show count or keep animated dot; if count > 0, show the badge.

**Verify**: Manual verification that the badge disappears when unread count is 0 (after mark-all-read succeeds). Or write a simple integration test.

---

### 5. Wrap the app with NotificationProvider
**What**: Initialize the context provider at the app layout level so it's available to all components.

**Files to modify**: `frontend/src/app/layout.tsx`

**Details**:
- Import `NotificationProvider` from the context.
- Wrap the existing content (or a subtree) with `<NotificationProvider>`.
- The provider should load initial notifications on mount (for now, use mock data; once the backend adds a GET endpoint, fetch real data).

**Verify**: Check that the layout still renders and the provider is present.

---

### 6. Create tests for optimistic mark-all-read
**What**: Write three tests covering the required scenarios: optimistic update, rollback on failure, and unread badge sync.

**Files to create**: `frontend/src/component/NotificationsCard.optimistic.test.tsx` (or extend the existing test file)

**Details**:
- **Test 1: Mark-all-read updates UI immediately**
  - Render NotificationsCard (which consumes NotificationContext).
  - Verify unread count is > 0.
  - Click "Mark all as read".
  - Verify UI updates immediately: button disappears, unread badge gone, all notifications show `isRead: true`.
  - No need to wait for API (it's optimistic).

- **Test 2: Failed request rolls back the read state**
  - Mock `markAllNotificationsAsRead()` to reject with an error.
  - Render NotificationsCard.
  - Click "Mark all as read".
  - Verify UI was updated optimistically.
  - Wait for the API call to fail.
  - Verify UI rolls back: notifications revert to original state, error message displays, button reappears, unread badge reappears.

- **Test 3: Unread badge updates in sync**
  - Render UserWalletControls (which consumes NotificationContext for unread count).
  - Verify badge is visible when unread count > 0.
  - Trigger mark-all-read from the context (or simulate it by updating context state).
  - Verify badge disappears when unread count becomes 0.

- Use React Testing Library `fireEvent`, `render`, `screen`, and `waitFor` as in existing tests.
- Mock the API using `vi.fn()` as in existing test patterns.

**Verify**: Run `npm run test` in the frontend directory. All three tests pass.

---

### 7. Update NotificationsCard.test.tsx for context integration
**What**: Update the existing test file to provide NotificationContext so the component tests still pass.

**Files to modify**: `frontend/src/component/NotificationsCard.test.tsx`

**Details**:
- The existing tests call `<NotificationsCard notifications={notifications} />`, passing mock data as props.
- After adding context, NotificationsCard reads from context instead of props, so tests must wrap the component in NotificationProvider.
- Create a test wrapper that provides NotificationProvider with mock initial notifications.
- Or, keep the NotificationsCard's `notifications` prop for testing (optional prop), and use it if provided, else read from context. This keeps the component testable without context.

**Option**: Make `notifications` prop optional; if provided, use it; else read from context. This maintains backward compatibility and makes tests simpler.

**Verify**: Run existing tests. They should pass with minimal changes.

---

## Testing Command

```bash
npm run test
```

All tests (existing + new) must pass in `frontend/` directory.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/context/NotificationContext.tsx` | Create | Global state for notifications and unread count |
| `frontend/src/lib/api.ts` | Modify | Add `markAllNotificationsAsRead()` function |
| `frontend/src/component/NotificationsCard.tsx` | Modify | Use context, call context's `markAllAsRead()` |
| `frontend/src/component/header/UserWalletControls.tsx` | Modify | Show unread badge from context |
| `frontend/src/app/layout.tsx` | Modify | Wrap with NotificationProvider |
| `frontend/src/component/NotificationsCard.test.tsx` | Modify | Update tests to use context |
| `frontend/src/component/NotificationsCard.optimistic.test.tsx` | Create | Three new tests for optimistic scenarios |

---

## Rollback Pattern (from exploration)

The pattern used in `useOptimisticPrediction.ts` is the gold standard here:
```typescript
const previousState = state;
setState(optimisticNewState); // Update UI immediately
try {
  await apiCall();
} catch (error) {
  setState(previousState); // Restore on failure
  showError(error);
}
```

Apply this exact pattern in NotificationContext's `markAllAsRead()` action.

---

## Notes

- No dev server needed; all changes are contained to frontend code.
- API endpoint `/api/notifications/mark-all-read` does not exist yet on the backend. The function in api.ts will fail if called now, but it's structured correctly for integration once the endpoint is added.
- Mock data in NotificationsCard is sufficient for development; real data will flow through context once backend is ready.
- All tests use Vitest + React Testing Library, matching the existing test suite style.
