import { useEffect, useState } from "react";
import {
  queueAction,
  processQueue,
  getQueue,
  removeQueuedAction,
  QUEUE_CHANGED_EVENT,
  type QueuedAction,
} from "@/lib/actionQueue";

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>([]);

  useEffect(() => {
    const refresh = () => setQueue(getQueue());
    const handleOnline = async () => {
      await processQueue();
    };

    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return {
    queue,
    discardAction: removeQueuedAction,
    queuePrediction: (marketId: string, payload: Record<string, unknown>) =>
      queueAction("prediction", { marketId, ...payload }),
    queueFavorite: (marketId: string) =>
      queueAction("favorite", { marketId }),
  };
}
