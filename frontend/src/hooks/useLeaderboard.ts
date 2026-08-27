"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLeaderboard,
  getLeaderboardSnapshot,
  getSeasons,
  type LeaderboardEntryResponse,
  type SeasonListItem,
  type SnapshotRankingEntry,
} from "@/lib/api";
import { logHookError } from "@/hooks/useHookErrorMessage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseLeaderboardReturn {
  /** Live leaderboard entries for the selected season (empty while loading). */
  entries: LeaderboardEntryResponse[];
  /** All available seasons, newest first. */
  seasons: SeasonListItem[];
  /** Currently selected season ID — undefined = all-time. */
  seasonId: string | undefined;
  /** Change the season; triggers an immediate reload. */
  setSeasonId: (id: string | undefined) => void;

  isLoading: boolean;
  error: string | null;
  /** True when the server returned zero entries (not the same as loading). */
  isEmpty: boolean;

  // ── Snapshot compare ────────────────────────────────────────────────────
  /** ISO date string the compare snapshot is pinned to, or null when off. */
  compareDate: string | null;
  /** Enable/disable snapshot compare; set null to clear. */
  setCompareDate: (date: string | null) => void;
  /** Snapshot entries for compareDate (empty while loading or when disabled). */
  snapshotEntries: SnapshotRankingEntry[];
  /** True while the compare snapshot is being fetched. */
  isSnapshotLoading: boolean;
  snapshotError: string | null;
  /**
   * Per-address rank delta vs compareDate snapshot.
   * Positive = moved up (rank number decreased).  Null map when compare is off.
   */
  snapshotDeltas: Map<string, number>;

  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLeaderboard(): UseLeaderboardReturn {
  const [entries, setEntries] = useState<LeaderboardEntryResponse[]>([]);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [seasonId, setSeasonIdState] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [compareDate, setCompareDateState] = useState<string | null>(null);
  const [snapshotEntries, setSnapshotEntries] = useState<SnapshotRankingEntry[]>([]);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotDeltas, setSnapshotDeltas] = useState<Map<string, number>>(
    new Map(),
  );

  // Abort controller refs so we can cancel in-flight fetches when the
  // season or compare date changes before the previous request settles.
  const abortRef = useRef<AbortController | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);

  // Keep a ref to the live entries so fetchSnapshot can read the latest value
  // without needing entries in its dependency array (avoids re-creating the
  // callback on every render).
  const entriesRef = useRef<LeaderboardEntryResponse[]>(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // ---------------------------------------------------------------------------
  // Load leaderboard entries + seasons list
  // ---------------------------------------------------------------------------

  const fetchLeaderboard = useCallback(async (sid: string | undefined) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch leaderboard + seasons list in parallel.
      const [leaderboardData, seasonsData] = await Promise.all([
        getLeaderboard({ season_id: sid, limit: 100 }, { signal }),
        getSeasons({ signal }),
      ]);

      if (signal.aborted) return;

      setEntries(leaderboardData.data);
      setSeasons(seasonsData.data);
    } catch (err) {
      if (signal.aborted) return;
      setEntries([]);
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load leaderboard.",
          hookName: "useLeaderboard",
        }),
      );
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, []);

  // Re-fetch whenever the season changes.
  useEffect(() => {
    fetchLeaderboard(seasonId);
    return () => abortRef.current?.abort();
  }, [seasonId, fetchLeaderboard]);

  // ---------------------------------------------------------------------------
  // Load snapshot for compare date and compute per-address rank deltas
  // ---------------------------------------------------------------------------

  const fetchSnapshot = useCallback(
    async (date: string, sid: string | undefined) => {
      snapshotAbortRef.current?.abort();
      const controller = new AbortController();
      snapshotAbortRef.current = controller;
      const { signal } = controller;

      setIsSnapshotLoading(true);
      setSnapshotError(null);
      setSnapshotEntries([]);
      setSnapshotDeltas(new Map());

      try {
        const snapshot = await getLeaderboardSnapshot(
          { date, season_id: sid, limit: 100 },
          { signal },
        );

        if (signal.aborted) return;

        setSnapshotEntries(snapshot.data);

        // Compute per-address deltas: snapshot rank − live rank.
        // Positive value = the user moved up since the snapshot date.
        const liveMap = new Map(
          entriesRef.current.map((e) => [e.stellar_address, e.rank]),
        );
        const deltas = new Map<string, number>();
        for (const snap of snapshot.data) {
          const liveRank = liveMap.get(snap.stellar_address);
          if (liveRank !== undefined) {
            deltas.set(snap.stellar_address, snap.rank - liveRank);
          }
        }
        setSnapshotDeltas(deltas);
      } catch (err) {
        if (signal.aborted) return;
        setSnapshotEntries([]);
        setSnapshotError(
          logHookError(err, {
            fallbackMessage: "Failed to load snapshot.",
            hookName: "useLeaderboard/snapshot",
          }),
        );
      } finally {
        if (!signal.aborted) setIsSnapshotLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!compareDate) {
      snapshotAbortRef.current?.abort();
      setSnapshotEntries([]);
      setSnapshotDeltas(new Map());
      setSnapshotError(null);
      setIsSnapshotLoading(false);
      return;
    }
    fetchSnapshot(compareDate, seasonId);
    return () => snapshotAbortRef.current?.abort();
  }, [compareDate, seasonId, fetchSnapshot]);

  // ---------------------------------------------------------------------------
  // Public setters
  // ---------------------------------------------------------------------------

  const setSeasonId = useCallback((id: string | undefined) => {
    setSeasonIdState(id);
    // Clear any compare snapshot when the season changes — the snapshot dates
    // from one season may not be valid for another.
    setCompareDateState(null);
  }, []);

  const setCompareDate = useCallback((date: string | null) => {
    setCompareDateState(date);
  }, []);

  const refetch = useCallback(() => {
    fetchLeaderboard(seasonId);
    if (compareDate) fetchSnapshot(compareDate, seasonId);
  }, [seasonId, compareDate, fetchLeaderboard, fetchSnapshot]);

  return {
    entries,
    seasons,
    seasonId,
    setSeasonId,
    isLoading,
    error,
    isEmpty: !isLoading && !error && entries.length === 0,
    compareDate,
    setCompareDate,
    snapshotEntries,
    isSnapshotLoading,
    snapshotError,
    snapshotDeltas,
    refetch,
  };
}
