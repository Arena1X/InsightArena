import { ReactNode } from "react";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  winRate: number; // 0–100
  predictions: number;
  avatar?: string;
}

const DEFAULT_ENTRIES: LeaderboardEntry[] = [
  { rank: 1, username: "0xArena_Pro",   points: 9840, winRate: 91, predictions: 312 },
  { rank: 2, username: "CryptoSage",    points: 8720, winRate: 87, predictions: 278 },
  { rank: 3, username: "PredictKing",   points: 7950, winRate: 83, predictions: 245 },
  { rank: 4, username: "StarPredictor", points: 6430, winRate: 76, predictions: 198 },
  { rank: 5, username: "InsightHunter", points: 5870, winRate: 74, predictions: 183 },
  { rank: 6, username: "MarketWizard",  points: 5210, winRate: 71, predictions: 167 },
  { rank: 7, username: "OracleX",       points: 4780, winRate: 69, predictions: 154 },
  { rank: 8, username: "BullsEye99",    points: 4320, winRate: 66, predictions: 141 },
  { rank: 9, username: "AlphaCall",     points: 3950, winRate: 63, predictions: 129 },
  { rank: 10, username: "ZenTrader",    points: 3540, winRate: 61, predictions: 118 },
];

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: { badge: "bg-[#F5C451] text-[#0f172a]",        row: "border-l-2 border-[#F5C451]" },
  2: { badge: "bg-[#9ca3af] text-[#0f172a]",        row: "border-l-2 border-[#9ca3af]" },
  3: { badge: "bg-[#cd7c3a] text-[#0f172a]",        row: "border-l-2 border-[#cd7c3a]" },
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${style.badge}`}>
        {rank}
      </span>
    );
  }
  return <span className="inline-flex h-7 w-7 items-center justify-center text-sm font-medium text-gray-500">{rank}</span>;
}

function Avatar({ username }: { username: string }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1e293b] text-xs font-semibold text-[#4FD1C5] border border-white/10">
      {username.slice(0, 2).toUpperCase()}
    </span>
  );
}

// Responsive: hide less-important columns on small screens via CSS classes
function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

interface LeaderboardTableProps {
  entries?: LeaderboardEntry[];
}

export default function LeaderboardTable({ entries = DEFAULT_ENTRIES }: LeaderboardTableProps) {
  return (
    <div className="rounded-2xl border border-gray-700/30 bg-[#0f172a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead className="border-b border-white/8">
            <tr>
              <Th className="w-14">Rank</Th>
              <Th>User</Th>
              <Th className="text-right">Points</Th>
              <Th className="text-right hidden sm:table-cell">Win Rate</Th>
              <Th className="text-right hidden md:table-cell">Predictions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.map((entry) => {
              const rowAccent = RANK_STYLES[entry.rank]?.row ?? "";
              return (
                <tr
                  key={entry.rank}
                  className={`transition hover:bg-white/[0.03] ${rowAccent} ${entry.rank <= 3 ? "bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-3.5">
                    <RankBadge rank={entry.rank} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar username={entry.username} />
                      <span className="text-sm font-medium text-white truncate max-w-[140px]">
                        {entry.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-[#4FD1C5]">
                      {entry.points.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <span className="text-sm text-gray-300">{entry.winRate}%</span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden md:table-cell">
                    <span className="text-sm text-gray-400">{entry.predictions}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
