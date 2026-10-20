import { apiClient, ApiError } from '@/lib/api';

export interface RewardPayload {
  eventId: string;
  userId: string;
  amount: number;
}

export interface RewardResponse {
  success: boolean;
  transactionId: string;
}

export interface UserPayout {
  eventId?: string;
  userId?: string;
  amount?: number;
  amountXlm?: number | string;
  claimed?: boolean;
  status?: string;
  transactionId?: string;
}

export async function claimEventReward(payload: RewardPayload): Promise<RewardResponse> {
  try {
    const result = await apiClient.post<RewardResponse>('/rewards/claim', payload);
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Failed to claim reward (${error.status}): ${error.message}`);
      throw error;
    }
    throw new Error('An unexpected error occurred while claiming the reward.');
  }
}

export async function claimPayout(eventId: string, userId: string): Promise<UserPayout> {
  try {
    return await apiClient.post<UserPayout>(`/events/${eventId}/payout`, { userId });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Failed to claim payout (${error.status}): ${error.message}`);
      throw error;
    }
    throw new Error('An unexpected error occurred while claiming payout.');
  }
}

export async function finalizeEvent(eventId: string): Promise<void> {
  try {
    await apiClient.post<void>(`/events/${eventId}/finalize`);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Failed to finalize event (${error.status}): ${error.message}`);
      throw error;
    }
    throw new Error('An unexpected error occurred while finalizing the event.');
  }
}

export async function getUserPayout(eventId: string, userId: string): Promise<UserPayout | null> {
  try {
    return await apiClient.get<UserPayout>(`/events/${eventId}/payout?userId=${userId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    if (error instanceof ApiError) {
      console.error(`Failed to get user payout (${error.status}): ${error.message}`);
      throw error;
    }
    throw new Error('An unexpected error occurred while fetching user payout.');
  }
}