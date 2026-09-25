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

export async function processQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const queue = getQueue();
  for (const action of queue) {
    if (action.retries >= MAX_RETRIES) {
      removeQueuedAction(action.id);
      continue;
    }

    try {
      // Dispatch custom event for app to handle
      window.dispatchEvent(
        new CustomEvent("processQueuedAction", {
          detail: action,
        })
      );

      // Mark as processed after a short delay to allow handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
      removeQueuedAction(action.id);
    } catch (error) {
      updateQueuedActionRetries(action.id, action.retries + 1);
    }
  }
}
