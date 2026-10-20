"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/component/ui/skeleton";
import { Button } from "@/component/ui/button";
import { useOracleDashboard, type PendingResolution } from "@/hooks/useOracleDashboard";
import PendingResolutionsList from "@/component/oracle/PendingResolutionsList";
import OracleSubmissionForm from "@/component/oracle/OracleSubmissionForm";
import OracleHistoryPanel from "@/component/oracle/OracleHistoryPanel";

export default function OracleDashboard() {
  const {
    pending,
    history,
    reliability,
    loading,
    error,
    refresh,
    submitResolution,
  } = useOracleDashboard();
  const [activeMarket, setActiveMarket] = useState<PendingResolution | null>(
    null,
  );
  const [tab, setTab] = useState<"pending" | "history">("pending");

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-3xl bg-white/10" />
        <Skeleton className="h-24 rounded-3xl bg-white/10" />
        <Skeleton className="h-24 rounded-3xl bg-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
          Oracle submitter
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Resolution dashboard</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
          Review markets awaiting resolution, submit outcomes with confirmation,
          and track your submission reliability.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-white/10 text-slate-300"
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
            Reliability {reliability.successRate}%
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Could not reach the oracle API</p>
              <p className="mt-1 text-sm text-red-200/80">
                Showing local dashboard data. {error}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 rounded-3xl border border-white/10 bg-slate-900/80 p-2">
        {(
          [
            { key: "pending", label: `Pending (${pending.length})` },
            { key: "history", label: `History (${history.length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "bg-amber-400 text-slate-950"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        <PendingResolutionsList markets={pending} onSelect={setActiveMarket} />
      ) : (
        <OracleHistoryPanel history={history} reliability={reliability} />
      )}

      {activeMarket && (
        <OracleSubmissionForm
          market={activeMarket}
          onSubmit={submitResolution}
          onClose={() => setActiveMarket(null)}
        />
      )}
    </div>
  );
}
