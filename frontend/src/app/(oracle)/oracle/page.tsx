"use client";

import { useState } from "react";
import OracleDashboard from "@/component/oracle/OracleDashboard";
import SubmitResultForm from "@/component/creator-events/SubmitResultForm";
import {
  useOracleDashboard,
  type PendingQueueItem,
} from "@/hooks/useOracleDashboard";

function outcomeFromScores(homeScore: number, awayScore: number): string {
  if (homeScore === awayScore) return "DRAW";
  return homeScore > awayScore ? "TEAM_A" : "TEAM_B";
}

export default function OracleHomePage() {
  const { queue, pendingCount, overdueCount, submitResolution } =
    useOracleDashboard();
  const [activeMatch, setActiveMatch] = useState<PendingQueueItem | null>(null);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
              Submission queue
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Pending result submissions
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
              {pendingCount} pending
            </span>
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-rose-200">
              {overdueCount} overdue
            </span>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No matches are waiting for a result.
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr
                    key={item.marketId}
                    className={`border-t border-white/5 ${
                      item.isOverdue ? "bg-rose-500/10" : ""
                    }`}
                    data-overdue={item.isOverdue ? "true" : "false"}
                  >
                    <td className="px-3 py-3 text-white">{item.title}</td>
                    <td className="px-3 py-3 text-slate-300">
                      {new Date(item.deadline).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      {item.isOverdue ? (
                        <span className="rounded-full bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-200">
                          Overdue
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveMatch(item)}
                        className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                      >
                        Submit result
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {activeMatch && (
          <div className="mt-6">
            <SubmitResultForm
              teamA={activeMatch.teamA}
              teamB={activeMatch.teamB}
              isOverdue={activeMatch.isOverdue}
              onSubmit={async (homeScore, awayScore) => {
                await submitResolution(
                  activeMatch.marketId,
                  outcomeFromScores(homeScore, awayScore),
                );
                setActiveMatch(null);
              }}
              onCancel={() => setActiveMatch(null)}
            />
          </div>
        )}
      </section>

      <OracleDashboard />
    </div>
  );
}
