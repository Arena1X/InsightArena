"use client";

import { useEffect, useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { FileText, Bookmark, Search } from "lucide-react";
import { EmptyState } from "@/component/ui/empty-state";
import { formatXlm } from "@/component/PrizePoolSummary";
import { useWallet } from "@/context/WalletContext";
import {
  aggregateCreatorMetrics,
  getCreatorMarkets,
  sortCreatorMarkets,
  toCreatorMarketMetrics,
  type CreatorMarketMetrics,
  type CreatorMarketResolution,
  type CreatorMarketSortKey,
} from "@/lib/api";

type MarketStatus = "Open" | "Resolved" | "Cancelled";
type Tab = "All Markets" | "My Markets" | "Bookmarked";

interface Market {
  id: string;
  title: string;
  category: string;
  status: MarketStatus;
  endsAt: string;
  pool: string;
  participants: number;
  yesPercent: number;
  myPrediction?: string;
  bookmarked?: boolean;
  createdByMe?: boolean;
}

const PLACEHOLDER_MARKETS: Market[] = [
  { id: "1", title: "Will XLM close above $0.25 this month?", category: "Crypto", status: "Open", endsAt: "3d 12h", pool: "4,200 XLM", participants: 84, yesPercent: 62, myPrediction: "YES" },
  { id: "2", title: "Bitcoin price above $100k by year end?", category: "Crypto", status: "Open", endsAt: "18d 5h", pool: "12,800 XLM", participants: 312, yesPercent: 55, bookmarked: true },
  { id: "3", title: "Ethereum ETF approval in Q3?", category: "Finance", status: "Open", endsAt: "25d 0h", pool: "7,500 XLM", participants: 147, yesPercent: 48, createdByMe: true },
  { id: "4", title: "Argentina wins Copa América 2025?", category: "Sports", status: "Open", endsAt: "10d 8h", pool: "3,100 XLM", participants: 92, yesPercent: 71, bookmarked: true },
  { id: "5", title: "OpenAI releases GPT-5 before July?", category: "Tech", status: "Resolved", endsAt: "Ended", pool: "5,600 XLM", participants: 203, yesPercent: 100 },
  { id: "6", title: "US Fed cuts rates in September meeting?", category: "Finance", status: "Open", endsAt: "45d 3h", pool: "9,000 XLM", participants: 275, yesPercent: 39, myPrediction: "NO", createdByMe: true },
];

const STATUS_COLORS: Record<MarketStatus, string> = {
  Open: "bg-emerald-500/20 text-emerald-400",
  Resolved: "bg-blue-500/20 text-blue-400",
  Cancelled: "bg-red-500/20 text-red-400",
};

const EMPTY_STATE_CONFIG: Record<Tab, { icon: ReactNode; title: string; description: string }> = {
  "My Markets": {
    icon: <FileText className="h-7 w-7" />,
    title: "No markets created yet",
    description: "Create your first prediction market to get started.",
  },
  Bookmarked: {
    icon: <Bookmark className="h-7 w-7" />,
    title: "No bookmarks yet",
    description: "Bookmark markets to find them quickly later.",
  },
  "All Markets": {
    icon: <Search className="h-7 w-7" />,
    title: "No markets match your filters",
    description: "Try adjusting your search or filters.",
  },
};

const RESOLUTION_LABELS: Record<CreatorMarketResolution, { label: string; className: string }> = {
  open: { label: "Open", className: STATUS_COLORS.Open },
  resolved: { label: "Resolved", className: STATUS_COLORS.Resolved },
  cancelled: { label: "Cancelled", className: STATUS_COLORS.Cancelled },
};

const CREATOR_SORT_OPTIONS: { key: CreatorMarketSortKey; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "recent", label: "Recent" },
];

