"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PredictionStatus = "Active" | "Won" | "Lost" | "Pending";
type FilterTab = "All" | "Active" | "Won" | "Lost" | "Pending";

interface Prediction {
  id: string;
  marketTitle: string;
  marketId: string;
  category: string;
  chosenOutcome: string;
  stake: string;
  status: PredictionStatus;
  payout?: string;
  isClaimed?: boolean;
  submittedDate: string;
}

const MOCK_PREDICTIONS: Prediction[] = [
  {
    id: "pred-1",
    marketTitle: "Will XLM close above $0.20 this week?",
    marketId: "mkt-1",
    category: "Crypto",
    chosenOutcome: "Yes",
    stake: "50 XLM",
    status: "Active",
    submittedDate: "2026-04-24",
  },
  {
    id: "pred-2",
    marketTitle: "Bitcoin price above $100k by year end?",
    marketId: "mkt-2",
    category: "Crypto",
    chosenOutcome: "No",
    stake: "25 XLM",
    status: "Active",
    submittedDate: "2026-04-23",
  },
  {
    id: "pred-3",
    marketTitle: "Ethereum ETF approval by end of month",
    marketId: "mkt-3",
    category: "Finance",
    chosenOutcome: "Yes",
    stake: "75 XLM",
    status: "Won",
    payout: "142.50 XLM",
    isClaimed: false,
    submittedDate: "2026-04-15",
  },
  {
    id: "pred-4",
    marketTitle: "Will top 10 DeFi TVL increase this week?",
    marketId: "mkt-4",
    category: "DeFi",
    chosenOutcome: "Yes",
    stake: "30 XLM",
    status: "Lost",
    submittedDate: "2026-04-18",
  },
  {
    id: "pred-5",
    marketTitle: "Stellar network upgrade successful?",
    marketId: "mkt-5",
    category: "Technology",
    chosenOutcome: "Yes",
    stake: "100 XLM",
    status: "Won",
    payout: "185 XLM",
    isClaimed: true,
    submittedDate: "2026-04-10",
  },
  {
    id: "pred-6",
    marketTitle: "NFT market cap to reach $50B this quarter?",
    marketId: "mkt-6",
    category: "NFT",
    chosenOutcome: "No",
    stake: "40 XLM",
    status: "Pending",
    submittedDate: "2026-04-20",
  },
  {
    id: "pred-7",
    marketTitle: "Solana network downtime this month?",
    marketId: "mkt-7",
    category: "Technology",
    chosenOutcome: "No",
    stake: "60 XLM",
    status: "Won",
    payout: "108 XLM",
    isClaimed: false,
    submittedDate: "2026-04-05",
  },
  {
    id: "pred-8",
    marketTitle: "Will gas fees on Ethereum drop below 20 gwei?",
    marketId: "mkt-8",
    category: "Crypto",
    chosenOutcome: "Yes",
    stake: "35 XLM",
    status: "Lost",
    submittedDate: "2026-04-12",
  },
];

const ITEMS_PER_PAGE = 5;

function getStatusBadgeClasses(status: PredictionStatus): string {
  const baseClasses =
    "inline-flex rounded-xl px-2.5 py-1 text-xs font-semibold";

  switch (status) {
    case "Active":
      return `${baseClasses} border border-blue-500/30 bg-blue-500/10 text-blue-200`;
    case "Won":
      return `${baseClasses} border border-emerald-500/30 bg-emerald-500/10 text-emerald-200`;
    case "Lost":
      return `${baseClasses} border border-red-500/30 bg-red-500/10 text-red-200`;
    case "Pending":
      return `${baseClasses} border border-yellow-500/30 bg-yellow-500/10 text-yellow-200`;
    default:
      return `${baseClasses} border border-white/10 bg-white/5 text-gray-200`;
  }
}

function getCategoryBadgeClasses(category: string): string {
  const baseClasses = "inline-flex rounded-xl px-2.5 py-1 text-xs font-medium";

  switch (category) {
    case "Crypto":
      return `${baseClasses} border border-purple-500/30 bg-purple-500/10 text-purple-200`;
    case "Finance":
      return `${baseClasses} border border-cyan-500/30 bg-cyan-500/10 text-cyan-200`;
    case "DeFi":
      return `${baseClasses} border border-pink-500/30 bg-pink-500/10 text-pink-200`;
    case "Technology":
      return `${baseClasses} border border-indigo-500/30 bg-indigo-500/10 text-indigo-200`;
    case "NFT":
      return `${baseClasses} border border-amber-500/30 bg-amber-500/10 text-amber-200`;
    default:
      return `${baseClasses} border border-white/10 bg-white/5 text-gray-200`;
  }
}

