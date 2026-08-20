"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearQueue,
  createActionId,
  enqueueAction,
  QueuedAction,
  readQueue,
  removeAction,
  writeQueue,
} from "@/lib/offlineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export interface ReplayResult<T = unknown> {
  action: QueuedAction<T>;
  ok: boolean;
  error?: unknown;
}

interface UseOfflineQueueOptions<T = unknown> {
  /**
   * Called once per queued action during replay. Returning a rejected
   * promise (or throwing) leaves the action in the queue so it can be
   * retried later.
   */
  processAction: (action: QueuedAction<T>) => Promise<void> | void;
}

interface UseOfflineQueueResult<T = unknown> {
  /** Mirrors browser connectivity. */
  isOnline: boolean;
  /** Actions currently waiting to be replayed. */
  queue: QueuedAction<T>[];
  /** True right after a reconnect when there is work to confirm. */
  replayPending: boolean;
  /** True while a replay is in flight. */
  isReplaying: boolean;
  /** Add an action to the persisted queue (requires being offline-ish). */
  enqueue: (type: string, payload: T) => QueuedAction<T>;
  /** Remove a single action (e.g. user discards it). */
  discard: (id: string) => void;
  /** Replay all queued actions through `processAction`. */
  replay: () => Promise<ReplayResult<T>[]>;
  /** Dismiss the replay confirmation without replaying. */
  dismiss: () => void;
}

/**
 * Queues user actions while the app is offline and replays them once the
 * connection is restored.
 *
 * The queue is persisted in localStorage so actions survive reloads.
 * After a reconnect the hook exposes `replayPending` — the caller should
 * show a confirmation dialog and invoke `replay()` (or `dismiss()`).
 */
export function useOfflineQueue<T = unknown>({
  processAction,
}: UseOfflineQueueOptions<T>): UseOfflineQueueResult<T> {
  const isOnline = useOnlineStatus();
  const [queue, setQueue] = useState<QueuedAction<T>[]>([]);
  const [replayPending, setReplayPending] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [hadOffline, setHadOffline] = useState(false);

  const processActionRef = useRef(processAction);
  processActionRef.current = processAction;

  // Load the persisted queue once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setQueue(readQueue<T>());
  }, []);

  // Detect the offline -> online transition and flag a replay request.
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!isOnline) {
      setHadOffline(true);
    } else if (prevOnlineRef.current === false && hadOffline) {
      // Just reconnected — if there is anything queued, ask the user.
      if (queue.length > 0) setReplayPending(true);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, hadOffline, queue.length]);

  const enqueue = useCallback((type: string, payload: T): QueuedAction<T> => {
    const action: QueuedAction<T> = {
      id: createActionId(),
      type,
      payload,
      queuedAt: Date.now(),
    };
    const next = enqueueAction(action);
    setQueue(next);
    return action;
  }, []);

  const discard = useCallback((id: string) => {
    const next = removeAction<T>(id);
    setQueue(next);
  }, []);

  const replay = useCallback(async (): Promise<ReplayResult<T>[]> => {
    const snapshot = readQueue<T>();
    if (snapshot.length === 0) {
      setReplayPending(false);
      return [];
    }

    setIsReplaying(true);
    const results: ReplayResult<T>[] = [];
    const stillQueued = [...snapshot];

    for (const action of snapshot) {
      try {
        await processActionRef.current(action);
        results.push({ action, ok: true });
        const idx = stillQueued.findIndex((a) => a.id === action.id);
        if (idx !== -1) stillQueued.splice(idx, 1);
      } catch (error) {
        results.push({ action, ok: false, error });
      }
    }

    if (stillQueued.length === 0) {
      clearQueue();
    } else {
      writeQueue(stillQueued);
    }
    setQueue(stillQueued);
    if (stillQueued.length === 0) setReplayPending(false);
    setIsReplaying(false);
    return results;
  }, []);

  const dismiss = useCallback(() => {
    setReplayPending(false);
  }, []);

  return {
    isOnline,
    queue,
    replayPending,
    isReplaying,
    enqueue,
    discard,
    replay,
    dismiss,
  };
}