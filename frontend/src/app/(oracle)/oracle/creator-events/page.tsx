"use client";

import { useState } from "react";
import { Clock, CheckCircle2, BarChart2, Timer } from "lucide-react";
import PendingMatchesList, {
  type PendingMatch,
} from "@/component/oracle/PendingMatchesList";
import SubmitResultForm from "@/component/oracle/SubmitResultForm";
import BatchResultSubmission from "@/component/oracle/BatchResultSubmission";
import { Button } from "@/component/ui/button";

type Outcome = "TEAM_A" | "TEAM_B" | "DRAW";

interface SubmittedResult {
  matchId: string;
  teamA: string;
  teamB: string;
  outcome: Outcome;
  submittedAt: string;
  txHash: string;
}

const MOCK_PENDING: PendingMatch[] = [
  {
    matchId: "match-001",
    onChainMatchId: "1",
    teamA: "Team Alpha",
    teamB: "Team Beta",
    matchTime: new Date(Date.now() - 7200 * 1000).toISOString(),
    predictionCount: 42,
    eventId: "event-001",
    eventTitle: "Apollo Tournament",
    timeSinceStartedSeconds: 7200,
  },
  {
    matchId: "match-002",
    onChainMatchId: "2",
    teamA: "Team Gamma",
    teamB: "Team Delta",
    matchTime: new Date(Date.now() - 3600 * 1000).toISOString(),
    predictionCount: 18,
    eventId: "event-001",
    eventTitle: "Apollo Tournament",
    timeSinceStartedSeconds: 3600,
  },
  {
    matchId: "match-003",
    onChainMatchId: "3",
    teamA: "FC Barcelona",
    teamB: "Real Madrid",
    matchTime: new Date(Date.now() - 10800 * 1000).toISOString(),
    predictionCount: 127,
    eventId: "event-002",
    eventTitle: "Rising Stars Invite",
    timeSinceStartedSeconds: 10800,
  },
];

const MOCK_RECENT: SubmittedResult[] = [
  {
    matchId: "match-000",
    teamA: "Team X",
    teamB: "Team Y",
    outcome: "TEAM_A",
    submittedAt: new Date(Date.now() - 86400 * 1000).toISOString(),
    txHash: "abc123def456",
  },
];

const OUTCOME_LABELS: Record<Outcome, string> = {
  TEAM_A: "Team A Won",
  TEAM_B: "Team B Won",
  DRAW: "Draw",
};

export default function OracleCreatorEventsPage() {
  const [pending, setPending] = useState<PendingMatch[]>(MOCK_PENDING);
  const [recentResults, setRecentResults] =
    useState<SubmittedResult[]>(MOCK_RECENT);
  const [activeMatch, setActiveMatch] = useState<PendingMatch | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "batch" | "recent">(
    "pending",
  );

  const todayCount = recentResults.filter(
    (r) =>
      new Date(r.submittedAt).toDateString() === new Date().toDateString(),
  ).length;

  const avgSubmissionTime =
    pending.length > 0
      ? Math.round(
          pending.reduce((sum, m) => sum + m.timeSinceStartedSeconds, 0) /
            pending.length /
            60,
        )
      : 0;

  async function handleSubmitResult(
    matchId: string,
    outcome: Outcome,
    _confidence?: number,
    _dataSource?: string,
  ): Promise<{ txHash: string }> {
    await new Promise((r) => setTimeout(r, 1500));
    const txHash = `tx${Date.now().toString(16)}`;
    const match = pending.find((m) => m.matchId === matchId);

    if (match) {
      setRecentResults((prev) => [
        {
          matchId,
          teamA: match.teamA,
          teamB: match.teamB,
          outcome,
          submittedAt: new Date().toISOString(),
          txHash,
        },
        ...prev,
      ]);
      setPending((prev) => prev.filter((m) => m.matchId !== matchId));
    }

    return { txHash };
  }

  async function handleBatchSubmit(
    results: Array<{ matchId: string; outcome: Outcome }>,
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    const newResults: SubmittedResult[] = results.map((r) => {
      const match = pending.find((m) => m.matchId === r.matchId);
      return {
        matchId: r.matchId,
        teamA: match?.teamA ?? "Unknown",
        teamB: match?.teamB ?? "Unknown",
        outcome: r.outcome,
        submittedAt: new Date().toISOString(),
        txHash: `tx${Date.now().toString(16)}-${r.matchId}`,
      };
    });
    setRecentResults((prev) => [...newResults, ...prev]);
    setPending((prev) =>
      prev.filter((m) => !results.some((r) => r.matchId === m.matchId)),
    );
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
          AI Oracle
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Creator Event Results</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">
          Submit on-chain match results for creator events. All submissions are
          signed by the AI Oracle wallet.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Clock,
            label: "Pending Matches",
            value: pending.length,
            color: "text-amber-300",
          },
          {
            icon: CheckCircle2,
            label: "Total Submitted",
            value: recentResults.length,
            color: "text-emerald-300",
          },
          {
            icon: BarChart2,
            label: "Submitted Today",
            value: todayCount,
            color: "text-sky-300",
          },
          {
            icon: Timer,
            label: "Avg. Delay (min)",
            value: avgSubmissionTime,
            color: "text-violet-300",
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div
            key={label}
            className="rounded-3xl border border-white/10 bg-white/5 p-5"
          >
            <Icon className={`h-5 w-5 ${color} mb-2`} />
            <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-3xl border border-white/10 bg-slate-900/80 p-2">
        {(
          [
            { key: "pending", label: `Pending (${pending.length})` },
            { key: "batch", label: "Batch Submit" },
            { key: "recent", label: `Recent (${recentResults.length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
              activeTab === key
                ? "bg-amber-400 text-slate-950"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              Matches Awaiting Results
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 text-slate-300"
              onClick={() => setBatchMode((v) => !v)}
            >
              {batchMode ? "Cancel Batch" : "Batch Select"}
            </Button>
          </div>

          <PendingMatchesList
            matches={pending}
            onSubmitResult={setActiveMatch}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            batchMode={batchMode}
          />

          {batchMode && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-3">
              <p className="text-sm text-amber-300">
                {selectedIds.size} match{selectedIds.size !== 1 ? "es" : ""}{" "}
                selected
              </p>
              <Button
                type="button"
                className="rounded-full bg-amber-400 px-5 text-sm text-slate-950 hover:bg-amber-300"
                onClick={() => setActiveTab("batch")}
              >
                Submit Selected via CSV
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Batch tab */}
      {activeTab === "batch" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            Batch Result Submission
          </h2>
          <BatchResultSubmission onSubmitBatch={handleBatchSubmit} />
        </div>
      )}

      {/* Recent tab */}
      {activeTab === "recent" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            Recently Submitted Results
          </h2>
          {recentResults.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/20 bg-slate-900/80 p-10 text-center text-slate-400">
              No results submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentResults.map((r) => (
                <div
                  key={`${r.matchId}-${r.submittedAt}`}
                  className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-white">
                      {r.teamA}{" "}
                      <span className="text-slate-400">vs</span> {r.teamB}
                    </p>
                    <p className="text-sm text-amber-300">
                      {OUTCOME_LABELS[r.outcome]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(r.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${r.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-slate-400 hover:text-amber-300 hover:underline"
                  >
                    {r.txHash.slice(0, 16)}…
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit result modal */}
      {activeMatch && (
        <SubmitResultForm
          match={activeMatch}
          onSubmit={handleSubmitResult}
          onClose={() => setActiveMatch(null)}
        />
      )}
    </div>
  );
}
