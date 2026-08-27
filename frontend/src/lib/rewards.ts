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
