import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single feed item representing a prediction made by a followed user.
 *
 * NOTE: "Activity" in this codebase is modelled as Prediction rows —
 * there is no separate activity/feed/event entity. This DTO reflects the
 * exact fields available on the Prediction entity plus the nested market
 * and author (user) data required for feed rendering.
 *
 * Broader activity types (market creation, competition joins, etc.) are
 * out of scope unless a dedicated activity entity is added in a future
 * iteration.
 *
 * NOTE: No blocked-users concept exists in this codebase (no user_blocks
 * table, no is_blocked column). Block exclusion will be added once that
 * model is introduced.
 */
export class FeedItemMarketDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  end_time: Date;

  @ApiPropertyOptional({ nullable: true })
  resolved_outcome: string | null;

  @ApiProperty()
  is_resolved: boolean;

  @ApiProperty()
  is_cancelled: boolean;
}

export class FeedItemAuthorDto {
  @ApiProperty()
  stellar_address: string;

  @ApiPropertyOptional({ nullable: true })
  username: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatar_url: string | null;

  @ApiProperty()
  reputation_score: number;
}

export class FeedItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  chosen_outcome: string;

  @ApiProperty()
  stake_amount_stroops: string;

  @ApiProperty()
  payout_claimed: boolean;

  @ApiProperty()
  payout_amount_stroops: string;

  @ApiPropertyOptional({ nullable: true })
  tx_hash: string | null;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  /** Timestamp used for recency ordering — maps to Prediction.submitted_at */
  @ApiProperty()
  submitted_at: Date;

  @ApiProperty({ type: () => FeedItemMarketDto })
  market: FeedItemMarketDto;

  @ApiProperty({ type: () => FeedItemAuthorDto })
  author: FeedItemAuthorDto;
}

export class FeedResponseDto {
  @ApiProperty({ type: () => [FeedItemDto] })
  data: FeedItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
