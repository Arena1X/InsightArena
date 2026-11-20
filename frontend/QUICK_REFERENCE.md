# Quick Reference Guide

## Optimistic Prediction Rollback

### Basic Setup

```tsx
import { useOptimisticPrediction } from "@/hooks/useOptimisticPrediction";

function MyComponent() {
  const {
    predictions,           // Active predictions
    lastRollback,         // Most recent failure
    rollbackHistory,      // All recent failures (max 10)
    isSubmitting,         // Is a submission in progress
    addOptimisticPrediction,  // Submit a prediction
    dismissRollback,      // Dismiss current notification
    clearRollbackHistory, // Clear all history
  } = useOptimisticPrediction({
    onSubmit: async (prediction) => {
      // Your API call
      return { id: "pred-123", transaction: {...} };
    }
  });
}
```

### Show Current Rollback

```tsx
{lastRollback && (
  <div className="error-banner">
    <p>{lastRollback.error}</p>
    <span>Failed: {new Date(lastRollback.timestamp).toLocaleTimeString()}</span>
    <button onClick={lastRollback.retry}>Retry</button>
    <button onClick={lastRollback.dismiss}>Dismiss</button>
  </div>
)}
```

### Show Rollback History

```tsx
{rollbackHistory.length > 0 && (
  <div>
    <button onClick={clearRollbackHistory}>Clear All</button>
    {rollbackHistory.map((rb) => (
      <div key={rb.timestamp}>
        <p>{rb.marketId}: {rb.error}</p>
        <button onClick={rb.retry}>Retry</button>
      </div>
    ))}
  </div>
)}
```

---

## Portfolio Empty States

### Basic Setup

```tsx
import { usePortfolio } from "@/hooks/usePortfolio";

function MyComponent({ address, status }) {
  const {
    positions,         // Array of positions
    isEmpty,          // Quick empty check
    emptyStateReason, // Why it's empty
    hasFilters,       // Are filters active
    isLoading,        // Is loading
    error,            // Error message if any
    refetch,          // Refetch function
    clearFilters,     // Helper for clearing filters
  } = usePortfolio({ address, status });
}
```

### Handle Empty States

```tsx
if (isEmpty) {
  switch (emptyStateReason) {
    case "loading":
      return <Spinner />;
    
    case "no-address":
      return <ConnectWallet />;
    
    case "no-positions":
      return <EmptyState message="Start trading!" />;
    
    case "no-filtered-positions":
      return (
        <EmptyState 
          message="No matches"
          action={<button onClick={clearFilters}>Clear</button>}
        />
      );
    
    case "error":
      return <ErrorState error={error} onRetry={refetch} />;
  }
}

return <PositionsList positions={positions} />;
```

### Inline Empty State

```tsx
if (isEmpty && emptyStateReason === "no-positions") {
  return <p>No data. <a href="/trade">Get started</a></p>;
}
```

---

## P/L History Empty States

### Basic Setup

```tsx
import { usePnlHistory } from "@/hooks/usePortfolio";

function PnlChart({ address, range }) {
  const {
    history,          // Array of data points
    summary,          // Summary stats
    isEmpty,          // Quick check
    emptyStateReason, // Why empty
  } = usePnlHistory({ address, range });
  
  if (isEmpty && emptyStateReason === "no-positions") {
    return <p>No history for this period</p>;
  }
  
  return <Chart data={history} />;
}
```

---

## Common Patterns

### Toast on Rollback

```tsx
// Already handled automatically by the hook!
// Rollback shows a toast with retry button
```

### Persistent Error Notification

```tsx
// Set toast duration to 0 for persistent notifications
toast.error(message, {
  duration: 0,  // Won't auto-dismiss
  action: { label: "Retry", onClick: retry }
});
```

### Loading Overlay

```tsx
{isSubmitting && (
  <div className="overlay">
    <Spinner />
    <p>Submitting prediction...</p>
  </div>
)}
```

### Conditional Filter Clear

```tsx
{hasFilters && isEmpty && emptyStateReason === "no-filtered-positions" && (
  <button onClick={clearFilters}>
    Clear Filters
  </button>
)}
```

---

## Type Reference

### RolledBackPrediction

```typescript
interface RolledBackPrediction {
  marketId: string;
  amount: number;
  direction: "yes" | "no";
  status: "failed";
  error: string;
  timestamp: number;
  retry: () => void;
  dismiss: () => void;
}
```

### EmptyStateReason

```typescript
type EmptyStateReason = 
  | "no-address"
  | "no-positions"
  | "no-filtered-positions"
  | "loading"
  | "error";
```

---

## Testing Snippets

### Mock Rollback

```tsx
const mockOnSubmit = vi.fn().mockRejectedValue(
  new Error("Insufficient funds")
);

const { result } = renderHook(() => 
  useOptimisticPrediction({ onSubmit: mockOnSubmit })
);

await act(async () => {
  await result.current.addOptimisticPrediction("market-1", 100, "yes");
});

expect(result.current.lastRollback).toBeTruthy();
expect(result.current.lastRollback.error).toBe("Insufficient funds");
```

### Mock Empty State

```tsx
// Mock API to return empty array
vi.mocked(apiClient.get).mockResolvedValue({
  data: [],
  total: 0,
  page: 1,
  limit: 20
});

const { result } = renderHook(() => 
  usePortfolio({ address: "GAB..." })
);

await waitFor(() => {
  expect(result.current.isEmpty).toBe(true);
  expect(result.current.emptyStateReason).toBe("no-positions");
});
```

---

## Common Issues

### Rollback not triggering
✓ Ensure `onSubmit` throws an error or rejects  
✓ Check that transaction poll function returns "failed"

### Empty state stuck on loading
✓ Ensure API call completes (success or error)  
✓ Check that `hasInitialLoad` is being set

### Slip not restored
✓ Verify slip item exists before submission  
✓ Check `restoreItem` is called in rollback

### History not updating
✓ Check that rollback is being called  
✓ Verify history limit (max 10 items)

---

## Performance Tips

1. **Memoize callbacks** - Use `useCallback` for retry functions
2. **Debounce refetch** - Prevent rapid refetch calls
3. **Lazy load history** - Only render history when expanded
4. **Virtual scrolling** - For large position lists

---

## Accessibility

### Rollback Notifications

```tsx
<div role="alert" aria-live="assertive">
  {lastRollback && (
    <div aria-label={`Prediction failed: ${lastRollback.error}`}>
      {/* Content */}
    </div>
  )}
</div>
```

### Empty States

```tsx
<div role="status" aria-live="polite">
  {isEmpty && emptyStateReason === "loading" && (
    <p>Loading positions...</p>
  )}
</div>
```

---

## Migration Checklist

- [ ] Update imports to include new hook properties
- [ ] Add rollback UI components
- [ ] Replace manual empty checks with `emptyStateReason`
- [ ] Add empty state components for each reason
- [ ] Update tests to cover new functionality
- [ ] Test rollback → retry flow
- [ ] Test all empty state scenarios
- [ ] Add accessibility attributes
- [ ] Update documentation/comments

---

## Examples Location

Full examples available in:
- `/frontend/src/component/OptimisticPredictionExamples.tsx`
- `/frontend/src/component/PortfolioEmptyStateExamples.tsx`
