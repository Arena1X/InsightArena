"use client";

import { useCallback, useEffect, useState } from "react";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type { CreatorEvent, Prediction } from "@/context/CreatorEventsContext";

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
    // Replace this with a real refetch call once backend integration is added.
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
  const { getUserPredictions } = useCreatorEvents();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getUserPredictions(eventId);
      setPredictions(result);
    } catch {
      setError("Failed to load predictions.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, getUserPredictions]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { predictions, isLoading, error, refetch: fetch };
}
