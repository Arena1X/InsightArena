"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { FileText, Bookmark, Search } from "lucide-react";
import { EmptyState } from "@/component/ui/empty-state";

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
