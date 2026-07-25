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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function toRewardsSummary(response: RewardsSummaryResponse): RewardsSummary {
  return {
    totalEarnedXlm: response.total_earned_xlm,
    claimableXlm: response.claimable_xlm,
    vestingXlm: response.vesting_xlm,
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
