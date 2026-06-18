export type UserPayout = {
  amountXlm: number;
  claimed: boolean;
  transactionHash?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function finalizeEvent(eventId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/creator-events/${eventId}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );

  return parseJsonResponse(response);
}

export async function claimPayout(eventId: string, walletAddress: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/creator-events/${eventId}/payouts/${walletAddress}/claim`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );

  return parseJsonResponse<UserPayout>(response);
}

export async function getUserPayout(
  eventId: string,
  walletAddress: string,
): Promise<UserPayout | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/creator-events/${eventId}/payouts/${walletAddress}`,
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  return parseJsonResponse<UserPayout>(response);
}
