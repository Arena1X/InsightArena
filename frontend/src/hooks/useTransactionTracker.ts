"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TxStatus = "pending" | "confirmed" | "failed";

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
  ) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/**
 * Tracks on-chain transactions through pending → confirmed/failed states.
 *
 * Polls `pollFn` at a fixed interval until a terminal state is reached or the
 * poll limit is hit. Confirmed transactions auto-dismiss after a delay.
 */
export function useTransactionTracker(): UseTransactionTrackerResult {
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, [clearTimer]);

  const dismissAll = useCallback(() => {
    timers.current.forEach((_, id) => clearTimer(id));
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

  const trackTransaction = useCallback(
    (
      hash: string,
      description: string,
      pollFn: (hash: string) => Promise<TxStatus>,
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

      let polls = 0;
      const poll = async () => {
        try {
          const result = await pollFn(hash);
          polls += 1;

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

          if (polls < MAX_POLLS) {
            const t = setTimeout(poll, POLL_INTERVAL_MS);
            timers.current.set(id, t);
          } else {
            updateTx(id, {
              status: "failed",
              error: "Timed out waiting for confirmation. The transaction may still land — check the explorer.",
              resolvedAt: Date.now(),
            });
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

      return id;
    },
    [updateTx, scheduleAutoDismiss],
  );

  return { transactions, trackTransaction, dismiss, dismissAll };
}
