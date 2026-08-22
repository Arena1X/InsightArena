import { apiClient } from "@/lib/api";

export type CoachCategoryStat = {
  category: string;
  predictions: number;
  correct: number;
  accuracy_rate: string;
};

export type CoachAccuracyTrend = {
  direction: "improving" | "declining" | "steady" | "not_enough_data";
  recent_accuracy: number;
  prior_accuracy: number;
};

export type CoachInsightPayload = {
  accuracy_trend: CoachAccuracyTrend;
  best_category: CoachCategoryStat | null;
  worst_category: CoachCategoryStat | null;
  current_streak: number;
  longest_streak: number;
  total_resolved: number;
  generated_at: string;
};

export type CoachInsightsResponse = {
  has_history: boolean;
  message: string | null;
  insights: CoachInsightPayload | null;
};

const COACH_INSIGHTS_PATH = "/api/leaderboard/coach/insights";

/**
 * Fetches the personalised coach insights for the authenticated user.
 * Backed by `GET /api/leaderboard/coach/insights` (see
 * `backend/src/leaderboard/leaderboard.controller.ts`).
 */
export async function getCoachInsights(
  token: string,
): Promise<CoachInsightsResponse> {
  return apiClient.get<CoachInsightsResponse>(COACH_INSIGHTS_PATH, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
