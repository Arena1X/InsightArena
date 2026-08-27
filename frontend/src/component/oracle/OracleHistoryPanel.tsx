"use client";

import type {
  OracleReliability,
  OracleSubmissionHistoryItem,
} from "@/hooks/useOracleDashboard";
import { EmptyState } from "@/component/ui/empty-state";
import { Inbox } from "lucide-react";

type Props = {
  history: OracleSubmissionHistoryItem[];
  reliability: OracleReliability;
};

export default function OracleHistoryPanel({ history, reliability }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Reliability", value: `${reliability.successRate}%` },
          { label: "Total", value: reliability.totalSubmissions },
          { label: "Successful", value: reliability.successfulSubmissions },
          { label: "Failed", value: reliability.failedSubmissions },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-white/10 bg-white/5 p-5"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} />}
          title="No submission history"
          description="Your oracle resolutions will show up here after your first submit."
          variant="empty"
        />
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-sm text-amber-300">Outcome: {item.outcome}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(item.submittedAt).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    item.status === "success"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : item.status === "failed"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {item.status}
                </span>
                {item.txHash && (
                  <p className="mt-2 font-mono text-xs text-slate-500">
                    {item.txHash.slice(0, 14)}…
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
