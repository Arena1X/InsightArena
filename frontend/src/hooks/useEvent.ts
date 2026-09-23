"use client";

import { useCallback, useEffect, useState } from "react";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type { CreatorEvent, CreatorEventMatch } from "@/context/CreatorEventsContext";
import { logHookError } from "./useHookErrorMessage";

export function calculateCapacityFill(participants: number, maxParticipants: number): number {
  if (!maxParticipants || maxParticipants <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((participants / maxParticipants) * 100)));
}

export function isEventFull(event: { participants: number; maxParticipants: number } | null | undefined): boolean {
  if (!event) return false;
  return event.maxParticipants > 0 && event.participants >= event.maxParticipants;
}

export function hasWaitlistConfigured(event: { hasWaitlist?: boolean; waitlistConfigured?: boolean } | null | undefined): boolean {
  if (!event) return false;
  return Boolean(event.hasWaitlist || event.waitlistConfigured);
}

export interface UseEventReturn {
  event: CreatorEvent | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  isFull: boolean;
  capacityPercentage: number;
  hasWaitlist: boolean;
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
    } catch (err) {
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load event.",
          hookName: "useEvent",
          id: eventId,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, getEvent]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const isFull = isEventFull(event);
  const capacityPercentage = event ? calculateCapacityFill(event.participants, event.maxParticipants) : 0;
  const hasWaitlist = hasWaitlistConfigured(event);

  return { event, isLoading, error, refetch: fetch, isFull, capacityPercentage, hasWaitlist };
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
    } catch (err) {
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load matches.",
          hookName: "useEventMatches",
          id: eventId,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, getEventMatches]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { matches, isLoading, error, refetch: fetch };
}
