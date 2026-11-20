import { useEffect } from "react";
import { queueAction, processQueue } from "@/lib/actionQueue";

export function useOfflineQueue() {
  useEffect(() => {
    const handleOnline = async () => {
      await processQueue();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return {
    queuePrediction: (marketId: string, payload: Record<string, unknown>) =>
      queueAction("prediction", { marketId, ...payload }),
    queueFavorite: (marketId: string) =>
      queueAction("favorite", { marketId }),
  };
}