export default function MyPredictionsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPredictions = useMemo(() => {
    if (activeFilter === "All") return MOCK_PREDICTIONS;
    return MOCK_PREDICTIONS.filter((pred) => pred.status === activeFilter);
  }, [activeFilter]);

  const totalPages = Math.ceil(filteredPredictions.length / ITEMS_PER_PAGE);
  const paginatedPredictions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPredictions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredPredictions, currentPage]);

  const stats = useMemo(() => {
    const total = MOCK_PREDICTIONS.length;
    const won = MOCK_PREDICTIONS.filter((p) => p.status === "Won").length;
    const lost = MOCK_PREDICTIONS.filter((p) => p.status === "Lost").length;
    const pending = MOCK_PREDICTIONS.filter(
      (p) => p.status === "Pending",
    ).length;

    return {
      total,
      won,
      lost,
      pending,
      wonPercentage: total > 0 ? Math.round((won / total) * 100) : 0,
      lostPercentage: total > 0 ? Math.round((lost / total) * 100) : 0,
      pendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
    };
  }, []);

  const filterCounts = useMemo(() => {
    return {
      All: MOCK_PREDICTIONS.length,
      Active: MOCK_PREDICTIONS.filter((p) => p.status === "Active").length,
      Won: MOCK_PREDICTIONS.filter((p) => p.status === "Won").length,
      Lost: MOCK_PREDICTIONS.filter((p) => p.status === "Lost").length,
      Pending: MOCK_PREDICTIONS.filter((p) => p.status === "Pending").length,
    };
  }, []);

  const handleFilterChange = (filter: FilterTab) => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  const handleClaimPayout = (predictionId: string) => {
    console.log("Claiming payout for prediction:", predictionId);
    // TODO: Implement actual claim logic
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats Row */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">
            Total Predictions
          </h3>
          <p className="mt-3 text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">Won</h3>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-emerald-300">{stats.won}</p>
            <span className="text-sm text-emerald-400">
              ({stats.wonPercentage}%)
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">Lost</h3>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-red-300">{stats.lost}</p>
            <span className="text-sm text-red-400">
              ({stats.lostPercentage}%)
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">Pending</h3>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-yellow-300">
              {stats.pending}
            </p>
            <span className="text-sm text-yellow-400">
              ({stats.pendingPercentage}%)
            </span>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap gap-2">
          {(["All", "Active", "Won", "Lost", "Pending"] as FilterTab[]).map(
            (filter) => (
              <button
                key={filter}
                onClick={() => handleFilterChange(filter)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === filter
                    ? "bg-orange-500 text-white"
                    : "border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10"
                }`}
              >
                {filter}
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                    activeFilter === filter
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-gray-300"
                  }`}
                >
                  {filterCounts[filter]}
                </span>
              </button>
            ),
          )}
        </div>
      </section>

      {/* Predictions List */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-lg font-semibold text-white">
          Your Predictions
        </h2>

        {paginatedPredictions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <span className="text-3xl">📊</span>
            </div>
            <h3 className="mb-2 text-xl font-semibold text-white">
              No predictions found
            </h3>
            <p className="mb-6 max-w-md text-sm text-gray-400">
              {activeFilter === "All"
                ? "You haven't made any predictions yet. Start by browsing available markets."
                : `You don't have any ${activeFilter.toLowerCase()} predictions.`}
            </p>
            <Link
              href="/markets"
              className="inline-flex rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Browse Markets
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedPredictions.map((prediction) => (
              <div
                key={prediction.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-orange-500/40"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/markets/${prediction.marketId}`}
                        className="text-base font-semibold text-white hover:text-orange-300 transition"
                      >
                        {prediction.marketTitle}
                      </Link>
                      <span
                        className={getCategoryBadgeClasses(prediction.category)}
                      >
                        {prediction.category}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-300">
                      <span>
                        Outcome:{" "}
                        <span className="font-semibold text-white">
                          {prediction.chosenOutcome}
                        </span>
                      </span>
                      <span>
                        Stake:{" "}
                        <span className="font-semibold text-white">
                          {prediction.stake}
                        </span>
                      </span>
                      {prediction.payout && (
                        <span>
                          Payout:{" "}
                          <span className="font-semibold text-emerald-300">
                            {prediction.payout}
                          </span>
                        </span>
                      )}
                      <span className="text-gray-400">
                        {new Date(prediction.submittedDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className={getStatusBadgeClasses(prediction.status)}>
                      {prediction.status}
                    </span>

                    {prediction.status === "Won" && !prediction.isClaimed && (
                      <button
                        onClick={() => handleClaimPayout(prediction.id)}
                        className="inline-flex rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                      >
                        Claim Payout
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {paginatedPredictions.length > 0 && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6">
            <p className="text-sm text-gray-400">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
