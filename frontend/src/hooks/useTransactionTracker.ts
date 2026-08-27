"use client";

import { useCallback, useRef, useState } from "react";

export type TxStatus = "pending" | "confirmed" | "failed" | "timeout";

export interface TrackedTransaction {
  id: string;
  hash: string;
  description: string;
  status: TxStatus;
  error?: string;
  explorerUrl: string;
  submittedAt: number;
  resolvedAt?: number;
}

const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer/testnet/tx";
const AUTO_DISMISS_MS = 6_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 20;

function buildExplorerUrl(hash: string): string {
  return `${STELLAR_EXPERT_BASE}/${hash}`;
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `tx-${Date.now()}-${idCounter}`;
}

export interface UseTransactionTrackerResult {
  transactions: TrackedTransaction[];
  trackTransaction: (
    hash: string,
    description: string,
    pollFn: (hash: string) => Promise<"pending" | "confirmed" | "failed">,
    timeoutMs?: number,
  ) => string;
  /** Re-arms polling for a transaction stuck in the "timeout" state. */
  checkAgain: (id: string) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/**
 * Tracks on-chain transactions through pending → confirmed/failed states.
 *
 * Polls `pollFn` at a fixed interval until a terminal state is reached or the
 * poll limit is hit. Confirmed transactions auto-dismiss after a delay.
 */
interface PollContext {
  hash: string;
  pollFn: (hash: string) => Promise<"pending" | "confirmed" | "failed">;
  timeoutMs: number;
}

export function useTransactionTracker(): UseTransactionTrackerResult {
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollContexts = useRef<Map<string, PollContext>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    pollContexts.current.delete(id);
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, [clearTimer]);

  const dismissAll = useCallback(() => {
    timers.current.forEach((_, id) => clearTimer(id));
    pollContexts.current.clear();
    setTransactions([]);
  }, [clearTimer]);

  const scheduleAutoDismiss = useCallback((id: string) => {
    clearTimer(id);
    const t = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timers.current.set(id, t);
  }, [clearTimer, dismiss]);

  const updateTx = useCallback((id: string, patch: Partial<TrackedTransaction>) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)),
    );
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      const ctx = pollContexts.current.get(id);
      if (!ctx) return;
      const { hash, pollFn, timeoutMs } = ctx;
      const deadline = Date.now() + timeoutMs;

      const poll = async () => {
        try {
          const result = await pollFn(hash);

          if (result === "confirmed") {
            updateTx(id, { status: "confirmed", resolvedAt: Date.now() });
            scheduleAutoDismiss(id);
            return;
          }

          if (result === "failed") {
            updateTx(id, {
              status: "failed",
              error: "Transaction failed on-chain. Check the explorer for details.",
              resolvedAt: Date.now(),
            });
            return;
          }

          if (Date.now() < deadline) {
            const t = setTimeout(poll, POLL_INTERVAL_MS);
            timers.current.set(id, t);
          } else {
            // Distinct from "failed": the tx never resolved either way within
            // the deadline, so it may still confirm on-chain later.
            updateTx(id, { status: "timeout" });
          }
        } catch {
          updateTx(id, {
            status: "failed",
            error: "Could not confirm transaction status. Check the explorer.",
            resolvedAt: Date.now(),
          });
        }
      };

      const t = setTimeout(poll, POLL_INTERVAL_MS);
      timers.current.set(id, t);
    },
    [updateTx, scheduleAutoDismiss],
  );

  const trackTransaction = useCallback(
    (
      hash: string,
      description: string,
      pollFn: (hash: string) => Promise<"pending" | "confirmed" | "failed">,
      timeoutMs: number = POLL_INTERVAL_MS * MAX_POLLS,
    ): string => {
      const id = generateId();
      const tx: TrackedTransaction = {
        id,
        hash,
        description,
        status: "pending",
        explorerUrl: buildExplorerUrl(hash),
        submittedAt: Date.now(),
      };

      setTransactions((prev) => [tx, ...prev]);
      pollContexts.current.set(id, { hash, pollFn, timeoutMs });
      startPolling(id);

      return id;
    },
    [startPolling],
  );

  const checkAgain = useCallback(
    (id: string) => {
      clearTimer(id);
      updateTx(id, { status: "pending", error: undefined, resolvedAt: undefined });
      startPolling(id);
    },
    [clearTimer, updateTx, startPolling],
  );

  return { transactions, trackTransaction, checkAgain, dismiss, dismissAll };
}
