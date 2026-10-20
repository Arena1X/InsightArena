"use client";

import { useOptimisticPrediction } from "@/hooks/useOptimisticPrediction";

/**
 * Example component demonstrating how to use the enhanced useOptimisticPrediction hook
 * with rollback handling, retry functionality, and rollback history
 */
export function OptimisticPredictionExample() {
  const {
    predictions,
    lastRollback,
    rollbackHistory,
    addOptimisticPrediction,
    dismissRollback,
    clearRollbackHistory,
    isSubmitting,
  } = useOptimisticPrediction({
    onSubmit: async (prediction) => {
      // Your submission logic here
      const response = await fetch("/api/predictions", {
        method: "POST",
        body: JSON.stringify(prediction),
      });
      return response.json();
    },
  });

  return (
    <div className="space-y-4">
      {/* Active Predictions List */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Active Predictions</h3>
        {predictions.length === 0 ? (
          <p className="text-muted-foreground">No active predictions</p>
        ) : (
          predictions.map((pred) => (
            <div
              key={pred.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">Market: {pred.marketId}</p>
                <p className="text-sm text-muted-foreground">
                  {pred.amount} on {pred.direction}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    pred.status === "confirmed"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {pred.status}
                </span>
                {pred.transactionId && (
                  <span className="text-xs text-muted-foreground">
                    Tx: {pred.transactionId.slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Last Rollback Alert */}
      {lastRollback && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold text-destructive">
                Prediction Failed & Rolled Back
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Market: {lastRollback.marketId} • {lastRollback.amount} on{" "}
                {lastRollback.direction}
              </p>
              <p className="mt-2 text-sm">{lastRollback.error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Failed at {new Date(lastRollback.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={dismissRollback}
              className="ml-4 text-sm text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={lastRollback.retry}
              disabled={isSubmitting}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Retry Prediction
            </button>
            <button
              onClick={lastRollback.dismiss}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Rollback History */}
      {rollbackHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Failures</h3>
            <button
              onClick={clearRollbackHistory}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear History
            </button>
          </div>
          <div className="space-y-2">
            {rollbackHistory.map((rollback, index) => (
              <div
                key={`${rollback.marketId}-${rollback.timestamp}`}
                className="rounded border border-muted p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Market: {rollback.marketId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rollback.amount} on {rollback.direction} •{" "}
                      {new Date(rollback.timestamp).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-destructive">
                      {rollback.error}
                    </p>
                  </div>
                  <button
                    onClick={rollback.retry}
                    disabled={isSubmitting}
                    className="ml-2 rounded border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submission Status */}
      {isSubmitting && (
        <div className="rounded-lg border border-primary bg-primary/10 p-3">
          <p className="text-sm font-medium">Submitting prediction...</p>
        </div>
      )}
    </div>
  );
}

/**
 * Simpler example focusing on just the retry functionality
 */
export function SimpleRollbackExample() {
  const { lastRollback, isSubmitting } = useOptimisticPrediction({
    onSubmit: async (prediction) => {
      // Your submission logic
      return { id: "pred-123" };
    },
  });

  if (!lastRollback) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-md rounded-lg border bg-card p-4 shadow-lg">
      <h4 className="font-semibold">Prediction Failed</h4>
      <p className="mt-1 text-sm text-muted-foreground">{lastRollback.error}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={lastRollback.retry}
          disabled={isSubmitting}
          className="flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Retry
        </button>
        <button
          onClick={lastRollback.dismiss}
          className="rounded border px-3 py-2 text-sm font-medium"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
