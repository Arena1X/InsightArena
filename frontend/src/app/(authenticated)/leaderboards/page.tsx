"use client";

import LeaderboardOverview from "@/component/leaderboard/LeaderboardOverview";
import LeaderboardFilters, {
  LeaderboardFiltersState,
} from "@/component/leaderboard/LeaderboardFilters";
import LeaderboardTable, {
  LeaderboardEntry,
} from "@/component/leaderboard/LeaderboardTable";
import { useState } from "react";
import { Trophy, Medal, Award } from "lucide-react";

// ── Placeholder data ──────────────────────────────────────────────────────────

const CURRENT_USER = "You_Arena";

const ALL_ENTRIES: LeaderboardEntry[] = [
  { rank: 1,  username: "0xArena_Pro",   points: 9840, winRate: 91, predictions: 312 },
  { rank: 2,  username: "CryptoSage",    points: 8720, winRate: 87, predictions: 278 },
  { rank: 3,  username: "PredictKing",   points: 7950, winRate: 83, predictions: 245 },
  { rank: 4,  username: "StarPredictor", points: 6430, winRate: 76, predictions: 198 },
  { rank: 5,  username: "InsightHunter", points: 5870, winRate: 74, predictions: 183 },
  { rank: 6,  username: "MarketWizard",  points: 5210, winRate: 71, predictions: 167 },
  { rank: 7,  username: "OracleX",       points: 4780, winRate: 69, predictions: 154 },
  { rank: 8,  username: "BullsEye99",    points: 4320, winRate: 66, predictions: 141 },
  { rank: 9,  username: "AlphaCall",     points: 3950, winRate: 63, predictions: 129 },
  { rank: 10, username: CURRENT_USER,    points: 3540, winRate: 61, predictions: 118 },
];

const MY_RANK = ALL_ENTRIES.find((e) => e.username === CURRENT_USER)!;

// ── Your Rank Card ────────────────────────────────────────────────────────────

function RankChangeArrow({ delta }: { delta: number }) {
  if (delta > 0)
    return <span className="text-emerald-400 text-xs font-semibold">▲ {delta}</span>;
  if (delta < 0)
    return <span className="text-red-400 text-xs font-semibold">▼ {Math.abs(delta)}</span>;
  return <span className="text-gray-500 text-xs">—</span>;
}

function YourRankCard() {
  return (
    <div className="rounded-xl border border-[#4FD1C5]/30 bg-gradient-to-r from-[#0f2027] to-[#1a2f3a] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-[#4FD1C5]">
          Your Current Rank
        </p>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-extrabold text-white">#{MY_RANK.rank}</span>
          <RankChangeArrow delta={3} />
        </div>
        <p className="text-gray-400 text-sm">
          {MY_RANK.points.toLocaleString()} pts · {MY_RANK.winRate}% win rate ·{" "}
          {MY_RANK.predictions} predictions
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#A78BFA]/20 border border-[#A78BFA]/30 self-start sm:self-auto">
        <span className="text-[#A78BFA] text-xs font-semibold">Gold Tier</span>
      </div>
    </div>
  );
}

// ── Top 3 Podium ──────────────────────────────────────────────────────────────

const PODIUM_DEFS = [
  { icon: <Trophy className="h-6 w-6 text-[#F5C451]" />, color: "border-[#F5C451]", height: "h-24" },
  { icon: <Medal  className="h-5 w-5 text-[#9ca3af]" />, color: "border-[#9ca3af]", height: "h-20" },
  { icon: <Award  className="h-5 w-5 text-[#cd7c3a]" />, color: "border-[#cd7c3a]", height: "h-16" },
];

// Visual order: 2nd (silver), 1st (gold), 3rd (bronze)
const PODIUM_ORDER = [1, 0, 2];

function Top3Podium() {
  const top3 = ALL_ENTRIES.slice(0, 3);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">
        Top 3 Podium
      </h2>
      <div className="flex items-end justify-center gap-6">
        {PODIUM_ORDER.map((idx) => {
          const entry = top3[idx];
          const def = PODIUM_DEFS[idx];
          return (
            <div key={entry.rank} className="flex flex-col items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1e293b] border border-white/10 text-sm font-bold text-white">
                {entry.username.slice(0, 2).toUpperCase()}
              </span>
              <p className="text-xs text-gray-300 font-medium max-w-[72px] truncate text-center">
                {entry.username}
              </p>
              <p className="text-xs text-gray-500">{entry.points.toLocaleString()} pts</p>
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

// ── Season Info Card ──────────────────────────────────────────────────────────

function SeasonInfoCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4 h-full">
      <div className="flex-1 space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Current Season
        </p>
        <p className="text-white font-semibold">Season 4 — Apex</p>
        <p className="text-gray-400 text-sm">
          Ends <span className="text-white">May 31, 2026</span> · Prize pool{" "}
          <span className="text-[#4FD1C5] font-medium">50,000 XLM</span>
        </p>
      </div>
      <a
        href="#"
        className="text-xs font-medium text-[#A78BFA] hover:text-[#c4b5fd] underline underline-offset-2 flex-shrink-0"
      >
        View Season Details →
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaderboardsPage() {
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    timeRange: "weekly",
    category: "all",
    sortBy: "points",
  });

  return (
    <div className="space-y-6">
      <LeaderboardOverview />

      <YourRankCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SeasonInfoCard />
        </div>
        <Top3Podium />
      </div>

      <div className="space-y-4">
        <LeaderboardFilters onChange={setFilters} />
        <LeaderboardTable entries={ALL_ENTRIES} currentUser={CURRENT_USER} />
      </div>
    </div>
  );
}
