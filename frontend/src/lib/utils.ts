import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
