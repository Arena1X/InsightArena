"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePredictionSlip, type SlipItem } from "@/context/PredictionSlipContext";
import { useToast } from "./useToast";
import { useTransactionTracker, type TxStatus } from "./useTransactionTracker";

export interface OptimisticPredictionState {
  id: string;
  marketId: string;
  amount: number;
  direction: "yes" | "no";
  status: "pending" | "confirmed";
  transactionId?: string;
}

export interface RolledBackPrediction {
  marketId: string;
  amount: number;
  direction: "yes" | "no";
  status: "failed";
  error: string;
  retry: () => void;
}

interface SubmissionInput {
  marketId: string;
  amount: number;
  direction: "yes" | "no";
}

interface SubmissionResult {
  id: string;
  transaction?: {
    hash: string;
    description?: string;
    pollFn: (hash: string) => Promise<TxStatus>;
  };
}

interface UseOptimisticPredictionOptions {
  onSubmit: (prediction: SubmissionInput) => Promise<SubmissionResult>;
}

interface PendingReconciliation {
  predictionId: string;
  input: SubmissionInput;
  slipItem: SlipItem;
}

function fallbackSlipItem(input: SubmissionInput): SlipItem {
  return {
    marketId: input.marketId,
    marketTitle: `Market ${input.marketId}`,
    category: "",
    outcome: input.direction,
    odds: 1,
    amount: input.amount,
  };
}

export function useOptimisticPrediction({ onSubmit }: UseOptimisticPredictionOptions) {
  const [predictions, setPredictions] = useState<OptimisticPredictionState[]>([]);
  const [lastRollback, setLastRollback] = useState<RolledBackPrediction | null>(null);
  const [submittingCount, setSubmittingCount] = useState(0);
  const toast = useToast();
  const slip = usePredictionSlip();
  const tracker = useTransactionTracker();
  const pendingTransactions = useRef(new Map<string, PendingReconciliation>());
  const handledTransactions = useRef(new Set<string>());
  const retryRef = useRef<((input: SubmissionInput) => Promise<string>) | null>(null);

  const rollback = useCallback(
    (predictionId: string, input: SubmissionInput, slipItem: SlipItem, message: string) => {
      setPredictions((current) => current.filter((prediction) => prediction.id !== predictionId));
      slip.restoreItem(slipItem);

      const retry = () => {
        setLastRollback(null);
        void retryRef.current?.(input);
      };
      setLastRollback({ ...input, status: "failed", error: message, retry });
      toast.error(message, {
        title: "Prediction rolled back",
        duration: 0,
        action: { label: "Retry", onClick: retry },
      });
    },
    [slip, toast],
  );

  const addOptimisticPrediction = useCallback(
    async (marketId: string, amount: number, direction: "yes" | "no") => {
      const input = { marketId, amount, direction };
      const slipItem = slip.items.find((item) => item.marketId === marketId) || fallbackSlipItem(input);
      const temporaryId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      setPredictions((current) => [
        ...current,
        { id: temporaryId, ...input, status: "pending" },
      ]);
      setLastRollback(null);
      setSubmittingCount((count) => count + 1);

      try {
        const result = await onSubmit(input);
        if (!result.transaction) {
          setPredictions((current) =>
            current.map((prediction) =>
              prediction.id === temporaryId
                ? { ...prediction, id: result.id, status: "confirmed" }
                : prediction,
            ),
          );
          toast.success("Prediction placed successfully");
          return result.id;
        }

        const transactionId = tracker.trackTransaction(
          result.transaction.hash,
          result.transaction.description || "Place prediction",
          result.transaction.pollFn,
        );
        pendingTransactions.current.set(transactionId, {
          predictionId: result.id,
          input,
          slipItem: { ...slipItem },
        });
        setPredictions((current) =>
          current.map((prediction) =>
            prediction.id === temporaryId
              ? { ...prediction, id: result.id, transactionId, status: "pending" }
              : prediction,
          ),
        );
        return result.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to place prediction";
        rollback(temporaryId, input, slipItem, message);
        throw error;
      } finally {
        setSubmittingCount((count) => Math.max(0, count - 1));
      }
    },
    [onSubmit, rollback, slip.items, toast, tracker],
  );
  retryRef.current = (input) => addOptimisticPrediction(input.marketId, input.amount, input.direction);

  useEffect(() => {
    for (const transaction of tracker.transactions) {
      if (transaction.status === "pending" || handledTransactions.current.has(transaction.id)) continue;
      const reconciliation = pendingTransactions.current.get(transaction.id);
      if (!reconciliation) continue;

      handledTransactions.current.add(transaction.id);
      pendingTransactions.current.delete(transaction.id);
      if (transaction.status === "confirmed") {
        setPredictions((current) =>
          current.map((prediction) =>
            prediction.id === reconciliation.predictionId
              ? { ...prediction, status: "confirmed" }
              : prediction,
          ),
        );
        toast.success("Prediction confirmed on-chain");
      } else {
        rollback(
          reconciliation.predictionId,
          reconciliation.input,
          reconciliation.slipItem,
          transaction.error || "Prediction was rejected on-chain",
        );
      }
    }
  }, [rollback, toast, tracker.transactions]);

  const removePrediction = useCallback((id: string) => {
    setPredictions((current) => current.filter((prediction) => prediction.id !== id));
  }, []);

  return {
    predictions,
    lastRollback,
    addOptimisticPrediction,
    removePrediction,
    isSubmitting: submittingCount > 0,
    transactions: tracker.transactions,
  };
}
