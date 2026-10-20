import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListVerifiedAddressesQueryDto {
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

  @ApiPropertyOptional({
    description: 'Search by address',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export interface VerifiedAddressResponse {
  address: string;
  verified_at: string;
  verified_by: string;
  events_created: number;
}

export interface PaginatedVerifiedAddressesResponse {
  data: VerifiedAddressResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
