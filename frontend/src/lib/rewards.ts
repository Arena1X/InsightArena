export type RewardsSummary = {
  totalEarnedXlm: number;
  claimableXlm: number;
  vestingXlm: number;
};

export type ClaimRewardsResult = {
  claimedXlm: number;
  claimedCount: number;
  transactionHash: string;
  summary: RewardsSummary;
};

/** A single reward tied to one prediction — either claimable now or still vesting. */
export type RewardItemStatus = "claimable" | "vesting";

// ── Reward type display config ────────────────────────────────────────────
//
// The single source of truth for how a reward *type* (as opposed to a
// reward *status*, see RewardStatusBadge, which is a separate concept with
// its own values) maps to a label and color. RewardTypeBadge is the only
// consumer today; centralized here per this issue's own naming of this file
// as the target, so a second consumer (e.g. RewardSourceRow, if it's ever
// wired up to render reward-type-colored bars instead of taking a raw
// barColor prop from its caller) has one place to read the same mapping
// from instead of re-declaring it.

export type RewardType =
  | "competition"
  | "prediction"
  | "referral"
  | "airdrop"
  | "bonus";

export interface RewardTypeDisplay {
  label: string;
  className: string;
}

const NEUTRAL_BADGE_CLASSNAME = "bg-white/5 text-gray-300 border border-white/10";

export const rewardTypeConfig: Record<RewardType, RewardTypeDisplay> = {
  competition: { label: "Competition", className: NEUTRAL_BADGE_CLASSNAME },
  prediction: {
    label: "Prediction",
    className: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  },
  referral: { label: "Referral", className: NEUTRAL_BADGE_CLASSNAME },
  airdrop: {
    label: "Airdrop",
    className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  },
  bonus: { label: "Bonus", className: NEUTRAL_BADGE_CLASSNAME },
};

/** Fallback for a reward type that isn't (or isn't yet) in `rewardTypeConfig`,
 * e.g. a value newly added on the backend before the frontend map catches up. */
export const unknownRewardTypeDisplay: RewardTypeDisplay = {
  label: "Other",
  className: NEUTRAL_BADGE_CLASSNAME,
};

/** Looks up a reward type's display config, falling back to
 * `unknownRewardTypeDisplay` for any value outside the known `RewardType`
 * union rather than throwing. */
export function getRewardTypeDisplay(type: string): RewardTypeDisplay {
  return rewardTypeConfig[type as RewardType] ?? unknownRewardTypeDisplay;
}

export type RewardItem = {
  id: string;
  marketId: string;
  marketTitle: string;
  amountXlm: number;
  status: RewardItemStatus;
};

export type ClaimRewardItemResult = {
  id: string;
  claimedXlm: number;
  transactionHash: string;
};

// ── Rewards history table: sorting + CSV export ──────────────────────────
//
// Shared, framework-agnostic helpers for RewardHistoryTable so the sort
// comparator and CSV serialization can be unit-tested without rendering the
// component. The table renders the same `RewardHistoryRow` shape it exports.

export type RewardHistoryRow = {
  id: string;
  /** ISO-8601 timestamp; may be missing for legacy rows. */
  date?: string | null;
  type?: string | null;
  amountXlm?: number | null;
  source?: string | null;
};

/** Columns the history table can be sorted by. */
export type RewardHistorySortKey = "date" | "type" | "amount" | "source";

export type SortDirection = "asc" | "desc";

export type RewardHistorySort = {
  key: RewardHistorySortKey;
  direction: SortDirection;
};

/** Stable default sort: newest rewards first. */
export const DEFAULT_REWARD_HISTORY_SORT: RewardHistorySort = {
  key: "date",
  direction: "desc",
};

/** Placeholder rendered (and exported) for a missing/empty field value. */
export const EMPTY_REWARD_FIELD = "—";

/**
 * Toggles the sort for a clicked column: clicking the active column flips
 * direction, clicking a different column switches to it with a sensible
 * starting direction (descending for date/amount, ascending for text).
 */
