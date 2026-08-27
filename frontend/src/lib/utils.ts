import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Route content pending signal ────────────────────────────────────────────
//
// Next.js updates the URL (usePathname/useSearchParams) as soon as a client
// navigation is committed, even while the destination's loading.tsx Suspense
// fallback is still showing. A route-change listener that treats "pathname
// changed" as "route settled" therefore fires early on slow transitions.
// Route-level loading.tsx files call `beginRouteContentLoad()` on mount and
// release it on unmount so anything that needs to know when the *content*
// (not just the URL) is actually ready — like RouteProgress — can wait for it.

type RouteContentPendingListener = (pending: boolean) => void;

let pendingRouteContentCount = 0;
const routeContentPendingListeners = new Set<RouteContentPendingListener>();

function notifyRouteContentPendingListeners() {
  const pending = pendingRouteContentCount > 0;
  routeContentPendingListeners.forEach((listener) => listener(pending));
}

export function isRouteContentPending(): boolean {
  return pendingRouteContentCount > 0;
}

/** Marks route content as loading; call the returned function once it's ready. */
export function beginRouteContentLoad(): () => void {
  pendingRouteContentCount += 1;
  notifyRouteContentPendingListeners();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    pendingRouteContentCount = Math.max(0, pendingRouteContentCount - 1);
    notifyRouteContentPendingListeners();
  };
}

/** Subscribes to route-content-pending changes; returns an unsubscribe function. */
export function subscribeRouteContentPending(
  listener: RouteContentPendingListener,
): () => void {
  routeContentPendingListeners.add(listener);
  listener(isRouteContentPending());
  return () => {
    routeContentPendingListeners.delete(listener);
  };
}

export interface CourseLesson {
  id: string;
  title: string;
  href: string;
}

export const COURSE_PROGRESS_STORAGE_KEY = "insightarena.course-progress.v1";

function readCourseProgress(): Record<string, string[]> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(COURSE_PROGRESS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, lessonIds]) =>
          Array.isArray(lessonIds) && lessonIds.every((lessonId) => typeof lessonId === "string"),
      ),
    ) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function getViewedLessonIds(courseId: string): string[] {
  return readCourseProgress()[courseId] ?? [];
}

export function markLessonViewed(courseId: string, lessonId: string): string[] {
  const progress = readCourseProgress();
  const viewedLessonIds = Array.from(new Set([...(progress[courseId] ?? []), lessonId]));

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        COURSE_PROGRESS_STORAGE_KEY,
        JSON.stringify({ ...progress, [courseId]: viewedLessonIds }),
      );
    } catch {
      // Storage can be unavailable in private browsing or restricted embeds.
    }
  }

  return viewedLessonIds;
}

export function getResumeLesson(
  courseId: string,
  lessons: CourseLesson[],
): CourseLesson | undefined {
  const viewedLessonIds = new Set(getViewedLessonIds(courseId));
  return lessons.find((lesson) => !viewedLessonIds.has(lesson.id)) ?? lessons.at(-1);
}

const STROOPS_PER_XLM = 10_000_000;

/**
 * Minimal shape needed to compute a per-position P&L breakdown. Kept
 * structural (rather than importing the `Position` type) so this module has
 * no dependency on any particular hook/data-fetching layer.
 */
export interface PnlPosition {
  pnl: string;
  status: "open" | "settled" | string;
}

export interface PnlBreakdown {
  /** P&L locked in because the position has settled, in stroops. */
  realized: number;
  /** Mark-to-market P&L for a still-open position, in stroops. */
  unrealized: number;
}

/**
 * Splits a position's P&L into realized vs. unrealized buckets.
 *
 * - Settled positions have already paid out (or lost their stake), so their
 *   entire P&L is realized.
 * - Open positions are only marked-to-market against `current_value`, so
 *   their P&L is unrealized until the market settles.
 */
export function computePositionPnl(position: PnlPosition): PnlBreakdown {
  const pnl = Number(position.pnl);
  const safePnl = Number.isNaN(pnl) ? 0 : pnl;

  if (position.status === "settled") {
    return { realized: safePnl, unrealized: 0 };
  }
  return { realized: 0, unrealized: safePnl };
}

/**
 * Aggregates realized/unrealized P&L (in stroops) across a set of positions.
 */
export function sumPnlBreakdown(positions: PnlPosition[]): PnlBreakdown {
  return positions.reduce<PnlBreakdown>(
    (totals, position) => {
      const { realized, unrealized } = computePositionPnl(position);
      return {
        realized: totals.realized + realized,
        unrealized: totals.unrealized + unrealized,
      };
    },
    { realized: 0, unrealized: 0 },
  );
}

