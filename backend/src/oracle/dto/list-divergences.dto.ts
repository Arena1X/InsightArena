import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDivergencesQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

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
  limit?: number = 20;
}

export class DivergenceResponse {
  @ApiProperty() id: string;
  @ApiProperty() match_id: string;
  @ApiProperty() source_a_name: string;
  @ApiProperty({ type: Object }) source_a_value: Record<string, unknown>;
  @ApiProperty() source_b_name: string;
  @ApiProperty({ type: Object }) source_b_value: Record<string, unknown>;
  @ApiProperty() created_at: string;
}

export class PaginatedDivergencesResponse {
  @ApiProperty({ type: [DivergenceResponse] })
  data: DivergenceResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
