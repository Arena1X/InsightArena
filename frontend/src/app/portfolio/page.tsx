"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, Wallet, TrendingUp, TrendingDown } from "lucide-react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";
import { InteractiveChart, type ChartSeries } from "@/component/ui/interactive-chart";
import { useWallet } from "@/context/WalletContext";
import {
  usePortfolio,
  usePnlHistory,
  type PositionStatus,
  type SortField,
  type SortDirection,
  type TimeRange,
} from "@/hooks/usePortfolio";
import {
  computePositionPnl,
  downloadCsv,
  positionsToCsv,
  sumPnlBreakdown,
  fillSparseHistory,
  formatPnlForChart,
} from "@/lib/utils";

const STATUS_FILTERS: { label: string; value: PositionStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Settled", value: "settled" },
];

const SORT_OPTIONS: { label: string; field: SortField }[] = [
  { label: "Stake", field: "stake" },
  { label: "Current Value", field: "current_value" },
  { label: "P&L", field: "pnl" },
];

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

function formatStroops(stroops: string): string {
  const num = Number(stroops);
  if (Number.isNaN(num)) return "0";
  return (num / 10_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPnlAmount(num: number): { text: string; className: string } {
  if (Number.isNaN(num) || num === 0)
    return { text: "0 XLM", className: "text-gray-400" };
  const formatted = `${num > 0 ? "+" : ""}${(num / 10_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
  return {
    text: formatted,
    className: num > 0 ? "text-green-400" : "text-red-400",
  };
}

function formatPnl(pnl: string): { text: string; className: string } {
  const num = Number(pnl);
  return formatPnlAmount(Number.isNaN(num) ? 0 : num);
}

const STATUS_BADGE: Record<PositionStatus, string> = {
  open: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  settled: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export default function PortfolioPage() {
  const { address, isAuthenticated } = useWallet();
  const [statusFilter, setStatusFilter] = useState<PositionStatus | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortField>("stake");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const effectiveAddress = address ?? "";

  const { positions, total, isLoading, error } = usePortfolio({
    address: effectiveAddress,
    status: statusFilter === "all" ? undefined : statusFilter,
    sortBy,
    sortDir,
    page,
    limit: 20,
  });

  const { history, summary, isLoading: isLoadingHistory, error: historyError } = usePnlHistory({
    address: effectiveAddress,
    range: timeRange,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / 20)),
    [total],
  );

  const pnlTotals = useMemo(() => sumPnlBreakdown(positions), [positions]);

  // Transform history data into chart series with sparse data handling
  const chartSeries = useMemo((): ChartSeries[] => {
    if (!history || history.length === 0) return [];

    // Fill sparse data for smoother visualization
    const filledHistory = fillSparseHistory(history, timeRange);

    return [
      {
        id: "realized",
        name: "Realized P/L",
        data: filledHistory.map((point) => ({
          label: new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: point.realized_pnl / 10_000_000, // Convert stroops to XLM
          date: point.date,
        })),
        color: "#10b981", // Green
      },
      {
        id: "unrealized",
        name: "Unrealized P/L",
        data: filledHistory.map((point) => ({
          label: new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: point.unrealized_pnl / 10_000_000, // Convert stroops to XLM
          date: point.date,
        })),
        color: "#f59e0b", // Orange
      },
      {
        id: "total",
        name: "Total P/L",
        data: filledHistory.map((point) => ({
          label: new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: point.total_pnl / 10_000_000, // Convert stroops to XLM
          date: point.date,
        })),
        color: "#3b82f6", // Blue
      },
    ];
  }, [history, timeRange]);

  const toggleSortDir = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));

  const handleExportCsv = () => {
    if (positions.length === 0) return;
    const csv = positionsToCsv(positions);
    const datePart = new Date().toISOString().slice(0, 10);
    downloadCsv(`insightarena-portfolio-${datePart}.csv`, csv);
  };

  if (!isAuthenticated) {
    return (
      <PageBackground>
        <Header />
        <main className="mx-auto max-w-6xl px-6 pt-32 pb-20 text-white">
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-gray-950/60 p-16 text-center">
            <Wallet className="mb-6 h-12 w-12 text-gray-500" />
            <h1 className="text-2xl font-bold">Connect Your Wallet</h1>
            <p className="mt-3 max-w-md text-gray-400">
              Connect your wallet to view your portfolio and track your
              positions.
            </p>
          </div>
        </main>
        <Footer />
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-gray-950/60 p-8 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur sm:p-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
              <p className="mt-2 text-sm text-gray-400">
                View your open and settled positions with performance tracking.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isLoading || positions.length === 0}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-white/10 bg-gray-950/60 px-4 py-2 text-sm font-medium text-gray-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          {/* P/L Summary Cards */}
          {summary && (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-gray-950/40 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <TrendingUp className="h-4 w-4" />
                  <span>Realized P/L</span>
                </div>
                <p className={`mt-2 text-2xl font-bold ${summary.total_realized > 0
                  ? "text-green-400"
                  : summary.total_realized < 0
                    ? "text-red-400"
                    : "text-gray-400"
                  }`}>
                  {summary.total_realized > 0 ? "+" : ""}
                  {(summary.total_realized / 10_000_000).toFixed(2)} XLM
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-gray-950/40 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <TrendingDown className="h-4 w-4" />
                  <span>Unrealized P/L</span>
                </div>
                <p className={`mt-2 text-2xl font-bold ${summary.total_unrealized > 0
                  ? "text-green-400"
                  : summary.total_unrealized < 0
                    ? "text-red-400"
                    : "text-gray-400"
                  }`}>
                  {summary.total_unrealized > 0 ? "+" : ""}
                  {(summary.total_unrealized / 10_000_000).toFixed(2)} XLM
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-gray-950/40 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Wallet className="h-4 w-4" />
                  <span>Total P/L</span>
                </div>
                <p className={`mt-2 text-2xl font-bold ${summary.total_pnl > 0
                  ? "text-green-400"
                  : summary.total_pnl < 0
                    ? "text-red-400"
                    : "text-gray-400"
                  }`}>
                  {summary.total_pnl > 0 ? "+" : ""}
                  {(summary.total_pnl / 10_000_000).toFixed(2)} XLM
                </p>
              </div>
            </div>
          )}

          {/* P/L Over Time Chart */}
          {!historyError && chartSeries.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">P/L Over Time</h2>
                <div className="flex gap-1 rounded-xl border border-white/10 bg-gray-950/60 p-1">
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.value}
                      type="button"
                      onClick={() => setTimeRange(range.value)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${timeRange === range.value
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-gray-400 hover:text-white"
                        }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="h-[300px] w-full animate-pulse rounded-xl border border-white/5 bg-[#0a0f1a]" />
              ) : (
                <InteractiveChart
                  series={chartSeries}
                  tooltipFormatter={(value) => formatPnlForChart(value * 10_000_000)}
                  height={300}
                />
              )}
            </div>
          )}

          {historyError && (
            <div className="mt-8 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-400">
                Unable to load P/L history. {historyError}
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <div className="flex gap-1 rounded-xl border border-white/10 bg-gray-950/60 p-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(f.value);
                      setPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${statusFilter === f.value
                      ? "bg-orange-500/20 text-orange-400"
                      : "text-gray-400 hover:text-white"
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className="rounded-lg border border-white/10 bg-gray-950/60 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.field} value={o.field}>
                    Sort by {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={toggleSortDir}
                aria-label={`Sort ${sortDir === "asc" ? "descending" : "ascending"}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="mt-6">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 w-full animate-pulse rounded-2xl border border-white/5 bg-[#0a0f1a]"
                  />
                ))}
              </div>
            )}

            {!isLoading && error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {!isLoading && !error && positions.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-gray-950/60 p-12 text-center">
                <Wallet className="mx-auto mb-4 h-10 w-10 text-gray-500" />
                <p className="text-gray-400">No positions found.</p>
                <p className="mt-1 text-sm text-gray-500">
                  {statusFilter !== "all"
                    ? `No ${statusFilter} positions. Try a different filter.`
                    : "Start predicting to build your portfolio."}
                </p>
              </div>
            )}

            {!isLoading && !error && positions.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                    <thead className="bg-gray-950/60 text-xs uppercase tracking-wide text-gray-400">
                      <tr>
                        <th scope="col" className="px-5 py-4">
                          Market
                        </th>
                        <th scope="col" className="px-5 py-4">
                          Outcome
                        </th>
                        <th scope="col" className="px-5 py-4 text-right">
                          Stake
                        </th>
                        <th scope="col" className="px-5 py-4 text-right">
                          Current Value
                        </th>
                        <th scope="col" className="px-5 py-4 text-right">
                          Realized P&L
                        </th>
                        <th scope="col" className="px-5 py-4 text-right">
                          Unrealized P&L
                        </th>
                        <th scope="col" className="px-5 py-4 text-right">
                          Total P&L
                        </th>
                        <th scope="col" className="px-5 py-4 text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-gray-950/40">
                      {positions.map((pos) => {
                        const { realized, unrealized } = computePositionPnl(pos);
                        const realizedFmt = formatPnlAmount(realized);
                        const unrealizedFmt = formatPnlAmount(unrealized);
                        const totalFmt = formatPnl(pos.pnl);
                        return (
                          <tr
                            key={pos.id}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="max-w-[300px] truncate px-5 py-4 font-medium text-white">
                              {pos.market_title}
                            </td>
                            <td className="px-5 py-4 text-gray-300">
                              {pos.outcome}
                            </td>
                            <td className="px-5 py-4 text-right text-gray-300 font-mono">
                              {formatStroops(pos.stake)} XLM
                            </td>
                            <td className="px-5 py-4 text-right text-gray-300 font-mono">
                              {formatStroops(pos.current_value)} XLM
                            </td>
                            <td
                              className={`px-5 py-4 text-right font-mono ${realizedFmt.className}`}
                            >
                              {realizedFmt.text}
                            </td>
                            <td
                              className={`px-5 py-4 text-right font-mono ${unrealizedFmt.className}`}
                            >
                              {unrealizedFmt.text}
                            </td>
                            <td
                              className={`px-5 py-4 text-right font-mono font-semibold ${totalFmt.className}`}
                            >
                              {totalFmt.text}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span
                                className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[pos.status]}`}
                              >
                                {pos.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-gray-950/60 font-semibold">
                        <td className="px-5 py-4 text-white" colSpan={4}>
                          Totals ({positions.length}{" "}
                          {positions.length === 1 ? "position" : "positions"}
                          {totalPages > 1 ? " on this page" : ""})
                        </td>
                        <td
                          className={`px-5 py-4 text-right font-mono ${formatPnlAmount(pnlTotals.realized).className}`}
                        >
                          {formatPnlAmount(pnlTotals.realized).text}
                        </td>
                        <td
                          className={`px-5 py-4 text-right font-mono ${formatPnlAmount(pnlTotals.unrealized).className}`}
                        >
                          {formatPnlAmount(pnlTotals.unrealized).text}
                        </td>
                        <td
                          className={`px-5 py-4 text-right font-mono ${formatPnlAmount(pnlTotals.realized + pnlTotals.unrealized).className}`}
                        >
                          {formatPnlAmount(pnlTotals.realized + pnlTotals.unrealized).text}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-white/10 bg-gray-950/60 px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>
                    <span className="px-3 text-sm text-gray-400">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-white/10 bg-gray-950/60 px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}
