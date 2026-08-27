import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Market, MarketSettlementState } from '../entities/market.entity';

export class PublicMarketCreatorDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  username: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatar_url: string | null;
}

export class PublicMarketResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  on_chain_market_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ type: [String] })
  outcome_options: string[];

  @ApiProperty()
  end_time: Date;

  @ApiProperty()
  resolution_time: Date;

  @ApiProperty()
  is_resolved: boolean;

  @ApiPropertyOptional({ nullable: true })
  resolved_outcome: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolved_at: Date | null;

  @ApiProperty({ enum: MarketSettlementState })
  settlement_state: MarketSettlementState;

  @ApiProperty()
  is_featured: boolean;

  @ApiProperty()
  total_pool_stroops: string;

  @ApiProperty()
  participant_count: number;

  @ApiProperty()
  created_at: Date;

  @ApiPropertyOptional({ type: PublicMarketCreatorDto, nullable: true })
  creator: PublicMarketCreatorDto | null;

  static fromEntity(market: Market): PublicMarketResponseDto {
    return {
      id: market.id,
      on_chain_market_id: market.on_chain_market_id,
      title: market.title,
      description: market.description,
      category: market.category,
      outcome_options: market.outcome_options,
      end_time: market.end_time,
      resolution_time: market.resolution_time,
      is_resolved: market.is_resolved,
      resolved_outcome: market.resolved_outcome ?? null,
      resolved_at: market.resolved_at,
      settlement_state: market.settlement_state,
      is_featured: market.is_featured,
      total_pool_stroops: market.total_pool_stroops,
      participant_count: market.participant_count,
      created_at: market.created_at,
      creator: market.creator
        ? {
            id: market.creator.id,
            username: market.creator.username,
            avatar_url: market.creator.avatar_url,
          }
        : null,
    };
  }
}

export class PaginatedPublicMarketsResponseDto {
  @ApiProperty({ type: [PublicMarketResponseDto] })
  data: PublicMarketResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
