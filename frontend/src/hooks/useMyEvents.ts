"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type {
  CreatorEvent,
  CreatorEventMatch,
  Prediction,
} from "@/context/CreatorEventsContext";
import { apiClient } from "@/lib/api";
import { logHookError } from "./useHookErrorMessage";

export interface UseMyEventsReturn {
  myJoinedEvents: CreatorEvent[];
  myCreatedEvents: CreatorEvent[];
  joinedCompetitionProgress: JoinedCompetitionProgress[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface JoinedCompetitionProgress {
  event: CreatorEvent;
  matchesPredicted: number;
  totalMatches: number;
  progressPercentage: number;
  rank: number | null;
  rankDelta: number | null;
  nextDeadline: CreatorEventMatch | null;
}

export function deriveCompetitionProgress(
  matches: CreatorEventMatch[],
  predictions: Prediction[],
  rank: number | null,
  previousRank?: number | null,
  now = new Date(),
): Omit<JoinedCompetitionProgress, "event"> {
  const matchIds = new Set(matches.map((match) => match.id));
  const matchesPredicted = new Set(
    predictions
      .filter((prediction) => matchIds.has(prediction.matchId))
      .map((prediction) => prediction.matchId),
  ).size;
  const upcomingMatches = matches
    .filter((match) => new Date(match.matchTime).getTime() >= now.getTime())
    .sort(
      (left, right) =>
        new Date(left.matchTime).getTime() - new Date(right.matchTime).getTime(),
    );

  return {
    matchesPredicted,
    totalMatches: matches.length,
    progressPercentage:
      matches.length === 0 ? 0 : Math.round((matchesPredicted / matches.length) * 100),
    rank,
    rankDelta:
      rank === null || previousRank === null || previousRank === undefined
        ? null
        : previousRank - rank,
    nextDeadline: upcomingMatches[0] ?? null,
  };
}

export function useMyEvents(): UseMyEventsReturn {
  const {
    myJoinedEvents,
    myCreatedEvents,
    getEventMatches,
    getUserPayout,
    getUserPredictions,
    isLoading,
    error,
  } =
    useCreatorEvents();
  const [joinedCompetitionProgress, setJoinedCompetitionProgress] = useState<
    JoinedCompetitionProgress[]
  >([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const previousRanks = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      myJoinedEvents.map(async (event) => {
        const [matches, predictions, payout] = await Promise.all([
          getEventMatches(event.id),
          getUserPredictions(event.id),
          getUserPayout(event.id),
        ]);
        const previousRank = previousRanks.current[event.id];
        const rank = payout?.rank ?? null;
        if (rank !== null) previousRanks.current[event.id] = rank;

        return {
          event,
          ...deriveCompetitionProgress(matches, predictions, rank, previousRank),
        };
      }),
    ).then((competitions) => {
      if (!cancelled) setJoinedCompetitionProgress(competitions);
    });

    return () => {
      cancelled = true;
    };
  }, [
    getEventMatches,
    getUserPayout,
    getUserPredictions,
    myJoinedEvents,
    refreshVersion,
  ]);

  const refetch = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  return {
    myJoinedEvents,
    myCreatedEvents,
    joinedCompetitionProgress,
    isLoading,
    error,
    refetch,
  };
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
