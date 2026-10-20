import { Expose, Type } from 'class-transformer';
import { PublicUserDto } from '../../users/dto/public-user.dto';

export class MarketResponseDto {
  @Expose()
  id: string;

  @Expose()
  on_chain_market_id: string;

  @Expose()
  @Type(() => PublicUserDto)
  creator: PublicUserDto;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  category: string;

  @Expose()
  outcome_options: string[];

  @Expose()
  end_time: Date;

  @Expose()
  resolution_time: Date;

  @Expose()
  is_resolved: boolean;

  @Expose()
  resolved_outcome: string;

  @Expose()
  is_public: boolean;

  @Expose()
  is_cancelled: boolean;

  @Expose()
  is_paused: boolean;

  @Expose()
  total_pool_stroops: string;

  @Expose()
  participant_count: number;

  @Expose()
  created_at: Date;
}
