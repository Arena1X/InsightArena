"use client";

import { useCallback, useEffect, useState } from "react";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type { CreatorEvent, Prediction } from "@/context/CreatorEventsContext";
import { apiClient } from "@/lib/api";
import { logHookError } from "./useHookErrorMessage";

export interface UseMyEventsReturn {
  myJoinedEvents: CreatorEvent[];
  myCreatedEvents: CreatorEvent[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyEvents(): UseMyEventsReturn {
  const { myJoinedEvents, myCreatedEvents, isLoading, error } =
    useCreatorEvents();

  const refetch = useCallback(() => {
    // Refetch is handled by the context provider when wallet address changes.
  }, []);

  return { myJoinedEvents, myCreatedEvents, isLoading, error, refetch };
}

export interface UseMyPredictionsReturn {
  predictions: Prediction[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyPredictions(eventId: string): UseMyPredictionsReturn {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPredictions = useCallback(
    async (signal?: AbortSignal) => {
      if (!eventId) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await apiClient.get<Prediction[]>(
          `/events/${eventId}/predictions`,
          { signal }
        );
        setPredictions(result);
      } catch (err) {
        if (signal?.aborted) return;

        setError(
          logHookError(err, {
            fallbackMessage: "Failed to load predictions.",
            hookName: "useMyPredictions",
            id: eventId,
          })
        );
      } finally {
        setIsLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    const abortController = new AbortController();
    void loadPredictions(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadPredictions]);

  return {
    predictions,
    isLoading,
    error,
    refetch: () => {
      void loadPredictions();
    },
  };
}