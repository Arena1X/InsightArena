"use client";

import { useCallback, useEffect, useState } from "react";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type { CreatorEvent, CreatorEventMatch } from "@/context/CreatorEventsContext";

export interface UseEventReturn {
  event: CreatorEvent | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEvent(eventId: string): UseEventReturn {
  const { getEvent } = useCreatorEvents();
  const [event, setEvent] = useState<CreatorEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getEvent(eventId);
      if (!result) {
        setError("Event not found.");
      }
      setEvent(result);
    } catch {
      setError("Failed to load event.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, getEvent]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { event, isLoading, error, refetch: fetch };
}

export interface UseEventMatchesReturn {
  matches: CreatorEventMatch[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEventMatches(eventId: string): UseEventMatchesReturn {
  const { getEventMatches } = useCreatorEvents();
  const [matches, setMatches] = useState<CreatorEventMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getEventMatches(eventId);
      setMatches(result);
    } catch {
      setError("Failed to load matches.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, getEventMatches]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { matches, isLoading, error, refetch: fetch };
}
