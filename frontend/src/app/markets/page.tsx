"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  Filter,
  Radio,
  Search,
  Sparkles,
} from "lucide-react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

type MarketCategory = "All" | "Crypto" | "Sports" | "Politics" | "Culture";
type MarketSort = "volume" | "liquidity" | "endingSoon" | "momentum";

type Market = {
  id: string;
  title: string;
  category: Exclude<MarketCategory, "All">;
  liquidity: number;
  volume: number;
  probability: number;
  endsInHours: number;
  traders: number;
  description: string;
};

const INITIAL_MARKETS: Market[] = [
  {
    id: "btc-50k",
    title: "Will Bitcoin close above $50k this week?",
    category: "Crypto",
    liquidity: 186000,
    volume: 524000,
    probability: 68,
    endsInHours: 18,
    traders: 2431,
    description:
      "Track community conviction on Bitcoin momentum heading into the weekend close.",
  },
  {
    id: "sol-etf",
    title: "Will a Solana ETF receive approval before quarter end?",
    category: "Crypto",
    liquidity: 132000,
    volume: 301500,
    probability: 54,
    endsInHours: 52,
    traders: 1810,
    description:
      "A high-attention market covering regulatory sentiment and ecosystem momentum.",
  },
  {
    id: "arsenal-title",
    title: "Will Arsenal finish top of the league this season?",
    category: "Sports",
    liquidity: 98000,
    volume: 268200,
    probability: 49,
    endsInHours: 74,
    traders: 1442,
    description:
      "A season-long sports market with active back-and-forth movement after every matchday.",
  },
  {
    id: "election-debate",
    title: "Will the front-runner win the next televised debate?",
    category: "Politics",
    liquidity: 145500,
    volume: 421300,
    probability: 61,
    endsInHours: 36,
    traders: 1963,
    description:
      "Public sentiment market tied to live debate reactions and polling shifts.",
  },
  {
    id: "streaming-record",
    title: "Will the next blockbuster break the opening-week streaming record?",
    category: "Culture",
    liquidity: 64000,
    volume: 154600,
    probability: 43,
    endsInHours: 96,
    traders: 1189,
    description:
      "Entertainment prediction market focused on early release performance and hype conversion.",
  },
  {
    id: "eth-gas-drop",
    title: "Will average ETH gas fees stay below 8 gwei for 7 straight days?",
    category: "Crypto",
    liquidity: 111000,
    volume: 286400,
    probability: 57,
    endsInHours: 28,
    traders: 1655,
    description:
      "A technical market for traders watching network usage and Layer 2 migration trends.",
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getSortedMarkets(markets: Market[], sortBy: MarketSort) {
  const sorted = [...markets];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case "liquidity":
        return b.liquidity - a.liquidity;
      case "endingSoon":
        return a.endsInHours - b.endsInHours;
      case "momentum":
        return Math.abs(b.probability - 50) - Math.abs(a.probability - 50);
      case "volume":
      default:
        return b.volume - a.volume;
    }
  });

  return sorted;
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState(INITIAL_MARKETS);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const [sortBy, setSortBy] = useState<MarketSort>("volume");
  const [selectedId, setSelectedId] = useState(INITIAL_MARKETS[0].id);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMarkets((current) =>
        current.map((market, index) => {
          const swing = ((index % 3) - 1) * 2;
          const nextProbability = Math.min(
            89,
            Math.max(11, market.probability + swing)
          );

          return {
            ...market,
            probability: nextProbability,
            volume: market.volume + 800 + index * 140,
            liquidity: market.liquidity + 320 + index * 90,
            traders: market.traders + (index % 2),
            endsInHours: Math.max(2, market.endsInHours - 1),
          };
        })
      );
      setLastUpdated(new Date());
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return getSortedMarkets(
      markets.filter((market) => {
        const matchesCategory =
          category === "All" ? true : market.category === category;
        const matchesQuery =
          normalizedQuery.length === 0
            ? true
            : `${market.title} ${market.description}`
                .toLowerCase()
                .includes(normalizedQuery);

        return matchesCategory && matchesQuery;
      }),
      sortBy
    );
  }, [category, markets, query, sortBy]);

  useEffect(() => {
    if (!filteredMarkets.some((market) => market.id === selectedId)) {
      setSelectedId(filteredMarkets[0]?.id ?? "");
    }
  }, [filteredMarkets, selectedId]);

  const selectedMarket =
    filteredMarkets.find((market) => market.id === selectedId) ??
    filteredMarkets[0];

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <PageBackground />

      <div className="relative z-10">
        <Header />

        <main className="mx-auto max-w-7xl px-6 pt-32 pb-16">
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-white/10 bg-[#111726]/80 p-8 backdrop-blur">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#4FD1C5]/20 bg-[#4FD1C5]/10 px-4 py-2 text-sm font-medium text-[#7ce7de]">
                    <Radio className="h-4 w-4" />
                    Live public markets
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    Explore active prediction markets in real time
                  </h1>
                  <p className="max-w-2xl text-base text-[#9aa4bc] sm:text-lg">
                    Discover trending questions across crypto, sports,
                    politics, and culture, then drill into market depth before
                    you make a call.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4 text-sm text-[#cfd8ea]">
                  <p className="font-semibold text-white">Pulse updated</p>
                  <p className="mt-1 text-[#8b96b0]">
                    {lastUpdated.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_380px]">
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-white/10 bg-[#0f172a]/90 p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#70809f]" />
                      <input
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search markets by title or theme"
                        className="w-full rounded-2xl border border-white/10 bg-[#111726] py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#70809f]"
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111726] px-4 py-3 text-sm text-[#cdd6e8]">
                        <Filter className="h-4 w-4 text-[#4FD1C5]" />
                        <select
                          value={category}
                          onChange={(event) =>
                            setCategory(event.target.value as MarketCategory)
                          }
                          className="bg-transparent text-sm text-white outline-none"
                          aria-label="Filter markets by category"
                        >
                          {["All", "Crypto", "Sports", "Politics", "Culture"].map(
                            (value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111726] px-4 py-3 text-sm text-[#cdd6e8]">
                        <Sparkles className="h-4 w-4 text-[#A78BFA]" />
                        <select
                          value={sortBy}
                          onChange={(event) =>
                            setSortBy(event.target.value as MarketSort)
                          }
                          className="bg-transparent text-sm text-white outline-none"
                          aria-label="Sort markets"
                        >
                          <option value="volume">Sort by volume</option>
                          <option value="liquidity">Sort by liquidity</option>
                          <option value="endingSoon">Ending soon</option>
                          <option value="momentum">Highest momentum</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  {filteredMarkets.map((market) => (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => setSelectedId(market.id)}
                      className={`rounded-[1.75rem] border p-6 text-left transition ${
                        selectedId === market.id
                          ? "border-[#4FD1C5]/50 bg-[#132033] shadow-[0_20px_60px_rgba(1,8,20,0.35)]"
                          : "border-white/10 bg-[#111726]/90 hover:border-white/20 hover:bg-[#141c2c]"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3">
                          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#8ea0bf]">
                            {market.category}
                          </div>
                          <h2 className="text-xl font-semibold text-white">
                            {market.title}
                          </h2>
                          <p className="text-sm leading-6 text-[#94a3b8]">
                            {market.description}
                          </p>
                        </div>

                        <div className="grid min-w-[180px] grid-cols-2 gap-3 text-sm">
                          <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3">
                            <p className="text-[#70809f]">Volume</p>
                            <p className="mt-1 font-semibold text-white">
                              {formatMoney(market.volume)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3">
                            <p className="text-[#70809f]">Liquidity</p>
                            <p className="mt-1 font-semibold text-white">
                              {formatMoney(market.liquidity)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="w-full max-w-md">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[#8ea0bf]">Bullish odds</span>
                            <span className="font-semibold text-[#4FD1C5]">
                              {market.probability}%
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 rounded-full bg-white/10">
                            <div
                              className="h-2.5 rounded-full bg-gradient-to-r from-[#43c3be] to-[#67e8f9]"
                              style={{ width: `${market.probability}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-5 text-sm text-[#b8c3db]">
                          <span className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-[#4FD1C5]" />
                            {market.endsInHours}h left
                          </span>
                          <span>{market.traders.toLocaleString()} traders</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <aside className="space-y-6">
                {selectedMarket ? (
                  <div className="sticky top-28 space-y-6 rounded-[1.75rem] border border-white/10 bg-[#111726]/92 p-6 backdrop-blur">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4FD1C5]">
                        Market preview
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-white">
                        {selectedMarket.title}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-[#94a3b8]">
                        {selectedMarket.description}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">Current probability</p>
                        <p className="mt-2 text-3xl font-bold text-[#4FD1C5]">
                          {selectedMarket.probability}%
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">Live liquidity</p>
                        <p className="mt-2 text-2xl font-bold text-white">
                          {formatMoney(selectedMarket.liquidity)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">24h volume</p>
                        <p className="mt-2 text-2xl font-bold text-white">
                          {formatMoney(selectedMarket.volume)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">Participants</p>
                        <p className="mt-2 text-2xl font-bold text-white">
                          {selectedMarket.traders.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f9e9d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#38adaa]"
                    >
                      View market details
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </aside>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
