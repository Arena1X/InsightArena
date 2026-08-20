/**
 * Pure offline action queue — persisted in localStorage.
 *
 * SSR-safe: all functions accept an optional `storage` parameter so they
 * can be called without a `window` (callers should only invoke them in
 * effects / event handlers).
 */

export interface QueuedAction<T = unknown> {
  /** Unique action id (monotonic, client‑side). */
  id: string;
  /** Human-readable action type, e.g. "SUBMIT_PREDICTION". */
  type: string;
  /** Arbitrary payload the handler will use to replay the action. */
  payload: T;
  /** `Date.now()` when the action was originally queued. */
  queuedAt: number;
}

const STORAGE_KEY = "insightarena.offlineQueue";

let counter = 0;

/** Creates a monotonically-increasing client-side action id. */
export function createActionId(): string {
  counter += 1;
  return `offline-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Read the current queue from storage. Returns an empty array when
 *  the key is missing or the JSON is corrupt. */
export function readQueue<T = unknown>(
  storage: Storage = window.localStorage,
): QueuedAction<T>[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Overwrite the queue in storage. */
export function writeQueue<T = unknown>(
  actions: QueuedAction<T>[],
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(actions));
  } catch {
    // Storage full or unavailable — best-effort.
  }
}

/** Append one action to the persisted queue and return the new list. */
export function enqueueAction<T = unknown>(
  action: QueuedAction<T>,
  storage: Storage = window.localStorage,
): QueuedAction<T>[] {
  const queue = readQueue<T>(storage);
  queue.push(action);
  writeQueue(queue, storage);
  return queue;
}

/** Remove an action by id from the persisted queue and return the new list. */
export function removeAction<T = unknown>(
  id: string,
  storage: Storage = window.localStorage,
): QueuedAction<T>[] {
  const queue = readQueue<T>(storage);
  const next = queue.filter((a) => a.id !== id);
  if (next.length !== queue.length) {
    writeQueue(next, storage);
  }
  return next;
}

/** Clear the entire queue from storage. */
export function clearQueue(
  storage: Storage = window.localStorage,
): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}