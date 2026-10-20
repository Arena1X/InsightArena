import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReindexDto {
  @ApiProperty({ description: 'Starting ledger to reindex from' })
  @IsInt()
  @Min(1)
  from_ledger: number;
}

export class ReindexQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for paginated event fetching',
  })
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Limit per page', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
