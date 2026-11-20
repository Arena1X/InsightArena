import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DatabaseStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 4 })
  latency_ms: number;

  @ApiPropertyOptional({
    description:
      'Reason the dependency was reported unhealthy (e.g. a probe timeout).',
    example: 'database probe timed out',
  })
  error?: string;
}

export class SorobanStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 120 })
  latency_ms: number;

  @ApiPropertyOptional({
    description:
      'Reason the dependency was reported unhealthy (e.g. a probe timeout).',
    example: 'soroban probe timed out',
  })
  error?: string;
}

export class CacheStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 1 })
  latency_ms: number;

  @ApiPropertyOptional({
    description:
      'Reason the dependency was reported unhealthy (e.g. a probe timeout).',
    example: 'cache probe timed out',
  })
  error?: string;
}

export class HealthSummaryDto {
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'], example: 'healthy' })
  status: 'healthy' | 'degraded' | 'down';

  @ApiProperty({ example: 3600 })
  uptime_seconds: number;
}

export class DetailedHealthDto extends HealthSummaryDto {
  @ApiProperty({ type: DatabaseStatusDto })
  database: DatabaseStatusDto;

  @ApiProperty({ type: SorobanStatusDto })
  soroban: SorobanStatusDto;

  @ApiProperty({ type: CacheStatusDto })
  cache: CacheStatusDto;
}
