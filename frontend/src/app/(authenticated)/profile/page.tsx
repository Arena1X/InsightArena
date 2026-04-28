"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  Users,
  TrendingUp,
  Award,
  Star,
  BarChart2,
  Wallet,
} from "lucide-react";
import StatCard from "@/component/rewards/StatCard";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/component/ui/tabs";

// ── Placeholder data ──────────────────────────────────────────────────────────

const USER = {
  username: "You_Arena",
  stellarAddress: "GBXXX...4FD1C5ABCDE",
  joinDate: "January 2026",
  tier: "Gold",
};

const STATS = [
  { label: "Total Predictions", value: "118",       supportingText: "+6 this week",    icon: <BarChart2 className="h-4 w-4" />, valueColor: "text-white" },
  { label: "Win Rate",          value: "61%",        supportingText: "Above average",   icon: <TrendingUp className="h-4 w-4" />, valueColor: "text-emerald-300" },
  { label: "Reputation Score",  value: "3,540",      supportingText: "Top 15%",         icon: <Star className="h-4 w-4" />, valueColor: "text-[#F5C451]" },
  { label: "Total Winnings",    value: "1,125 XLM",  supportingText: "All time",        icon: <Wallet className="h-4 w-4" />, valueColor: "text-[#4FD1C5]" },
  { label: "Season Rank",       value: "#10",        supportingText: "Current season",  icon: <Award className="h-4 w-4" />, valueColor: "text-[#A78BFA]" },
];

const ACHIEVEMENTS = [
  { id: "ach-1", name: "First Blood",      description: "Submit your first prediction",   icon: "🎯", unlocked: true },
  { id: "ach-2", name: "On a Roll",        description: "Win 5 predictions in a row",     icon: "🔥", unlocked: true },
  { id: "ach-3", name: "Market Maker",     description: "Create your first market",       icon: "🏗️",  unlocked: true },
  { id: "ach-4", name: "Diamond Hands",    description: "Hold a prediction for 30+ days", icon: "💎", unlocked: false },
];

const ACTIVE_PREDICTIONS = [
  { id: "p1", title: "Will XLM close above $0.20 this week?", outcome: "Yes",  stake: "50 XLM",  result: "—",          payout: "—" },
  { id: "p2", title: "Bitcoin price above $100k by year end?",  outcome: "No",   stake: "25 XLM",  result: "—",          payout: "—" },
];

const COMPLETED_PREDICTIONS = [
  { id: "p3", title: "Ethereum ETF approval by end of month",    outcome: "Yes",  stake: "75 XLM",  result: "Won",        payout: "142.50 XLM" },
  { id: "p4", title: "Will top 10 DeFi TVL increase this week?", outcome: "Yes",  stake: "30 XLM",  result: "Lost",       payout: "—" },
];

const MARKETS_CREATED = [
  { id: "m1", title: "Will BTC dominate in Q2 2026?", status: "Active",   participants: 34 },
  { id: "m2", title: "XLM price above $0.50 in 2026?", status: "Resolved", participants: 71 },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition font-mono"
      title="Copy Stellar address"
    >
      <span className="truncate max-w-[180px]">{address}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
      ) : (
        <Copy className="h-3.5 w-3.5 flex-shrink-0" />
      )}
    </button>
  );
}

function ProfileHeader() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1e293b] border border-white/10 text-2xl font-extrabold text-[#4FD1C5] flex-shrink-0">
        {USER.username.slice(0, 2).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-white text-xl font-bold">{USER.username}</h1>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/30">
            {USER.tier} Tier
          </span>
        </div>
        <CopyAddress address={USER.stellarAddress} />
        <p className="text-gray-500 text-xs">Member since {USER.joinDate}</p>
      </div>
      <Link
        href="/settings"
        className="self-start sm:self-auto flex-shrink-0 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-gray-300 hover:bg-white/10 transition"
      >
        Edit Profile
      </Link>
    </div>
  );
}

function AchievementShowcase() {
  const unlocked = ACHIEVEMENTS.filter((a) => a.unlocked).slice(0, 3);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Achievements</h2>
        <Link href="/rewards" className="text-xs text-[#A78BFA] hover:text-[#c4b5fd] underline underline-offset-2">
          View All
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {unlocked.map((ach) => (
          <div
            key={ach.id}
            className="flex items-center gap-3 rounded-lg bg-[#0f172a] border border-white/5 p-3"
          >
            <span className="text-2xl">{ach.icon}</span>
            <div>
              <p className="text-white text-xs font-semibold">{ach.name}</p>
              <p className="text-gray-500 text-xs">{ach.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictionRow({
  title,
  outcome,
  stake,
  result,
  payout,
}: {
  title: string;
  outcome: string;
  stake: string;
  result: string;
  payout: string;
}) {
  const resultColor =
    result === "Won" ? "text-emerald-400" : result === "Lost" ? "text-red-400" : "text-gray-400";
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition">
      <td className="px-4 py-3 text-sm text-gray-300 max-w-[220px] truncate">{title}</td>
      <td className="px-4 py-3 text-sm text-white">{outcome}</td>
      <td className="px-4 py-3 text-sm text-gray-400">{stake}</td>
      <td className={`px-4 py-3 text-sm font-medium ${resultColor}`}>{result}</td>
      <td className="px-4 py-3 text-sm text-[#4FD1C5]">{payout}</td>
    </tr>
  );
}

function PredictionHistory() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 space-y-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-white font-semibold text-sm">Prediction History</h2>
      </div>
      <Tabs defaultValue="active" className="px-5 pb-5">
        <TabsList className="mb-4">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Market</th>
                  <th className="px-4 py-2 text-left">Outcome</th>
                  <th className="px-4 py-2 text-left">Stake</th>
                  <th className="px-4 py-2 text-left">Result</th>
                  <th className="px-4 py-2 text-left">Payout</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_PREDICTIONS.map((p) => (
                  <PredictionRow key={p.id} {...p} />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="completed">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Market</th>
                  <th className="px-4 py-2 text-left">Outcome</th>
                  <th className="px-4 py-2 text-left">Stake</th>
                  <th className="px-4 py-2 text-left">Result</th>
                  <th className="px-4 py-2 text-left">Payout</th>
                </tr>
              </thead>
              <tbody>
                {COMPLETED_PREDICTIONS.map((p) => (
                  <PredictionRow key={p.id} {...p} />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors =
    status === "Active"
      ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
      : "bg-gray-400/10 text-gray-400 border-gray-400/20";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
}

function MarketsCreated() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
      <h2 className="text-white font-semibold text-sm">Markets Created</h2>
      <div className="space-y-2">
        {MARKETS_CREATED.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-lg bg-[#0f172a] border border-white/5 px-4 py-3 gap-3"
          >
            <p className="text-sm text-gray-300 truncate">{m.title}</p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="h-3 w-3" /> {m.participants}
              </span>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialStats() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-8">
        <div className="space-y-0.5">
          <p className="text-white font-bold text-xl">48</p>
          <p className="text-gray-500 text-xs">Followers</p>
          <a href="#" className="text-xs text-[#A78BFA] hover:underline">View Followers</a>
        </div>
        <div className="w-px h-10 bg-white/10" />
        <div className="space-y-0.5">
          <p className="text-white font-bold text-xl">31</p>
          <p className="text-gray-500 text-xs">Following</p>
          <a href="#" className="text-xs text-[#A78BFA] hover:underline">View Following</a>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <ProfileHeader />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STATS.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <AchievementShowcase />

      <PredictionHistory />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MarketsCreated />
        </div>
        <SocialStats />
      </div>
    </div>
  );
}
