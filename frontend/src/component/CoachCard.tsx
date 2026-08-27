"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  GraduationCap,
  Minus,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useCoachInsights } from "@/hooks/useCoachInsights";
import type { CoachInsightPayload } from "@/lib/coach";

function trendMeta(direction: CoachInsightPayload["accuracy_trend"]["direction"]) {
  switch (direction) {
    case "improving":
      return {
        label: "Improving",
        Icon: ArrowUpRight,
        className: "text-emerald-400",
        srLabel: "Accuracy trend is improving",
      };
    case "declining":
      return {
        label: "Declining",
        Icon: ArrowDownRight,
        className: "text-rose-400",
        srLabel: "Accuracy trend is declining",
      };
    case "steady":
      return {
        label: "Steady",
        Icon: Minus,
        className: "text-gray-300",
        srLabel: "Accuracy trend is steady",
      };
    default:
      return {
        label: "Not enough data",
        Icon: Minus,
        className: "text-gray-400",
        srLabel: "Accuracy trend is not available yet",
      };
  }
}

/**
 * CTA is always derived from the actual insight payload — never hardcoded
 * copy unrelated to what the coach found.
 */
function coachCta(insights: CoachInsightPayload): string {
  const best = insights.best_category;
  if (best) {
    return `Predict more in ${best.category} — your strongest category`;
  }
  switch (insights.accuracy_trend.direction) {
    case "improving":
      return "You're trending up — keep making predictions";
    case "declining":
      return "Reset your streak — make a fresh prediction";
    default:
      return "Make another prediction to sharpen your insights";
  }
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5 w-full shadow-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-orange-500/60 rounded-t-2xl" />
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Weekly Coach</h2>
        <GraduationCap className="h-5 w-5 text-orange-400" />
      </div>
      {children}
    </div>
  );
}

export default function CoachCard() {
  const { address, openConnectModal } = useWallet();
  const { insights, isLoading, error, refetch, hasHistory } =
    useCoachInsights();

  // Not connected — nothing to show yet.
  if (!address) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">
            Connect your wallet to get personalised weekly coaching.
          </p>
          <button
            onClick={openConnectModal}
            className="mt-4 w-full py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition"
          >
            Connect Wallet
          </button>
        </div>
      </CardShell>
    );
  }

  // Loading state — skeleton, distinct from empty and error.
  if (isLoading) {
    return (
      <CardShell>
        <div
          className="mt-5 space-y-4 animate-pulse"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="h-8 w-full rounded bg-white/10" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-3/4 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/10" />
          </div>
          <div className="h-9 w-full rounded-lg bg-white/10" />
        </div>
        <span className="sr-only">Loading coach insights…</span>
      </CardShell>
    );
  }

  // Error state — retryable, never conflated with the new-user state.
  if (error || !insights) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
          <p className="mt-2 text-rose-300 text-sm">
            {error ?? "Couldn't load coach insights."}
          </p>
          <button
            onClick={refetch}
            className="mt-4 w-full py-2 rounded-lg border border-white/10 bg-white/5 text-gray-200 text-sm font-semibold hover:border-orange-500/50 hover:text-orange-400 transition"
          >
            Retry
          </button>
        </div>
      </CardShell>
    );
  }

  // New-user state — insufficient resolved history for insights yet.
  if (!hasHistory || !insights.insights) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <p className="text-gray-200 text-sm font-medium">
            Your coach needs more history first.
          </p>
          <p className="mt-2 text-gray-400 text-sm">
            {insights.message ??
              "Make a few predictions to unlock your personalised coach."}
          </p>
          <Link
            href="/markets"
            data-testid="coach-onboarding-cta"
            className="mt-4 inline-block w-full py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition"
          >
            Explore Markets
          </Link>
        </div>
      </CardShell>
    );
  }

  const payload = insights.insights;
  const trend = trendMeta(payload.accuracy_trend.direction);
  const TrendIcon = trend.Icon;
  const cta = coachCta(payload);

  return (
    <CardShell>
      {/* Accuracy trend */}
      <div
        className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3"
        data-testid="coach-trend"
      >
        <span
          className={`flex items-center gap-1.5 text-sm font-semibold ${trend.className}`}
        >
          <TrendIcon className="h-4 w-4" aria-hidden="true" />
          {trend.label}
        </span>
        <span className="text-xs text-gray-400" title="Recent vs previous accuracy">
          {payload.accuracy_trend.recent_accuracy}% vs{" "}
          {payload.accuracy_trend.prior_accuracy}%
        </span>
      </div>

      {/* Best / worst categories */}
      <div className="mt-4 space-y-2 text-sm">
        {payload.best_category && (
          <div className="flex justify-between text-gray-300">
            <span>Strongest category</span>
            <span className="text-emerald-400">
              {payload.best_category.category} ·{" "}
              {payload.best_category.accuracy_rate}%
            </span>
          </div>
        )}
        {payload.worst_category && (
          <div className="flex justify-between text-gray-300">
            <span>Weakest category</span>
            <span className="text-rose-400">
              {payload.worst_category.category} ·{" "}
              {payload.worst_category.accuracy_rate}%
            </span>
          </div>
        )}
        {!payload.best_category && !payload.worst_category && (
          <p className="text-gray-400 text-xs">
            Predict across a few markets to unlock category strengths.
          </p>
        )}
      </div>

      {/* Streak */}
      <div
        className="mt-4 flex items-center justify-between rounded-xl bg-white/5 px-3 py-3 text-sm"
        data-testid="coach-streak"
      >
        <span className="flex items-center gap-1.5 text-gray-300">
          <Flame
            className={`h-4 w-4 ${
              payload.current_streak > 0 ? "text-orange-400" : "text-gray-500"
            }`}
            aria-hidden="true"
          />
          Current streak
        </span>
        <span className="font-semibold text-white">
          {payload.current_streak}
          <span className="ml-2 text-xs font-normal text-gray-400">
            best {payload.longest_streak}
          </span>
        </span>
      </div>

      {/* Data-derived call to action */}
      <Link
        href="/markets"
        data-testid="coach-insight-cta"
        className="mt-5 flex w-full items-center justify-center gap-2 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition"
      >
        {cta}
      </Link>

      <p className="mt-2 text-center text-[11px] text-gray-500">
        Based on your last {payload.total_resolved} resolved predictions ·{" "}
        {trend.srLabel}
      </p>
    </CardShell>
  );
}
