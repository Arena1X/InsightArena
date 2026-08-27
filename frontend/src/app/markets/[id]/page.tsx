"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { usePredictionSlip } from "@/context/PredictionSlipContext";
import { InteractiveChart, type ChartSeries } from "@/component/ui/interactive-chart";
import { Button } from "@/component/ui/button";
import { Badge } from "@/component/ui/badge";
import { Skeleton } from "@/component/ui/skeleton";
import { ArrowLeft, AlertCircle, TrendingUp, Zap } from "lucide-react";

interface MarketDetail {
  id: string;
  title: string;
  category: string;
  description: string;
  probability: number;
  totalStaked: number;
  closeAt: string;
  status: string;
  volume24h: number;
}

interface PricePoint {
  timestamp: string;
  price: number;
}

type RangeKey = "1H" | "1D" | "1W" | "All";

const RANGE_OPTIONS: { label: RangeKey; ms: number }[] = [
  { label: "1H", ms: 3_600_000 },
  { label: "1D", ms: 86_400_000 },
  { label: "1W", ms: 604_800_000 },
  { label: "All", ms: Infinity },
];

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem, openSlip } = usePredictionSlip();
  const marketId = params.id as string;

  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<RangeKey>("1W");

  useEffect(() => {
    if (!marketId) return;
    setLoading(true);
    setError(null);

    apiClient
      .get<MarketDetail>(`/markets/${marketId}`)
      .then((data) => {
        setMarket(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to load market",
        );
        setLoading(false);
      });
  }, [marketId]);

  useEffect(() => {
    if (!marketId) return;
    setPriceLoading(true);
    setPriceError(null);

    apiClient
      .get<PricePoint[]>(`/markets/${marketId}/price-history`)
      .then((data) => {
        setPriceHistory(data || []);
        setPriceLoading(false);
      })
      .catch((err) => {
        setPriceError(
          err instanceof ApiError
            ? err.message
            : "Failed to load price history",
        );
        setPriceLoading(false);
      });
  }, [marketId]);

  const filteredHistory = useMemo(() => {
    if (priceHistory.length === 0) return [];
    const range = RANGE_OPTIONS.find((r) => r.label === selectedRange);
    if (!range || range.ms === Infinity) return priceHistory;
    const cutoff = Date.now() - range.ms;
    return priceHistory.filter(
      (p) => new Date(p.timestamp).getTime() >= cutoff,
    );
  }, [priceHistory, selectedRange]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    return [
      {
        id: "odds",
        name: "Yes Probability",
        data: filteredHistory.map((p) => ({
          label: new Date(p.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
          }),
          value: p.price * 100,
          date: new Date(p.timestamp).toLocaleString(),
        })),
        color: "#4FD1C5",
        secondaryColor: "#2C7A7B",
      },
    ];
  }, [filteredHistory]);

  const handlePredict = useCallback(() => {
    if (!market) return;
    addItem({
      marketId: market.id,
      marketTitle: market.title,
      category: market.category,
      outcome: "Yes",
      odds: market.probability > 0 ? 1 / market.probability : 2,
    });
    openSlip();
  }, [market, addItem, openSlip]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-3 text-lg font-semibold text-red-300">
              {error || "Market not found"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const probabilityPct = Math.round(market.probability * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Markets
        </button>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">
                {market.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="text-xs">
                  {market.category}
                </Badge>
                <Badge
                  className={
                    market.status === "active"
                      ? "bg-green-500/20 text-green-300"
                      : market.status === "upcoming"
                        ? "bg-yellow-500/10 text-yellow-300"
                        : "bg-white/5 text-gray-300"
                  }
                >
                  {market.status.toUpperCase()}
                </Badge>
                <span className="text-sm text-slate-400">
                  {market.totalStaked.toFixed(2)} XLM staked
                </span>
              </div>
            </div>
            <Button
              onClick={handlePredict}
              className="rounded-full bg-orange-500 px-6 text-white hover:bg-orange-400"
            >
              <Zap className="mr-2 h-4 w-4" />
              Predict
            </Button>
          </div>

          {market.description && (
            <p className="mt-6 text-sm text-slate-300 leading-relaxed">
              {market.description}
            </p>
          )}

          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Yes Probability
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-400">
                {probabilityPct}%
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                24h Volume
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {market.volume24h?.toFixed(0) || "—"} XLM
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Closes
              </p>
              <p className="mt-2 text-lg font-bold text-white">
                {new Date(market.closeAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">
                Price History
              </h2>
            </div>
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {RANGE_OPTIONS.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setSelectedRange(label)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    selectedRange === label
                      ? "bg-orange-500 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                  aria-pressed={selectedRange === label}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {priceLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : priceError ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-6">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{priceError}</p>
            </div>
          ) : chartSeries.length > 0 ? (
            <InteractiveChart
              series={chartSeries}
              title="Odds History"
              height={320}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-center">
              <TrendingUp className="h-10 w-10 text-slate-600" />
              <p className="mt-4 text-sm font-medium text-slate-400">
                No price history available
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Price data will appear once trading begins.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