function CreatorAnalyticsPanel() {
  const { address } = useWallet();
  const [markets, setMarkets] = useState<CreatorMarketMetrics[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [sortKey, setSortKey] = useState<CreatorMarketSortKey>("volume");

  useEffect(() => {
    if (!address) {
      setStatus("idle");
      setMarkets([]);
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    getCreatorMarkets(address, { signal: controller.signal })
      .then((res) => {
        setMarkets(res.data.map(toCreatorMarketMetrics));
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [address]);

  const totals = useMemo(() => aggregateCreatorMetrics(markets), [markets]);
  const sorted = useMemo(() => sortCreatorMarkets(markets, sortKey), [markets, sortKey]);

  if (!address) {
    return (
      <section aria-label="Creator analytics" className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
        Connect your wallet to see analytics for the markets you created.
      </section>
    );
  }

  return (
    <section aria-label="Creator analytics" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Creator Analytics</h2>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1" role="group" aria-label="Sort created markets">
          {CREATOR_SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              aria-pressed={sortKey === option.key}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                sortKey === option.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm" data-testid="creator-totals">
        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
          <dt className="text-gray-400">Total volume</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="total-volume">{formatXlm(totals.volumeXlm)}</dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
          <dt className="text-gray-400">Participants</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="total-participants">{totals.participants.toLocaleString()}</dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
          <dt className="text-gray-400">Fees earned</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="total-fees">{formatXlm(totals.feesEarnedXlm)}</dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
          <dt className="text-gray-400">Resolved</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="total-resolved">
            {totals.resolvedCount} / {totals.marketCount}
          </dd>
        </div>
      </dl>

      {status === "loading" && <p className="text-sm text-gray-400">Loading market metrics…</p>}
      {status === "error" && <p className="text-sm text-red-400" role="alert">Couldn&apos;t load market metrics.</p>}
      {status === "ready" && sorted.length === 0 && (
        <p className="text-sm text-gray-400">You haven&apos;t created any markets yet.</p>
      )}

      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Market</th>
                <th className="py-2 pr-3 font-medium">Volume</th>
                <th className="py-2 pr-3 font-medium">Participants</th>
                <th className="py-2 pr-3 font-medium">Fees earned</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((market) => (
                <tr key={market.id} data-testid="creator-market-row" className="border-t border-white/5 text-gray-300">
                  <td className="py-2 pr-3 text-white">{market.title}</td>
                  <td className="py-2 pr-3">{formatXlm(market.volumeXlm)}</td>
                  <td className="py-2 pr-3">{market.participants.toLocaleString()}</td>
                  <td className="py-2 pr-3">{formatXlm(market.feesEarnedXlm)}</td>
                  <td className="py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RESOLUTION_LABELS[market.resolutionStatus].className}`}>
                      {RESOLUTION_LABELS[market.resolutionStatus].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("All Markets");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | MarketStatus>("All");
  const [sort, setSort] = useState("Newest");

  const categories = ["All", ...Array.from(new Set(PLACEHOLDER_MARKETS.map((m) => m.category)))];

  const filtered = useMemo(() => {
    let list = PLACEHOLDER_MARKETS;
    if (activeTab === "My Markets") list = list.filter((m) => m.createdByMe);
    if (activeTab === "Bookmarked") list = list.filter((m) => m.bookmarked);
    if (search) list = list.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));
    if (categoryFilter !== "All") list = list.filter((m) => m.category === categoryFilter);
    if (statusFilter !== "All") list = list.filter((m) => m.status === statusFilter);
    if (sort === "Popular") list = [...list].sort((a, b) => b.participants - a.participants);
    if (sort === "Ending Soon") list = [...list].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
    return list;
  }, [activeTab, search, categoryFilter, statusFilter, sort]);

  const isEmpty = filtered.length === 0;

  function clearFilters() {
    setSearch("");
    setCategoryFilter("All");
    setStatusFilter("All");
    setSort("Newest");
  }

  const hasActiveFilters =
    search !== "" || categoryFilter !== "All" || statusFilter !== "All" || sort !== "Newest";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Markets</h1>
          <p className="text-sm text-gray-400">Browse and predict on live prediction markets.</p>
        </div>
        <Link
          href="/markets/create"
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-400 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          + Create Market
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-white/5 p-1 w-fit">
        {(["All Markets", "My Markets", "Bookmarked"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:outline-none">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:outline-none">
          {["All", "Open", "Resolved", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:outline-none">
          {["Newest", "Popular", "Ending Soon"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {activeTab === "My Markets" && <CreatorAnalyticsPanel />}

      {/* Empty State */}
      {isEmpty && (
        <EmptyState
          icon={EMPTY_STATE_CONFIG[activeTab].icon}
          title={EMPTY_STATE_CONFIG[activeTab].title}
          description={EMPTY_STATE_CONFIG[activeTab].description}
          action={
            activeTab === "My Markets" ? { label: "Create Market", href: "/markets/create" } : undefined
          }
          secondaryAction={
            hasActiveFilters ? { label: "Clear Filters", onClick: clearFilters } : undefined
          }
        />
      )}

      {/* Markets Grid */}
      {!isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((market) => (
            <div key={market.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 hover:border-blue-500/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{market.category}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[market.status]}`}>{market.status}</span>
              </div>
              <p className="text-sm font-medium text-white leading-snug">{market.title}</p>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>⏱ {market.endsAt}</span>
                <span>👥 {market.participants}</span>
                <span>💰 {market.pool}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>YES {market.yesPercent}%</span>
                  <span>NO {100 - market.yesPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${market.yesPercent}%` }} />
                </div>
              </div>
              {market.myPrediction && (
                <p className="text-xs text-yellow-400 font-medium">You predicted: {market.myPrediction}</p>
              )}
              <button className="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 py-1.5 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors">
                {market.status === "Open" ? "Predict" : "View"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
