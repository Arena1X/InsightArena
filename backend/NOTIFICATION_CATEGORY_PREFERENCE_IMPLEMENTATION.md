# Notification Category Preference Enforcement Implementation

## Overview
This document describes the implementation of notification category preference enforcement in the InsightArena backend, addressing issue #1605.

## Problem Statement
The `notification-generator.service.ts` was generating all notification types regardless of a user's category preferences. Users had no way to disable specific notification categories, leading to unwanted notifications being generated and delivered.

## Solution

### 1. Core Implementation Changes

#### Updated Files
- `backend/src/notifications/notification-generator.service.ts`
- `backend/src/notifications/notification-generator.service.spec.ts`

### 2. Key Methods Added

#### `shouldQueueNotification(userAddress: string, notificationType: NotificationType): Promise<boolean>`
- Determines if a notification should be queued based on user's category preferences
- Returns `true` by default (opt-in) if:
  - User is not found
  - No category mapping exists for the notification type
  - No preference record exists for the user+category combination
  - An error occurs during lookup
- Returns `false` only when a preference explicitly disables the category (`in_app: false`)

#### `getUserIdFromAddress(userAddress: string): Promise<string | null>`
- Helper method to retrieve userId from stellar_address
- Returns `null` if user is not found
- Includes error handling with logging

#### `filterNotificationsByPreferences(notifications: Array): Promise<Array>`
- Filters a batch of notifications based on each user's category preferences
- Checks each notification individually using `shouldQueueNotification`
- Logs filtered notifications at debug level
- Returns only notifications that should be sent

### 3. Updated Queue Methods

#### `queueNotification(notification)`
- Now checks category preferences before adding to queue
- Logs skipped notifications at debug level
- Early return if notification should not be queued

#### `queueBatchNotifications(notifications)`
- Filters the entire batch using `filterNotificationsByPreferences`
- Only queues notifications that pass the preference check
- Early return if all notifications are filtered out

### 4. Notification Flow

```
Handler Method (e.g., handleEventCreated)
    ↓
shouldSendNotification (legacy per-type preferences)
    ↓
queueNotification / queueBatchNotifications
    ↓
shouldQueueNotification (category preferences) ← NEW
    ↓
getUserIdFromAddress ← NEW
    ↓
categoryPreferencesRepository.findOne
    ↓
Queue if enabled / Skip if disabled
```

### 5. Default Behavior (Safe Fallback)

The implementation uses an **opt-in by default** approach with safe fallbacks:

1. **No preference record**: Notification is sent (default opt-in)
2. **User not found**: Notification is sent (safe fallback)
3. **No category mapping**: Notification is sent (safe fallback)
4. **Database error**: Notification is sent (safe fallback)
5. **Preference exists with `in_app: false`**: Notification is NOT sent

This ensures backward compatibility and prevents missed notifications due to system errors.

### 6. Category Mappings

The following notification types are mapped to categories:

| NotificationType | NotificationCategory |
|-----------------|---------------------|
| EventCreated | event_created |
| MatchAdded | match_added |
| PredictionSubmitted | prediction_submitted |
| MatchResolved | match_resolved |
| WinnerVerified | winner_verified |
| EventCancelled | event_cancelled |

Additional notification types (DisputeSlaApproaching, DisputeSlaBreached, OracleResultDivergence) currently have no category mapping and will be sent regardless of preferences.

## Testing

### Test Coverage

Comprehensive tests were added covering:

1. **shouldQueueNotification Tests**
   - Returns true when no preference exists (default opt-in)
   - Returns true when category is enabled
   - Returns false when category is disabled
   - Returns true when user is not found (safe fallback)
   - Returns true for unmapped notification types
   - Returns true on error (safe fallback)

2. **filterNotificationsByPreferences Tests**
   - Filters out disabled categories
   - Keeps all notifications when categories are enabled
   - Returns empty array when all are filtered

3. **Integration Tests**
   - queueNotification with category filtering
   - queueBatchNotifications with category filtering
   - Handler methods respect category preferences

4. **Batch Processing Tests**
   - Partial filtering (some enabled, some disabled)
   - Complete filtering (all disabled)

### Running Tests

```bash
cd backend
pnpm install  # if dependencies not installed
pnpm test notification-generator.service.spec.ts
```

## Acceptance Criteria Verification

✅ **Users only receive notifications for categories they've enabled**
- Implemented via `shouldQueueNotification` checking `in_app` field

✅ **Default new categories to opt-in with a safe fallback**
- All methods return `true` by default when no preference exists
- Safe fallbacks for errors, missing users, and unmapped types

✅ **Disabled category is not generated**
- Tested in multiple test cases
- Notifications filtered before being added to queue

✅ **Enabled category is generated**
- Tested in multiple test cases
- Notifications pass through to queue when enabled

## Migration Support

The implementation works with the existing migration:
- `1777000000001-CreateNotificationCategoryPreferences.ts`

This migration creates the `notification_category_preferences` table with:
- `userId` (UUID)
- `category` (enum)
- `in_app`, `email`, `push` (boolean flags)
- Unique constraint on (userId, category)

## Backward Compatibility

The implementation maintains backward compatibility:

1. **Legacy preferences**: The existing `shouldSendNotification` method continues to check `UserPreferences` table
2. **Two-layer filtering**: 
   - First layer: Legacy per-type preferences (UserPreferences)
   - Second layer: New category preferences (NotificationCategoryPreference)
3. **Graceful degradation**: If category preference system fails, notifications still flow based on legacy preferences

## Performance Considerations

1. **Database queries**: Each notification requires 1-2 queries (user lookup + preference lookup)
2. **Caching opportunity**: The `getUserIdFromAddress` lookups could be cached to reduce database load
3. **Batch optimization**: The `filterNotificationsByPreferences` processes notifications sequentially but could be optimized with parallel queries if needed

## Future Enhancements

1. Add category mappings for remaining notification types (Dispute*, Oracle*)
2. Implement caching for userId lookups
3. Add preference preloading for batch operations
4. Support email and push channel filtering (currently only in_app)
5. Add metrics/logging for filtered notification counts

## Deployment Notes

1. Ensure migration `1777000000001-CreateNotificationCategoryPreferences` has been run
2. No configuration changes required
3. Feature is backward compatible and safe to deploy
4. Monitor logs for "category disabled" debug messages to verify filtering is working

## Related Files

- Entity: `backend/src/notifications/entities/notification-category-preference.entity.ts`
- Migration: `backend/src/migrations/1777000000001-CreateNotificationCategoryPreferences.ts`
- Service: `backend/src/notifications/notifications.service.ts` (category CRUD operations)
- DTOs: `backend/src/notifications/dto/update-category-preference.dto.ts`

## Conclusion

The notification category preference enforcement is fully implemented with comprehensive test coverage. The implementation uses safe defaults (opt-in), includes proper error handling, maintains backward compatibility, and meets all acceptance criteria specified in issue #1605.
