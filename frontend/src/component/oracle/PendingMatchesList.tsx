"use client";

import { useState } from "react";
import { Clock, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/component/ui/button";

export interface PendingMatch {
  matchId: string;
  onChainMatchId: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  predictionCount: number;
  eventId: string;
  eventTitle: string;
  timeSinceStartedSeconds: number;
}

interface PendingMatchesListProps {
  matches: PendingMatch[];
  onSubmitResult: (match: PendingMatch) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  batchMode?: boolean;
}

const EVENT_ALL = "__all__";

function formatTimeSince(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
}

export default function PendingMatchesList({
  matches,
  onSubmitResult,
  selectedIds,
  onToggleSelect,
  batchMode = false,
}: PendingMatchesListProps) {
  const [eventFilter, setEventFilter] = useState(EVENT_ALL);
  const [sortKey, setSortKey] = useState<"time_asc" | "time_desc">("time_asc");

  const uniqueEvents = Array.from(
    new Map(matches.map((m) => [m.eventId, m.eventTitle])).entries(),
  );

  const filtered = matches
    .filter(
      (m) => eventFilter === EVENT_ALL || m.eventId === eventFilter,
    )
    .sort((a, b) => {
      const tA = new Date(a.matchTime).getTime();
      const tB = new Date(b.matchTime).getTime();
      return sortKey === "time_asc" ? tA - tB : tB - tA;
    });

  if (matches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/20 bg-slate-900/80 p-10 text-center text-slate-400">
        <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No pending matches requiring results.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          <span className="uppercase tracking-[0.2em]">Filter</span>
        </div>

        <div className="relative flex items-center rounded-2xl border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-slate-300">
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="appearance-none bg-transparent pr-6 text-sm text-white outline-none"
            aria-label="Filter by event"
          >
            <option value={EVENT_ALL}>All Events</option>
            {uniqueEvents.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-slate-500" />
        </div>

        <div className="relative flex items-center rounded-2xl border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-slate-300">
          <select
            value={sortKey}
            onChange={(e) =>
              setSortKey(e.target.value as "time_asc" | "time_desc")
            }
            className="appearance-none bg-transparent pr-6 text-sm text-white outline-none"
            aria-label="Sort matches"
          >
            <option value="time_asc">Oldest First</option>
            <option value="time_desc">Newest First</option>
          </select>
          <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-slate-500" />
        </div>

        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} match{filtered.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Match rows */}
      <div className="space-y-3">
        {filtered.map((match) => (
          <div
            key={match.matchId}
            className={`flex flex-col gap-4 rounded-3xl border p-5 transition sm:flex-row sm:items-center sm:justify-between ${
              batchMode && selectedIds?.has(match.matchId)
                ? "border-amber-400/40 bg-amber-400/5"
                : "border-white/10 bg-slate-900/80"
            }`}
          >
            {batchMode && onToggleSelect && (
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded accent-amber-400"
                checked={selectedIds?.has(match.matchId) ?? false}
                onChange={() => onToggleSelect(match.matchId)}
                aria-label={`Select ${match.teamA} vs ${match.teamB}`}
              />
            )}

            <div className="flex-1 space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {match.eventTitle}
              </p>
              <p className="text-lg font-semibold text-white">
                {match.teamA}{" "}
                <span className="text-slate-400">vs</span>{" "}
                {match.teamB}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(match.matchTime).toLocaleString()}
                </span>
                <span className="text-amber-300/70">
                  Started {formatTimeSince(match.timeSinceStartedSeconds)}
                </span>
                <span>
                  {match.predictionCount} prediction
                  {match.predictionCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {!batchMode && (
              <Button
                type="button"
                onClick={() => onSubmitResult(match)}
                className="shrink-0 rounded-full bg-amber-400 px-5 text-sm text-slate-950 hover:bg-amber-300"
              >
                Submit Result
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
