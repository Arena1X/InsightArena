import { Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  username: string;

  @Expose()
  stellar_address: string;

  @Expose()
  avatar_url: string;

  @Expose()
  total_predictions: number;

  @Expose()
  correct_predictions: number;

  @Expose()
  total_staked_stroops: string;

  @Expose()
  total_winnings_stroops: string;

  @Expose()
  reputation_score: number;

  @Expose()
  season_points: number;

  @Expose()
  role: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  profile_completeness: number;
}