function stroopsToXlmString(value: number): string {
  return (value / STROOPS_PER_XLM).toFixed(2);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Minimal shape needed to render a portfolio position as a CSV row.
 */
export interface PortfolioCsvPosition extends PnlPosition {
  market_title: string;
  outcome: string;
  stake: string;
  current_value: string;
  placed_at: string;
  resolved_at: string | null;
}

export const PORTFOLIO_CSV_HEADERS = [
  "Market",
  "Outcome",
  "Status",
  "Stake (XLM)",
  "Current Value (XLM)",
  "Realized P&L (XLM)",
  "Unrealized P&L (XLM)",
  "Total P&L (XLM)",
  "Placed At",
  "Resolved At",
] as const;

/**
 * Builds a CSV document (header row + one row per position) for the
 * portfolio P&L breakdown, suitable for a client-side download.
 */
export function positionsToCsv(positions: PortfolioCsvPosition[]): string {
  const rows = positions.map((position) => {
    const { realized, unrealized } = computePositionPnl(position);
    const total = realized + unrealized;

    return [
      csvEscape(position.market_title),
      csvEscape(position.outcome),
      csvEscape(position.status),
      stroopsToXlmString(Number(position.stake) || 0),
      stroopsToXlmString(Number(position.current_value) || 0),
      stroopsToXlmString(realized),
      stroopsToXlmString(unrealized),
      stroopsToXlmString(total),
      csvEscape(position.placed_at),
      csvEscape(position.resolved_at ?? ""),
    ].join(",");
  });

  return [PORTFOLIO_CSV_HEADERS.join(","), ...rows].join("\n");
}

/**
 * Triggers a client-side download of `content` as a file named `filename`.
 * No-op outside the browser (e.g. during SSR).
 */
export function downloadCsv(filename: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Active prediction cash-out estimate (#1600) ─────────────────────────────

/** Odds as implied probabilities in (0, 1]. */
export interface LiveOddsPrices {
  yes: number;
  no: number;
}

export type PredictionStance = "Yes" | "No" | "yes" | "no";

export interface CashOutEstimateInput {
  /** Stake in the same unit shown in the UI (e.g. XLM). */
  stake: number;
  /** Side the user took. */
  stance: PredictionStance;
  /** Implied price when the position was opened (0–1). */
  entryOdds: number;
  /** Latest live prices. */
  live: LiveOddsPrices | null;
  /** When true, early exit is unavailable. */
  marketLocked?: boolean;
}

export interface CashOutEstimate {
  /** Mark-to-market value if the user exited now. */
  estimatedValue: number;
  /** estimatedValue − stake */
  unrealizedPnl: number;
  /** Whether the UI should allow an early-exit action. */
  canExit: boolean;
  /** Short reason when canExit is false. */
  exitBlockedReason: string | null;
}

function clampProb(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p > 1) return 1;
  return p;
}

/**
 * Estimate cash-out value from live odds.
 *
 * Model: shares = stake / entryOdds; value = shares * currentOddsForSide.
 * If the market is locked or prices are missing/invalid, exit is disabled.
 */
export function estimateCashOut(input: CashOutEstimateInput): CashOutEstimate {
  const stake = Number(input.stake);
  const entry = clampProb(Number(input.entryOdds));
  const locked = Boolean(input.marketLocked);

  if (locked) {
    return {
      estimatedValue: Number.isFinite(stake) ? stake : 0,
      unrealizedPnl: 0,
      canExit: false,
      exitBlockedReason: "Market locked — early exit unavailable",
    };
  }

  if (!input.live || !Number.isFinite(stake) || stake <= 0 || entry <= 0) {
    return {
      estimatedValue: Number.isFinite(stake) ? stake : 0,
      unrealizedPnl: 0,
      canExit: false,
      exitBlockedReason: "Live odds unavailable",
    };
  }

  const stance = String(input.stance).toLowerCase();
  const current = clampProb(stance === "no" ? input.live.no : input.live.yes);
  if (current <= 0) {
    return {
      estimatedValue: 0,
      unrealizedPnl: -stake,
      canExit: false,
      exitBlockedReason: "Live odds unavailable",
    };
  }

  const shares = stake / entry;
  const estimatedValue = shares * current;
  const unrealizedPnl = estimatedValue - stake;

  return {
    estimatedValue,
    unrealizedPnl,
    canExit: true,
    exitBlockedReason: null,
  };
}

export function formatXlm(amount: number, digits = 2): string {
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toFixed(digits)} XLM`;
}

export function formatPnlXlm(pnl: number, digits = 2): string {
  if (!Number.isFinite(pnl)) return "—";
  const sign = pnl > 0 ? "+" : "";
  return `\( {sign} \){pnl.toFixed(digits)} XLM`;
      }
