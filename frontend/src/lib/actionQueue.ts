export interface QueuedAction {
  id: string;
  type: "prediction" | "favorite" | "custom";
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = "insightarena.action_queue";
const MAX_RETRIES = 3;

export function queueAction(type: QueuedAction["type"], payload: Record<string, unknown>): string {
  if (typeof window === "undefined") return "";

  const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const action: QueuedAction = {
    id,
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
  };

  try {
    const queue = getQueue();
    queue.push(action);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
  }

  return id;
}

export function getQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function removeQueuedAction(id: string): void {
  if (typeof window === "undefined") return;

  try {
    const queue = getQueue().filter((a) => a.id !== id);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
  }
}

export function updateQueuedActionRetries(id: string, retries: number): void {
  if (typeof window === "undefined") return;

  try {
    const queue = getQueue().map((a) =>
      a.id === id ? { ...a, retries } : a
    );
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
  }
}

export function clearQueue(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
  }
}

export type QueueActionHandler = (action: QueuedAction) => Promise<void> | void;

async function defaultHandler(action: QueuedAction): Promise<void> {
  // Dispatch custom event for app to handle
  window.dispatchEvent(
    new CustomEvent("processQueuedAction", {
      detail: action,
    })
  );

  // Allow handlers to complete before the action is considered processed
  await new Promise((resolve) => setTimeout(resolve, 500));
}

let processing: Promise<void> | null = null;

/**
 * Replays queued actions strictly in FIFO (enqueue) order. Each action must
 * complete before the next starts. On the first failure the retry count is
 * bumped and replay halts, leaving the failed action and everything after it
 * in the queue. Concurrent calls share a single in-flight run.
 */
export function processQueue(handler: QueueActionHandler = defaultHandler): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!navigator.onLine) return Promise.resolve();
  if (processing) return processing;

  processing = replayQueue(handler).finally(() => {
    processing = null;
  });
  return processing;
}

async function replayQueue(handler: QueueActionHandler): Promise<void> {
  const queue = getQueue();
  for (const action of queue) {
    if (action.retries >= MAX_RETRIES) {
      removeQueuedAction(action.id);
      continue;
    }

    try {
      await handler(action);
    } catch {
      updateQueuedActionRetries(action.id, action.retries + 1);
      return;
    }
    removeQueuedAction(action.id);
  }
}
