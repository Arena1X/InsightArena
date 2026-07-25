import { ApiProperty } from '@nestjs/swagger';

export class DatabaseStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 4 })
  latency_ms: number;
}

export class SorobanStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 120 })
  latency_ms: number;
}

export class CacheStatusDto {
  @ApiProperty({ example: 'up' })
  status: string;

  @ApiProperty({ example: 1 })
  latency_ms: number;
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
