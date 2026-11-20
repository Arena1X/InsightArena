# Optimistic Prediction Rollback & Portfolio Empty State Enhancements

## Overview

This document describes two major frontend enhancements:

1. **Optimistic Prediction Rollback on Failure** - Enhanced error handling and recovery for failed predictions
2. **Portfolio Hook Empty-State Handling** - Comprehensive empty state management for portfolio views

---

## 1. Optimistic Prediction Rollback on Failure

### Summary

Enhanced the `useOptimisticPrediction` hook to provide robust rollback handling when predictions fail, including retry functionality, rollback history tracking, and dismissible error states.

### Key Features

#### 1.1 Enhanced Rollback State

```typescript
export interface RolledBackPrediction {
  marketId: string;
  amount: number;
  direction: "yes" | "no";
  status: "failed";
  error: string;
  timestamp: number;        // NEW: When the rollback occurred
  retry: () => void;        // Function to retry the prediction
  dismiss: () => void;      // NEW: Function to dismiss the rollback notification
}
```

#### 1.2 Rollback History

The hook now maintains a history of up to 10 recent rollbacks, allowing users to:
- See all recent failed predictions
- Retry any failed prediction from history
- Clear the entire history

```typescript
const {
  predictions,
  lastRollback,           // Most recent rollback
  rollbackHistory,        // Array of recent rollbacks (max 10)
  dismissRollback,        // Dismiss the current rollback notification
  clearRollbackHistory,   // Clear all rollback history
  // ... other properties
} = useOptimisticPrediction({ onSubmit });
```

#### 1.3 Automatic Slip Restoration

When a prediction fails and rolls back:
1. The optimistic prediction is removed from the UI
2. The prediction slip item is automatically restored with the original amount
3. User can immediately retry or modify the prediction
4. Original slip data is preserved including odds, market title, etc.

#### 1.4 Enhanced Error Reporting

```typescript
const rollback = useCallback(
  (predictionId: string, input: SubmissionInput, slipItem: SlipItem, message: string) => {
    // Remove optimistic prediction
    setPredictions((current) => 
      current.filter((prediction) => prediction.id !== predictionId)
    );
    
    // Restore to slip with original data
    slip.restoreItem(slipItem);
    
    // Create rollback record with timestamp
    const rollbackData: RolledBackPrediction = {
      ...input,
      status: "failed",
      error: message,
      timestamp: Date.now(),
      retry,
      dismiss: dismissRollback,
    };
    
    // Update state and history
    setLastRollback(rollbackData);
    setRollbackHistory((history) => [rollbackData, ...history].slice(0, 10));
    
    // Show toast with retry action
    toast.error(message, {
      title: "Prediction rolled back",
      duration: 0, // Persistent until dismissed
      action: { label: "Retry", onClick: retry },
    });
  },
  [slip, toast, dismissRollback]
);
```

### Usage Examples

#### Basic Usage

```tsx
function PredictionForm() {
  const { 
    lastRollback, 
    isSubmitting,
    addOptimisticPrediction 
  } = useOptimisticPrediction({ onSubmit: submitPrediction });

  // Show rollback notification
  if (lastRollback) {
    return (
      <div className="error-banner">
        <p>{lastRollback.error}</p>
        <button onClick={lastRollback.retry}>Retry</button>
        <button onClick={lastRollback.dismiss}>Dismiss</button>
      </div>
    );
  }

  // ... rest of form
}
```

#### With History Panel

```tsx
function PredictionHistory() {
  const { rollbackHistory, clearRollbackHistory } = useOptimisticPrediction({
    onSubmit: submitPrediction
  });

  return (
    <div>
      <h3>Recent Failures ({rollbackHistory.length})</h3>
      <button onClick={clearRollbackHistory}>Clear All</button>
      
      {rollbackHistory.map((rollback) => (
        <div key={`${rollback.marketId}-${rollback.timestamp}`}>
          <p>{rollback.error}</p>
          <span>{new Date(rollback.timestamp).toLocaleString()}</span>
          <button onClick={rollback.retry}>Retry</button>
        </div>
      ))}
    </div>
  );
}
```

### Benefits

1. **User Experience**
   - Clear feedback when predictions fail
   - One-click retry without re-entering data
   - Persistent notifications for critical errors
   - History tracking for troubleshooting

2. **Data Integrity**
   - Automatic slip restoration prevents data loss
   - Original prediction parameters preserved
   - Transaction reconciliation with rollback

3. **Error Recovery**
   - Multiple retry attempts supported
   - Dismissible notifications don't block UI
   - History allows retrying older failures

---

