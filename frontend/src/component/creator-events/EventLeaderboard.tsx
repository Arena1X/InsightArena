"use client";

import { Medal, Trophy, Info } from "lucide-react";
import { useMemo } from "react";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  points: number;
  correctResults: number;
  exactScores: number;
  matchesPlayed: number;
  payout?: string | number;
  earliestPredictionTime?: number; // Unix timestamp (seconds) of earliest prediction for tie-breaking
}

interface EventLeaderboardProps {
  entries: LeaderboardEntry[];
  isFinalized: boolean;
}

export default function EventLeaderboard({ entries, isFinalized }: EventLeaderboardProps) {
  // Detect which entries are tied (same points AND same exactScores)
  const tiedAddresses = useMemo(() => {
    const ties = new Set<string>();
    const groupKey = (e: LeaderboardEntry) => `${e.points}-${e.exactScores}`;
    const groups = new Map<string, LeaderboardEntry[]>();

    for (const entry of entries) {
      const key = groupKey(entry);
      const group = groups.get(key);
      if (group) {
        group.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    // Mark all addresses in groups with 2+ participants as tied
    for (const group of groups.values()) {
      if (group.length >= 2) {
        for (const entry of group) {
          ties.add(entry.address);
        }
      }
    }

    return ties;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 p-8 text-center text-slate-400">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-500" />
        No predictions have been submitted for this event yet.
      </div>
    );
  }

  const gridClass = isFinalized
    ? "grid grid-cols-[0.6fr_1.8fr_1fr_1fr_1fr_1fr_1.2fr] gap-4"
    : "grid grid-cols-[0.6fr_1.8fr_1fr_1fr_1fr_1fr] gap-4";

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/20">
      <div className={`${gridClass} border-b border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 items-center`}>
        <span>Rank</span>
        <span>User address</span>
        <span className="text-right">Points</span>
        <span className="text-right">Correct</span>
        <span className="text-right">Exact</span>
        <span className="text-right">Played</span>
        {isFinalized && <span className="text-right text-emerald-400">Payout</span>}
      </div>

      <div className="divide-y divide-white/10">
        {entries.map((entry) => {
          const isTied = tiedAddresses.has(entry.address);
          const rankDisplay = isTied ? `T-${entry.rank}` : `#${entry.rank}`;

          return (
            <div
              key={`${entry.rank}-${entry.address}`}
              className={`${gridClass} px-5 py-4 text-sm text-slate-300 items-center hover:bg-white/5 transition-colors`}
            >
              <span className="flex items-center gap-2 font-semibold">
                {entry.rank === 1 ? (
                  <Trophy className="h-4 w-4 text-amber-400 animate-pulse" />
                ) : entry.rank === 2 ? (
                  <Medal className="h-4 w-4 text-slate-300" />
                ) : entry.rank === 3 ? (
                  <Medal className="h-4 w-4 text-amber-600" />
                ) : (
                  <span className="w-4 text-center text-xs text-slate-500">{rankDisplay}</span>
                )}
                {entry.rank <= 3 ? (
                  <span
                    className={
                      entry.rank === 1
                        ? "text-amber-400 font-bold"
                        : entry.rank === 2
                          ? "text-slate-300 font-bold"
                          : "text-amber-600 font-bold"
                    }
                  >
                    {rankDisplay}
                  </span>
                ) : (
                  <span className="font-semibold text-slate-400">{rankDisplay}</span>
                )}
                {isTied && (
                  <span
                    className="group relative inline-flex cursor-help"
                    title="Tie-break applied"
                  >
                    <Info className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 transition-colors" />
                    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-6 z-10 w-64 rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-xs text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      <strong className="block mb-1 text-white">Tie-break order:</strong>
                      1. Higher points<br />
                      2. More exact scores<br />
                      3. Earliest correct prediction<br />
                      4. Address comparison
                    </span>
                  </span>
                )}
              </span>
              <span className="truncate font-mono font-medium text-white">{entry.address}</span>
              <span className="text-right font-semibold text-slate-100">{entry.points}</span>
              <span className="text-right text-slate-300">{entry.correctResults}</span>
              <span className="text-right text-slate-300">{entry.exactScores}</span>
              <span className="text-right text-slate-400">{entry.matchesPlayed}</span>
              {isFinalized && (
                <span className="text-right font-bold text-emerald-300">{entry.payout}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
