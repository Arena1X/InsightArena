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

// ---------------------------------------------------------------------------
// Dismiss / snooze lifecycle
// ---------------------------------------------------------------------------
//
// The coach payload has no explicit id, but the card is framed as a
// "Weekly Coach" insight, so we derive a stable id from the ISO week of
// `generated_at`. Dismissing an id hides it permanently; snoozing hides it
// until the next ISO week rolls over. State is persisted per wallet, mirroring
// the pattern used by `useOnboardingTour`.

const COACH_LIFECYCLE_STORAGE_PREFIX = "insightarena.coach-insight.v1";

interface CoachInsightLifecycleState {
  /** Insight ids the user has permanently dismissed. */
  dismissed: string[];
  /** Insight id -> ISO week string the snooze expires at (re-show from). */
  snoozedUntilWeek: Record<string, string>;
}

const EMPTY_LIFECYCLE_STATE: CoachInsightLifecycleState = {
  dismissed: [],
  snoozedUntilWeek: {},
};

/** Per-wallet storage key so each user keeps their own dismiss/snooze state. */
export function getCoachLifecycleStorageKey(userId?: string | null): string {
  return `${COACH_LIFECYCLE_STORAGE_PREFIX}:${userId || "anonymous"}`;
}

/**
 * Derives a stable id for a weekly insight from its `generated_at` timestamp,
 * using the ISO 8601 week (e.g. "2026-W39"). Falls back to the raw timestamp
 * if it can't be parsed.
 */
export function getInsightId(generatedAt: string): string {
  const week = getIsoWeekString(generatedAt);
  return week ?? generatedAt;
}

/** Returns the ISO week string (`YYYY-Www`) for a date, or null if invalid. */
export function getIsoWeekString(dateInput: string | Date): string | null {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  // Copy, then shift to the Thursday of this ISO week so the year always
  // matches the week it belongs to (ISO weeks can straddle Dec 31 / Jan 1).
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNumber = (target.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNumber + 3);

  const weekNumber =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );

  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function readLifecycleState(key: string): CoachInsightLifecycleState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY_LIFECYCLE_STATE;
    const parsed = JSON.parse(raw) as Partial<CoachInsightLifecycleState>;
    return {
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
      snoozedUntilWeek:
        parsed.snoozedUntilWeek && typeof parsed.snoozedUntilWeek === "object"
          ? parsed.snoozedUntilWeek
          : {},
    };
  } catch {
    return EMPTY_LIFECYCLE_STATE;
  }
}

function writeLifecycleState(key: string, state: CoachInsightLifecycleState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — silently ignore
  }
}

/** Permanently dismisses an insight id for this wallet. */
export function dismissCoachInsight(userId: string | null | undefined, insightId: string): void {
  const key = getCoachLifecycleStorageKey(userId);
  const state = readLifecycleState(key);
  if (state.dismissed.includes(insightId)) return;
  writeLifecycleState(key, {
    ...state,
    dismissed: [...state.dismissed, insightId],
  });
}

/** Snoozes an insight id for this wallet until the following ISO week. */
export function snoozeCoachInsight(
  userId: string | null | undefined,
  insightId: string,
  fromWeek: string,
): void {
  const key = getCoachLifecycleStorageKey(userId);
  const state = readLifecycleState(key);
  writeLifecycleState(key, {
    ...state,
    snoozedUntilWeek: { ...state.snoozedUntilWeek, [insightId]: fromWeek },
  });
}

/**
 * Whether an insight id is currently hidden for this wallet: either
 * permanently dismissed, or snoozed and the current ISO week has not yet
 * advanced past the week it was snoozed from.
 */
export function isCoachInsightHidden(
  userId: string | null | undefined,
  insightId: string,
  currentWeek: string,
): boolean {
  const state = readLifecycleState(getCoachLifecycleStorageKey(userId));
  if (state.dismissed.includes(insightId)) return true;
  const snoozedFromWeek = state.snoozedUntilWeek[insightId];
  return snoozedFromWeek !== undefined && snoozedFromWeek >= currentWeek;
}