export function toggleRewardHistorySort(
  current: RewardHistorySort,
  key: RewardHistorySortKey,
): RewardHistorySort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }

  const defaultDirection: SortDirection =
    key === "date" || key === "amount" ? "desc" : "asc";
  return { key, direction: defaultDirection };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Compares two rows for the given sort. Missing values always sort last
 * regardless of direction so empty rows never crowd the top of the table.
 * Ties fall back to `id` for a stable, deterministic order.
 */
export function compareRewardHistoryRows(
  a: RewardHistoryRow,
  b: RewardHistoryRow,
  sort: RewardHistorySort,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  let result = 0;

  switch (sort.key) {
    case "date": {
      const aTime = a.date ? Date.parse(a.date) : NaN;
      const bTime = b.date ? Date.parse(b.date) : NaN;
      const aMissing = Number.isNaN(aTime);
      const bMissing = Number.isNaN(bTime);
      if (aMissing && bMissing) result = 0;
      else if (aMissing) return 1;
      else if (bMissing) return -1;
      else result = aTime - bTime;
      break;
    }
    case "amount": {
      const aAmount = typeof a.amountXlm === "number" ? a.amountXlm : null;
      const bAmount = typeof b.amountXlm === "number" ? b.amountXlm : null;
      if (aAmount === null && bAmount === null) result = 0;
      else if (aAmount === null) return 1;
      else if (bAmount === null) return -1;
      else result = aAmount - bAmount;
      break;
    }
    case "type": {
      const aType = a.type?.trim();
      const bType = b.type?.trim();
      if (!aType && !bType) result = 0;
      else if (!aType) return 1;
      else if (!bType) return -1;
      else result = compareText(aType, bType);
      break;
    }
    case "source": {
      const aSource = a.source?.trim();
      const bSource = b.source?.trim();
      if (!aSource && !bSource) result = 0;
      else if (!aSource) return 1;
      else if (!bSource) return -1;
      else result = compareText(aSource, bSource);
      break;
    }
  }

  if (result !== 0) return result * direction;
  return compareText(a.id, b.id);
}

/** Returns a new array sorted by `sort` without mutating the input. */
export function sortRewardHistoryRows(
  rows: RewardHistoryRow[],
  sort: RewardHistorySort,
): RewardHistoryRow[] {
  return [...rows].sort((a, b) => compareRewardHistoryRows(a, b, sort));
}

/** Renders a field value for display, substituting a placeholder when empty. */
export function formatRewardHistoryCell(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return EMPTY_REWARD_FIELD;
  if (typeof value === "string" && value.trim() === "") {
    return EMPTY_REWARD_FIELD;
  }
  return String(value);
}

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const REWARD_HISTORY_CSV_HEADERS = [
  "Date",
  "Type",
  "Amount (XLM)",
  "Source",
] as const;

/**
 * Serializes the given (already filtered and sorted) rows to CSV. Missing
 * fields become empty cells so the export stays parseable; the caller is
 * responsible for passing exactly the rows currently visible in the table.
 */
export function rewardHistoryRowsToCsv(rows: RewardHistoryRow[]): string {
  const lines = [REWARD_HISTORY_CSV_HEADERS.join(",")];

  for (const row of rows) {
    const cells = [
      row.date ?? "",
      row.type ?? "",
      typeof row.amountXlm === "number" ? String(row.amountXlm) : "",
      row.source ?? "",
    ];
    lines.push(cells.map((cell) => escapeCsvValue(String(cell))).join(","));
  }

  return lines.join("\n");
}

type RewardsSummaryResponse = {
  total_earned_xlm: number;
  claimable_xlm: number;
  vesting_xlm: number;
};

type ClaimAllRewardsResponse = {
  claimed_xlm: number;
  claimed_count: number;
  transaction_hash: string;
  summary: RewardsSummaryResponse;
};

type PredictionWithStatusResponse = {
  id: string;
  stake_amount_stroops: string;
  payout_claimed: boolean;
  market: {
    id: string;
    title: string;
  };
};

type PaginatedPredictionsResponse = {
  data: PredictionWithStatusResponse[];
};

