import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PayoutsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (max 100)',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class PayoutEntryDto {
  @ApiProperty({ description: 'Payout record UUID' })
  id: string;

  @ApiProperty({ description: 'On-chain event ID (string)' })
  event_id: string;

  @ApiProperty({ description: 'Stellar address of the participant' })
  user_address: string;

  @ApiProperty({
    description: 'Prize amount in stroops (1 XLM = 10_000_000 stroops)',
  })
  payout_amount_stroops: string;

  @ApiProperty({
    description: 'Whether the participant has claimed their prize',
  })
  is_claimed: boolean;

  @ApiProperty({ description: 'Final rank in the event leaderboard' })
  rank: number;

  @ApiProperty({ description: 'True when payout_amount_stroops > 0' })
  is_winner: boolean;

  @ApiProperty()
  created_at: Date;
}

export class PaginatedPayoutsDto {
  @ApiProperty({ type: [PayoutEntryDto] })
  data: PayoutEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
