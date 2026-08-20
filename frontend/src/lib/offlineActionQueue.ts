"use client";

import { createActionId } from "@/lib/offlineQueue";

/**
 * Module-level bus so any component can queue an action while offline
 * without prop drilling or a context dependency on PwaManager.
 *
 * PwaManager subscribes via `subscribeOfflineActions` and enqueues the
 * action into its persistent offline queue for later replay. Replay is
 * performed by handlers registered via `registerOfflineActionHandler`.
 */

export interface QueuedActionEnvelope {
  id: string;
  type: string;
  payload: unknown;
  queuedAt: number;
}

type Listener = (entry: QueuedActionEnvelope) => void;
export type OfflineActionHandler = (entry: QueuedActionEnvelope) => Promise<void> | void;

const listeners = new Set<Listener>();
const handlers = new Map<string, OfflineActionHandler>();

/** Subscribes to offline action submissions. Returns an unsubscribe fn. */
export function subscribeOfflineActions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Queue an action that will be replayed once connectivity returns.
 * Safe to call from any component — the action persists in localStorage
 * via PwaManager's `useOfflineQueue`.
 */
export function queueOfflineAction(
  type: string,
  payload: unknown,
): QueuedActionEnvelope {
  const entry: QueuedActionEnvelope = {
    id: createActionId(),
    type,
    payload,
    queuedAt: Date.now(),
  };
  listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {
      // A broken listener must not break action delivery.
    }
  });
  return entry;
}

/** Registers (or replaces) the replay handler for a given action type. */
export function registerOfflineActionHandler(
  type: string,
  handler: OfflineActionHandler,
): () => void {
  handlers.set(type, handler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

/** Dispatches a queued action to its registered handler; returns true if handled. */
export async function dispatchOfflineAction(
  entry: QueuedActionEnvelope,
): Promise<boolean> {
  const handler = handlers.get(entry.type);
  if (!handler) return false;
  await handler(entry);
  return true;
}

/** True if any handler is registered for the given action type. */
export function hasOfflineActionHandler(type: string): boolean {
  return handlers.has(type);
}