type ClaimPredictionResponse = {
  id: string;
  payout_amount_stroops: string;
  tx_hash: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const STROOPS_PER_XLM = 10_000_000;

/** Max predictions to pull per claimable/vesting bucket for the wallet card's item list. */
const REWARD_ITEMS_PAGE_LIMIT = 50;

function toRewardsSummary(response: RewardsSummaryResponse): RewardsSummary {
  return {
    totalEarnedXlm: response.total_earned_xlm,
    claimableXlm: response.claimable_xlm,
    vestingXlm: response.vesting_xlm,
  };
}

function stroopsToXlm(stroops: string | number): number {
  return Number(stroops) / STROOPS_PER_XLM;
}

function toRewardItem(
  prediction: PredictionWithStatusResponse,
  status: RewardItemStatus,
): RewardItem {
  return {
    id: prediction.id,
    marketId: prediction.market.id,
    marketTitle: prediction.market.title,
    amountXlm: stroopsToXlm(prediction.stake_amount_stroops),
    status,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetches the claimable/vesting rewards summary for the authenticated user.
 * Backed by `GET /api/predictions/rewards/summary` (see
 * `backend/src/predictions/predictions.controller.ts`).
 */
export async function getRewardsSummary(
  token: string,
): Promise<RewardsSummary> {
  const response = await fetch(`${API_BASE_URL}/api/predictions/rewards/summary`, {
    headers: authHeaders(token),
    cache: "no-store",
  });

  const data = await parseJsonResponse<RewardsSummaryResponse>(response);
  return toRewardsSummary(data);
}

/**
 * Claims every currently-claimable reward for the authenticated user. The
 * backend submits/signs the underlying Soroban transaction(s) (see
 * `predictions.service.ts::claimAllRewards`) and returns the resulting
 * transaction hash plus the refreshed balances.
 */
export async function claimRewards(token: string): Promise<ClaimRewardsResult> {
  const response = await fetch(`${API_BASE_URL}/api/predictions/rewards/claim`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
  });

  const data = await parseJsonResponse<ClaimAllRewardsResponse>(response);
  return {
    claimedXlm: data.claimed_xlm,
    claimedCount: data.claimed_count,
    transactionHash: data.transaction_hash,
    summary: toRewardsSummary(data.summary),
  };
}

/**
 * Fetches the authenticated user's individual claimable and vesting reward
 * items (one per prediction), so the wallet UI can offer a per-item claim
 * action alongside the aggregate totals from `getRewardsSummary`. Backed by
 * `GET /api/predictions/me` (see `predictions.controller.ts::getMyPredictions`).
 */
export async function getRewardItems(token: string): Promise<RewardItem[]> {
  const params = `limit=${REWARD_ITEMS_PAGE_LIMIT}`;
  const [wonResponse, activeResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/api/predictions/me?status=won&${params}`, {
      headers: authHeaders(token),
      cache: "no-store",
    }),
    fetch(`${API_BASE_URL}/api/predictions/me?status=active&${params}`, {
      headers: authHeaders(token),
      cache: "no-store",
    }),
  ]);

  const [won, active] = await Promise.all([
    parseJsonResponse<PaginatedPredictionsResponse>(wonResponse),
    parseJsonResponse<PaginatedPredictionsResponse>(activeResponse),
  ]);

  const claimable = won.data
    .filter((prediction) => !prediction.payout_claimed)
    .map((prediction) => toRewardItem(prediction, "claimable"));
  const vesting = active.data.map((prediction) =>
    toRewardItem(prediction, "vesting"),
  );

  return [...claimable, ...vesting];
}

/**
 * Claims the payout for a single winning prediction. Backed by
 * `POST /api/predictions/:id/claim` (see `predictions.controller.ts::claimPayout`).
 */
export async function claimRewardItem(
  token: string,
  itemId: string,
): Promise<ClaimRewardItemResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/predictions/${itemId}/claim`,
    {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
    },
  );

  const data = await parseJsonResponse<ClaimPredictionResponse>(response);
  return {
    id: data.id,
    claimedXlm: stroopsToXlm(data.payout_amount_stroops),
    transactionHash: data.tx_hash ?? "",
  };
}
