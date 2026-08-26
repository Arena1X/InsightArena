import { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The live entry shape — mirrors backend LeaderboardEntryResponse.
 * `rank_delta` is positive when the user moved up (rank number decreased).
 */
export interface LeaderboardEntry {
  rank: number;
  username: string | null;
  stellar_address: string;
  /** Reputation / season score used as the display points value. */
  points: number;
  winRate: number; // 0–100, derived from accuracy_rate string
  predictions: number;
  avatar?: string;
  /**
   * Optional rank movement vs a prior snapshot.
   * Positive = improved (moved up). Null / undefined = no prior data.
   */
  rank_delta?: number | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: {
    badge: "bg-[#F5C451] text-[#0f172a]",
    row: "border-l-2 border-[#F5C451]",
  },
  2: {
    badge: "bg-[#9ca3af] text-[#0f172a]",
    row: "border-l-2 border-[#9ca3af]",
  },
  3: {
    badge: "bg-[#cd7c3a] text-[#0f172a]",
    row: "border-l-2 border-[#cd7c3a]",
  },
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${style.badge}`}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center text-sm font-medium text-gray-500">
      {rank}
    </span>
  );
}

function Avatar({ username }: { username: string | null }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : "??";
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-orange-400 border border-white/10">
      {initials}
    </span>
  );
}

/**
 * Renders a signed rank-change indicator.
 *   ▲ N  emerald  — moved up N positions
 *   ▼ N  rose     — dropped N positions
 *   —    gray     — no change
 *   (nothing)     — no prior snapshot available
 */
export function RankDelta({
  delta,
}: {
  delta: number | null | undefined;
}) {
  if (delta === null || delta === undefined) return null;
  if (delta > 0)
    return (
      <span
        className="text-emerald-400 text-[10px] font-semibold whitespace-nowrap"
        aria-label={`Moved up ${delta} places`}
      >
        ▲ {delta}
      </span>
    );
  if (delta < 0)
    return (
      <span
        className="text-rose-400 text-[10px] font-semibold whitespace-nowrap"
        aria-label={`Dropped ${Math.abs(delta)} places`}
      >
        ▼ {Math.abs(delta)}
      </span>
    );
  return (
    <span className="text-gray-500 text-[10px]" aria-label="No change">
      —
    </span>
  );
}

// Responsive: hide less-important columns on small screens via CSS classes
function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeaderboardTableProps {
  entries?: LeaderboardEntry[];
  currentUser?: string;
  /** When true, render a Δ column showing rank_delta for each entry. */
  showDelta?: boolean;
  isLoading?: boolean;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 rounded bg-white/10" />
        </td>
      ))}
    </tr>
  );
}

export default function LeaderboardTable({
  entries = [],
  currentUser,
  showDelta = false,
  isLoading = false,
}: LeaderboardTableProps) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
      aria-label="Leaderboard table"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead className="border-b border-white/8">
            <tr>
              <Th className="w-14">Rank</Th>
              {showDelta && <Th className="w-12">Δ</Th>}
              <Th>User</Th>
              <Th className="text-right">Points</Th>
              <Th className="text-right hidden sm:table-cell">Win Rate</Th>
              <Th className="text-right hidden md:table-cell">Predictions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <>
                {[...Array(5)].map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </>
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={showDelta ? 6 : 5}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  No entries for this season yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const rowAccent = RANK_STYLES[entry.rank]?.row ?? "";
                const isCurrentUser =
                  currentUser &&
                  (entry.username === currentUser ||
                    entry.stellar_address === currentUser);
                return (
                  <tr
                    key={`${entry.rank}-${entry.stellar_address}`}
                    className={`transition hover:bg-white/[0.03] ${rowAccent} ${entry.rank <= 3 ? "bg-white/[0.02]" : ""} ${isCurrentUser ? "bg-orange-500/10 ring-1 ring-inset ring-orange-500/20" : ""}`}
                  >
                    <td className="px-4 py-3.5">
                      <RankBadge rank={entry.rank} />
                    </td>
                    {showDelta && (
                      <td className="px-4 py-3.5">
                        <RankDelta delta={entry.rank_delta} />
                      </td>
                    )}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar username={entry.username} />
                        <span className="text-sm font-medium text-white truncate max-w-[140px]">
                          {entry.username ?? entry.stellar_address.slice(0, 8) + "…"}
                          {isCurrentUser && (
                            <span className="ml-2 text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                              You
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm font-semibold text-orange-400">
                        {entry.points.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="text-sm text-gray-300">
                        {entry.winRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden md:table-cell">
                      <span className="text-sm text-gray-400">
                        {entry.predictions}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