## 2. Portfolio Hook Empty-State Handling

### Summary

Enhanced the `usePortfolio` and `usePnlHistory` hooks with comprehensive empty state detection and contextual information to help UI components render appropriate empty states.

### Key Features

#### 2.1 Empty State Types

```typescript
export type EmptyStateReason = 
  | "no-address"              // Wallet not connected
  | "no-positions"            // User has never made predictions
  | "no-filtered-positions"   // Filters exclude all results
  | "loading"                 // Initial load in progress
  | "error";                  // Request failed
```

#### 2.2 Enhanced Return Values

```typescript
interface UsePortfolioReturn {
  positions: Position[];
  total: number;
  isLoading: boolean;
  error: string | null;
  
  // NEW: Empty state handling
  isEmpty: boolean;                    // Quick check if positions array is empty
  emptyStateReason: EmptyStateReason | null;  // Why it's empty
  hasFilters: boolean;                 // Are filters currently applied
  clearFilters: () => void;            // Helper to indicate filter clearing intent
  refetch: () => void;
}
```

#### 2.3 Smart Empty State Detection

The hook automatically determines the appropriate empty state reason:

```typescript
// Determine empty state reason
let emptyStateReason: EmptyStateReason | null = null;
const isEmpty = positions.length === 0;

if (!hasInitialLoad || isLoading) {
  emptyStateReason = "loading";
} else if (error) {
  emptyStateReason = "error";
} else if (!address) {
  emptyStateReason = "no-address";
} else if (isEmpty && hasFilters) {
  emptyStateReason = "no-filtered-positions";
} else if (isEmpty && !hasFilters) {
  emptyStateReason = "no-positions";
}
```

#### 2.4 Initial Load Tracking

```typescript
const [hasInitialLoad, setHasInitialLoad] = useState(false);

// Prevents premature empty states during initial load
// Ensures loading state is shown before "no data" states
```

### Usage Examples

#### Comprehensive Empty State Handling

```tsx
function Portfolio({ address, status }: Props) {
  const {
    positions,
    isEmpty,
    emptyStateReason,
    hasFilters,
    refetch,
    clearFilters,
  } = usePortfolio({ address, status });

  // Render based on empty state reason
  if (isEmpty) {
    switch (emptyStateReason) {
      case "loading":
        return <LoadingSpinner message="Loading portfolio..." />;
      
      case "error":
        return (
          <ErrorState 
            message="Failed to load portfolio"
            onRetry={refetch}
          />
        );
      
      case "no-address":
        return (
          <EmptyState
            icon={<WalletIcon />}
            title="Connect your wallet"
            description="Connect to view your predictions"
            action={<ConnectWalletButton />}
          />
        );
      
      case "no-filtered-positions":
        return (
          <EmptyState
            icon={<FilterIcon />}
            title="No matching positions"
            description="Try adjusting your filters"
            action={<button onClick={clearFilters}>Clear Filters</button>}
          />
        );
      
      case "no-positions":
        return (
          <EmptyState
            icon={<ChartIcon />}
            title="No predictions yet"
            description="Start exploring markets!"
            action={<Link href="/markets">Explore Markets</Link>}
          />
        );
    }
  }

  // Render positions...
  return <PositionsList positions={positions} />;
}
```

#### Inline Compact Empty State

```tsx
function CompactPortfolio({ address }: Props) {
  const { positions, isEmpty, emptyStateReason } = usePortfolio({ address });

  if (isEmpty && emptyStateReason === "no-positions") {
    return <p>No predictions yet. <Link href="/markets">Get started</Link></p>;
  }

  return <PositionsList positions={positions} />;
}
```

#### P/L History Empty States

```tsx
function PnlChart({ address, range }: Props) {
  const {
    history,
    summary,
    isEmpty,
    emptyStateReason,
  } = usePnlHistory({ address, range });

  if (isEmpty) {
    if (emptyStateReason === "no-positions") {
      return <p>No data for this time period</p>;
    }
    if (emptyStateReason === "error") {
      return <ErrorBanner message="Failed to load P/L history" />;
    }
  }

  return <Chart data={history} summary={summary} />;
}
```

### Benefits

1. **Better UX**
   - Contextual empty states guide user action
   - Loading states prevent confusion
   - Error states allow recovery
   - Filter-aware messaging

2. **Developer Experience**
   - Single source of truth for empty state logic
   - No need to duplicate detection logic in components
   - Type-safe empty state reasons
   - Consistent behavior across all portfolio views

3. **Maintainability**
   - Centralized empty state logic
   - Easy to add new empty state types
   - Consistent messaging across app
   - Simplified component logic

---

