"use client";

import { useState } from "react";
import { Trophy, Medal, Award, GitCompare, X } from "lucide-react";
import LeaderboardOverview from "@/component/leaderboard/LeaderboardOverview";
import LeaderboardFilters from "@/component/leaderboard/LeaderboardFilters";
import LeaderboardTable, {
  type LeaderboardEntry,
  RankDelta,
} from "@/component/leaderboard/LeaderboardTable";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import type { LeaderboardEntryResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a backend LeaderboardEntryResponse to the table's LeaderboardEntry. */
function toTableEntry(
  e: LeaderboardEntryResponse,
  overrideDelta?: number | null,
): LeaderboardEntry {
  return {
    rank: e.rank,
    username: e.username,
    stellar_address: e.stellar_address,
    points: e.season_points ?? e.reputation_score,
    winRate: Math.round(parseFloat(e.accuracy_rate)),
    predictions: 0, // not returned by the list endpoint; omit cleanly
    rank_delta: overrideDelta !== undefined ? overrideDelta : e.rank_delta,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RankChangeArrow({ delta }: { delta: number | null | undefined }) {
  return <RankDelta delta={delta} />;
}

function YourRankCard({
  rank,
  delta,
  points,
  winRate,
}: {
  rank: number;
  delta?: number | null;
  points: number;
  winRate: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-orange-400">
          Your Current Rank
        </p>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-extrabold text-white">#{rank}</span>
          <RankChangeArrow delta={delta} />
        </div>
        <p className="text-gray-400 text-sm">
          {points.toLocaleString()} pts · {winRate}% win rate
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 self-start sm:self-auto">
        <span className="text-gray-300 text-xs font-semibold">Gold Tier</span>
      </div>
    </div>
  );
}

const PODIUM_DEFS = [
  {
    icon: <Trophy className="h-6 w-6 text-[#F5C451]" />,
    color: "border-[#F5C451]",
    height: "h-24",
  },
  {
    icon: <Medal className="h-5 w-5 text-[#9ca3af]" />,
    color: "border-[#9ca3af]",
    height: "h-20",
  },
  {
    icon: <Award className="h-5 w-5 text-[#cd7c3a]" />,
    color: "border-[#cd7c3a]",
    height: "h-16",
  },
];

// Visual order: 2nd (silver), 1st (gold), 3rd (bronze)
const PODIUM_ORDER = [1, 0, 2];

function Top3Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  if (top3.length < 3) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">
        Top 3 Podium
      </h2>
      <div className="flex items-end justify-center gap-6">
        {PODIUM_ORDER.map((idx) => {
          const entry = top3[idx];
          if (!entry) return null;
          const def = PODIUM_DEFS[idx];
          return (
            <div key={entry.rank} className="flex flex-col items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 border border-white/10 text-sm font-bold text-white">
                {(entry.username ?? entry.stellar_address)
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <p className="text-xs text-gray-300 font-medium max-w-[72px] truncate text-center">
                {entry.username ?? entry.stellar_address.slice(0, 8) + "…"}
              </p>
              <p className="text-xs text-gray-500">
                {entry.points.toLocaleString()} pts
              </p>
              <div
                className={`w-16 rounded-t-lg border-t-2 ${def.color} ${def.height} bg-white/5 flex items-start justify-center pt-2`}
              >
                {def.icon}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeasonInfoCard({
  seasonName,
  endsAt,
  rewardPool,
}: {
  seasonName: string;
  endsAt?: string;
  rewardPool?: string;
}) {
  const poolXlm = rewardPool
    ? (Number(rewardPool) / 10_000_000).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })
    : null;
  const endDate = endsAt
    ? new Date(endsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4 h-full">
      <div className="flex-1 space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Season
        </p>
        <p className="text-white font-semibold">{seasonName}</p>
        {(endDate || poolXlm) && (
          <p className="text-gray-400 text-sm">
            {endDate && (
              <>
                Ends <span className="text-white">{endDate}</span>
              </>
            )}
            {endDate && poolXlm && " · "}
            {poolXlm && (
              <>
                Prize pool{" "}
                <span className="text-orange-400 font-medium">
                  {poolXlm} XLM
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshot Compare Panel
// ---------------------------------------------------------------------------

function SnapshotComparePanel({
  compareDate,
  onDateChange,
  onClear,
  isLoading,
  error,
  entryCount,
}: {
  compareDate: string | null;
  onDateChange: (date: string) => void;
  onClear: () => void;
  isLoading: boolean;
  error: string | null;
  entryCount: number;
}) {
  // Today minus 1 day as the max selectable date (snapshots are at least 1 day old)
  const maxDate = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      data-testid="snapshot-compare-panel"
    >
      <GitCompare className="h-4 w-4 text-orange-400 flex-shrink-0" />
      <span className="text-xs font-medium text-gray-300">Compare to</span>

      <input
        type="date"
        aria-label="Snapshot comparison date"
        value={compareDate ?? ""}
        max={maxDate}
        onChange={(e) => e.target.value && onDateChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500/50 cursor-pointer"
      />

      {compareDate && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear snapshot comparison"
          className="text-gray-500 hover:text-gray-300 transition"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {isLoading && (
        <span className="text-xs text-gray-500 animate-pulse">
          Loading snapshot…
        </span>
      )}
      {error && (
        <span className="text-xs text-rose-400">{error}</span>
      )}
      {!isLoading && !error && compareDate && entryCount > 0 && (
        <span className="text-xs text-gray-500">
          Showing Δ vs {compareDate}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LeaderboardsPage() {
  const {
    entries,
    seasons,
    seasonId,
    setSeasonId,
    isLoading,
    error,
    isEmpty,
    compareDate,
    setCompareDate,
    snapshotDeltas,
    isSnapshotLoading,
    snapshotError,
  } = useLeaderboard();

  const [showCompare, setShowCompare] = useState(false);

  // Derive the display name for the currently selected season.
  const selectedSeason = seasons.find((s) => s.id === seasonId);
  const seasonName = selectedSeason?.name ?? "All Time";

  // Map live API entries to the table shape, injecting snapshot deltas when
  // the compare panel is active.
  const tableEntries: LeaderboardEntry[] = entries.map((e) => {
    const snapshotDelta = compareDate
      ? (snapshotDeltas.get(e.stellar_address) ?? null)
      : undefined;
    return toTableEntry(e, snapshotDelta);
  });

  const top3 = tableEntries.slice(0, 3);

  // The "your rank" card — use the first entry that could be "you" (no wallet
  // context here; show the top entry as a demo when no wallet is connected).
  const myEntry = tableEntries[0];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeaderboardOverview />

      {/* Your rank card — only when we have live data */}
      {!isLoading && myEntry && (
        <YourRankCard
          rank={myEntry.rank}
          delta={myEntry.rank_delta}
          points={myEntry.points}
          winRate={myEntry.winRate}
        />
      )}

      {/* Season info + podium */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SeasonInfoCard
            seasonName={seasonName}
            endsAt={selectedSeason?.ends_at}
            rewardPool={selectedSeason?.reward_pool_stroops}
          />
        </div>
        {!isLoading && <Top3Podium top3={top3} />}
      </div>

      {/* Snapshot compare toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Rankings</h2>
        <button
          type="button"
          onClick={() => {
            setShowCompare((v) => !v);
            if (showCompare) setCompareDate(null);
          }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
            showCompare
              ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
              : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
          }`}
          aria-pressed={showCompare}
          data-testid="compare-toggle"
        >
          <GitCompare className="h-3.5 w-3.5" />
          Compare Snapshot
        </button>
      </div>

      {showCompare && (
        <SnapshotComparePanel
          compareDate={compareDate}
          onDateChange={setCompareDate}
          onClear={() => setCompareDate(null)}
          isLoading={isSnapshotLoading}
          error={snapshotError}
          entryCount={snapshotDeltas.size}
        />
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Filters + table */}
      <div className="space-y-4">
        <LeaderboardFilters
          seasons={seasons}
          onChange={(f) => setSeasonId(f.seasonId)}
        />
        <LeaderboardTable
          entries={tableEntries}
          isLoading={isLoading}
          showDelta={showCompare && snapshotDeltas.size > 0}
        />
        {isEmpty && !isLoading && (
          <p className="text-center text-sm text-gray-500 py-4">
            No leaderboard data for this season yet.
          </p>
        )}
      </div>
    </div>
  );
}
