"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/lib/api";

export type PendingResolution = {
  marketId: string;
  title: string;
  category: string;
  closedAt: string;
  outcomes: string[];
  participantCount: number;
};

export type PendingQueueItem = PendingResolution & {
  deadline: string;
  isOverdue: boolean;
  teamA: string;
  teamB: string;
};

export type OracleSubmissionHistoryItem = {
  id: string;
  marketId: string;
  title: string;
  outcome: string;
  status: "success" | "failed" | "pending";
  submittedAt: string;
  txHash?: string;
};

export type OracleReliability = {
  successRate: number;
  totalSubmissions: number;
  successfulSubmissions: number;
  failedSubmissions: number;
  averageSubmissionTimeMs: number;
};

type OracleDashboardState = {
  pending: PendingResolution[];
  queue: PendingQueueItem[];
  pendingCount: number;
  overdueCount: number;
  history: OracleSubmissionHistoryItem[];
  reliability: OracleReliability;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitResolution: (
    marketId: string,
    outcome: string,
  ) => Promise<{ txHash: string }>;
};

const MOCK_PENDING: PendingResolution[] = [
  {
    marketId: "mkt-101",
    title: "Will BTC close above $100k this week?",
    category: "Crypto",
    closedAt: new Date(Date.now() - 3_600_000).toISOString(),
    outcomes: ["Yes", "No"],
    participantCount: 128,
  },
  {
    marketId: "mkt-102",
    title: "Arsenal vs Chelsea",
    category: "Sports",
    closedAt: new Date(Date.now() - 7_200_000).toISOString(),
    outcomes: ["Arsenal", "Draw", "Chelsea"],
    participantCount: 64,
  },
  {
    marketId: "mkt-103",
    title: "Lakers vs Celtics",
    category: "Sports",
    closedAt: new Date(Date.now() + 3_600_000).toISOString(),
    outcomes: ["Lakers", "Celtics"],
    participantCount: 41,
  },
];

export function parseMatchTeams(title: string): { teamA: string; teamB: string } {
  const [teamA, teamB] = title.split(/\s+vs\s+/i);
  return {
    teamA: teamA?.trim() || "Team A",
    teamB: teamB?.trim() || "Team B",
  };
}

export function buildPendingQueue(
  pending: PendingResolution[],
  now = Date.now(),
): PendingQueueItem[] {
  return pending
    .map((item) => {
      const deadline = item.closedAt;
      const { teamA, teamB } = parseMatchTeams(item.title);
      return {
        ...item,
        deadline,
        isOverdue: new Date(deadline).getTime() < now,
        teamA,
        teamB,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );
}

const MOCK_HISTORY: OracleSubmissionHistoryItem[] = [
  {
    id: "sub-1",
    marketId: "mkt-090",
    title: "ETH ETF approval by Friday?",
    outcome: "Yes",
    status: "success",
    submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
    txHash: "abc123def456",
  },
];

function computeReliability(
  history: OracleSubmissionHistoryItem[],
): OracleReliability {
  const totalSubmissions = history.length;
  const successfulSubmissions = history.filter(
    (h) => h.status === "success",
  ).length;
  const failedSubmissions = history.filter((h) => h.status === "failed").length;
  const successRate =
    totalSubmissions === 0
      ? 100
      : Math.round((successfulSubmissions / totalSubmissions) * 1000) / 10;

  return {
    successRate,
    totalSubmissions,
    successfulSubmissions,
    failedSubmissions,
    averageSubmissionTimeMs: 1200,
  };
}

export function useOracleDashboard(): OracleDashboardState {
  const [pending, setPending] = useState<PendingResolution[]>([]);
  const [history, setHistory] = useState<OracleSubmissionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer live oracle endpoints when configured; fall back to local mocks.
      const [pendingRes, historyRes] = await Promise.all([
        apiClient
          .get<{
            data?: Array<{
              match?: {
                id: string;
                team_a: string;
                team_b: string;
                match_time: string;
                prediction_count: number;
              };
              event?: { title: string };
              time_since_match_started_seconds?: number;
            }>;
          }>("/oracle/pending-matches")
          .catch(() => null),
        apiClient
          .get<{
            data?: Array<{
              id: string;
              match_id: string;
              team_a: string;
              team_b: string;
              winning_team: string;
              status: string;
              submitted_at?: string;
              transaction_hash?: string;
            }>;
            statistics?: {
              success_rate: number;
              total_submissions: number;
              successful_submissions: number;
              failed_submissions: number;
              average_submission_time_ms: number;
            };
          }>("/oracle/submissions")
          .catch(() => null),
      ]);

      if (pendingRes?.data?.length) {
        setPending(
          pendingRes.data.map((row) => ({
            marketId: row.match?.id ?? "unknown",
            title: `${row.match?.team_a ?? "Team A"} vs ${row.match?.team_b ?? "Team B"}`,
            category: row.event?.title ?? "Oracle",
            closedAt: row.match?.match_time ?? new Date().toISOString(),
            outcomes: ["TEAM_A", "TEAM_B", "DRAW"],
            participantCount: row.match?.prediction_count ?? 0,
          })),
        );
      } else {
        setPending(MOCK_PENDING);
      }

      if (historyRes?.data?.length) {
        setHistory(
          historyRes.data.map((row) => ({
            id: row.id,
            marketId: row.match_id,
            title: `${row.team_a} vs ${row.team_b}`,
            outcome: row.winning_team,
            status:
              row.status === "SUCCESS"
                ? "success"
                : row.status === "FAILED"
                  ? "failed"
                  : "pending",
            submittedAt: row.submitted_at ?? new Date().toISOString(),
            txHash: row.transaction_hash,
          })),
        );
      } else {
        setHistory(MOCK_HISTORY);
      }
    } catch (err) {
      setPending(MOCK_PENDING);
      setHistory(MOCK_HISTORY);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load oracle dashboard");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitResolution = useCallback(
    async (marketId: string, outcome: string) => {
      const market = pending.find((p) => p.marketId === marketId);
      await new Promise((r) => setTimeout(r, 600));
      const txHash = `tx${Date.now().toString(16)}`;

      setPending((prev) => prev.filter((p) => p.marketId !== marketId));
      setHistory((prev) => [
        {
          id: `sub-${Date.now()}`,
          marketId,
          title: market?.title ?? marketId,
          outcome,
          status: "success",
          submittedAt: new Date().toISOString(),
          txHash,
        },
        ...prev,
      ]);

      return { txHash };
    },
    [pending],
  );

  const reliability = useMemo(() => computeReliability(history), [history]);
  const queue = useMemo(() => buildPendingQueue(pending), [pending]);
  const pendingCount = queue.length;
  const overdueCount = queue.filter((item) => item.isOverdue).length;

  return {
    pending,
    queue,
    pendingCount,
    overdueCount,
    history,
    reliability,
    loading,
    error,
    refresh,
    submitResolution,
  };
}
