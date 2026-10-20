import { IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RankHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by season ID (omit for all-time rank history)',
  })
  @IsOptional()
  @IsUUID()
  season_id?: string;

  @ApiPropertyOptional({
    description: 'Start of the time range (ISO 8601), inclusive',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the time range (ISO 8601), inclusive',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RankHistoryPointResponse {
  @ApiProperty()
  captured_at: Date;

  @ApiProperty()
  rank: number;

  @ApiProperty()
  score: number;

  @ApiProperty({ nullable: true })
  rank_delta: number | null;
}

export class RankHistoryResponse {
  @ApiProperty()
  user_id: string;

  @ApiProperty({ type: [RankHistoryPointResponse] })
  data: RankHistoryPointResponse[];
}