## Implementation Files

### Modified Files

1. **`/frontend/src/hooks/useOptimisticPrediction.ts`**
   - Added `rollbackHistory` state
   - Added `timestamp` and `dismiss` to `RolledBackPrediction`
   - Added `dismissRollback()` and `clearRollbackHistory()` functions
   - Enhanced rollback tracking with history (max 10 items)

2. **`/frontend/src/hooks/usePortfolio.ts`**
   - Added `EmptyStateReason` type
   - Added `isEmpty`, `emptyStateReason`, `hasFilters`, `clearFilters` to return
   - Added `hasInitialLoad` state for proper loading detection
   - Enhanced both `usePortfolio` and `usePnlHistory` hooks

### New Files

1. **`/frontend/src/component/OptimisticPredictionExamples.tsx`**
   - Complete example implementation
   - Shows rollback notification UI
   - Demonstrates rollback history panel
   - Includes simple and complex examples

2. **`/frontend/src/component/PortfolioEmptyStateExamples.tsx`**
   - Comprehensive empty state examples
   - All empty state types demonstrated
   - P/L history empty states
   - Compact inline examples

---

## Testing Considerations

### Optimistic Prediction Tests

```typescript
describe("useOptimisticPrediction rollback", () => {
  it("should track rollback history", async () => {
    // Fail multiple predictions
    // Verify rollbackHistory contains all failures
    // Verify history is limited to 10 items
  });

  it("should allow dismissing rollback notifications", () => {
    // Trigger rollback
    // Call dismiss()
    // Verify lastRollback is null
    // Verify history still contains the rollback
  });

  it("should clear all rollback history", () => {
    // Create multiple rollbacks
    // Call clearRollbackHistory()
    // Verify rollbackHistory is empty
  });
});
```

### Portfolio Empty State Tests

```typescript
describe("usePortfolio empty states", () => {
  it("should detect no-address state", () => {
    const { emptyStateReason } = usePortfolio({ address: "" });
    expect(emptyStateReason).toBe("no-address");
  });

  it("should differentiate filtered vs unfiltered empty", () => {
    // Mock empty response with filters
    expect(emptyStateReason).toBe("no-filtered-positions");
    
    // Mock empty response without filters
    expect(emptyStateReason).toBe("no-positions");
  });

  it("should show loading state during initial fetch", () => {
    // Mock pending request
    expect(emptyStateReason).toBe("loading");
    expect(isLoading).toBe(true);
  });
});
```

---

## Migration Guide

### For Optimistic Predictions

**Before:**
```typescript
const { lastRollback } = useOptimisticPrediction({ onSubmit });

if (lastRollback) {
  return <div>{lastRollback.error}</div>;
}
```

**After:**
```typescript
const { lastRollback, dismissRollback } = useOptimisticPrediction({ onSubmit });

if (lastRollback) {
  return (
    <div>
      {lastRollback.error}
      <button onClick={lastRollback.retry}>Retry</button>
      <button onClick={lastRollback.dismiss}>Dismiss</button>
      <span>{new Date(lastRollback.timestamp).toLocaleString()}</span>
    </div>
  );
}
```

### For Portfolio

**Before:**
```typescript
const { positions, isLoading } = usePortfolio({ address });

if (isLoading) return <Spinner />;
if (positions.length === 0) return <div>No data</div>;
```

**After:**
```typescript
const { positions, isEmpty, emptyStateReason } = usePortfolio({ address });

if (isEmpty) {
  switch (emptyStateReason) {
    case "loading": return <Spinner />;
    case "no-address": return <ConnectWallet />;
    case "no-positions": return <GetStarted />;
    case "no-filtered-positions": return <ClearFilters />;
    case "error": return <ErrorState />;
  }
}
```

---

## Future Enhancements

### Optimistic Predictions

1. **Persistent Storage**: Save rollback history to localStorage
2. **Bulk Retry**: Retry multiple failed predictions at once
3. **Rollback Analytics**: Track failure patterns and reasons
4. **Smart Retry**: Exponential backoff for automatic retries

### Portfolio Empty States

1. **Onboarding Flow**: Guided tour for first-time users
2. **Suggested Actions**: Context-aware CTA based on user state
3. **Empty State Animations**: Micro-interactions for engagement
4. **A/B Testing**: Test different empty state messaging

---

## Summary

These enhancements significantly improve the user experience for prediction management and portfolio viewing:

1. **Optimistic Rollback** provides robust error recovery with history tracking and one-click retry
2. **Portfolio Empty States** give contextual, actionable feedback for every possible empty state scenario

Both features are backward compatible and can be adopted incrementally.
