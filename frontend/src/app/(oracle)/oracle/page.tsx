"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OracleDashboard from "@/component/oracle/OracleDashboard";
import SubmitResultForm from "@/component/creator-events/SubmitResultForm";
import KeyboardShortcutsHelp from "@/component/trading/KeyboardShortcutsHelp";
import {
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from "@/hooks/useKeyboardShortcuts";
import {
  useOracleDashboard,
  type PendingQueueItem,
} from "@/hooks/useOracleDashboard";

function outcomeFromScores(homeScore: number, awayScore: number): string {
  if (homeScore === awayScore) return "DRAW";
  return homeScore > awayScore ? "TEAM_A" : "TEAM_B";
}

export default function OracleHomePage() {
  const {
    queue,
    pendingCount,
    overdueCount,
    submitResolution,
    approveSubmission,
    rejectSubmission,
  } = useOracleDashboard();
  const [activeMatch, setActiveMatch] = useState<PendingQueueItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= queue.length) {
      setSelectedIndex(queue.length - 1);
    }
  }, [queue.length, selectedIndex]);

  const selectedItem = queue[selectedIndex] ?? null;

  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: "a",
        description: "Approve selected submission",
        action: () => {
          if (selectedItem) {
            void approveSubmission(selectedItem.marketId);
          }
        },
      },
      {
        key: "r",
        description: "Reject selected submission",
        action: () => {
          if (selectedItem) {
            void rejectSubmission(selectedItem.marketId);
          }
        },
      },
      {
        key: "n",
        description: "Next submission in queue",
        action: () => {
          if (queue.length > 0) {
            setSelectedIndex((prev) => (prev + 1) % queue.length);
          }
        },
      },
      {
        key: "p",
        description: "Previous submission in queue",
        action: () => {
          if (queue.length > 0) {
            setSelectedIndex((prev) => (prev - 1 + queue.length) % queue.length);
          }
        },
      },
      {
        key: "Enter",
        description: "Open result form for selected submission",
        action: () => {
          if (selectedItem && !isHelpOpen) {
            setActiveMatch(selectedItem);
          }
        },
      },
      {
        key: "?",
        description: "Toggle keyboard shortcuts help",
        action: () => {
          setIsHelpOpen((prev) => !prev);
        },
      },
      {
        key: "Escape",
        description: "Close help overlay or active form",
        action: () => {
          if (isHelpOpen) {
            setIsHelpOpen(false);
          } else if (activeMatch) {
            setActiveMatch(null);
          }
        },
      },
    ],
    [
      selectedItem,
      queue.length,
      isHelpOpen,
      activeMatch,
      approveSubmission,
      rejectSubmission,
    ],
  );

  useKeyboardShortcuts({
    shortcuts,
    enabled: true,
    scope: "oracle-dashboard",
    containerRef: dashboardRef,
  });

  return (
    <div
      ref={dashboardRef}
      tabIndex={-1}
      data-testid="oracle-dashboard-root"
      className="space-y-8 outline-none"
    >
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
              {pendingCount} pending
            </span>
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-rose-200">
              {overdueCount} overdue
            </span>
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              aria-label="Show keyboard shortcuts"
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
            >
              Shortcuts (?)
            </button>
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
                queue.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <tr
                      key={item.marketId}
                      onClick={() => setSelectedIndex(idx)}
                      className={`cursor-pointer border-t border-white/5 transition ${
                        isSelected
                          ? "bg-amber-400/10 ring-1 ring-inset ring-amber-400/40"
                          : item.isOverdue
                            ? "bg-rose-500/10"
                            : ""
                      }`}
                      data-testid={`queue-row-${item.marketId}`}
                      data-selected={isSelected ? "true" : "false"}
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
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void approveSubmission(item.marketId);
                            }}
                            className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void rejectSubmission(item.marketId);
                            }}
                            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIndex(idx);
                              setActiveMatch(item);
                            }}
                            className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                          >
                            Submit result
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      <KeyboardShortcutsHelp
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
