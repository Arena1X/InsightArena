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

  @ApiProperty({ example: 0.85 })
  hit_rate: number;
}

export class DetailedHealthDto {
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'], example: 'healthy' })
  status: 'healthy' | 'degraded' | 'down';

  @ApiProperty({ type: DatabaseStatusDto })
  database: DatabaseStatusDto;

  @ApiProperty({ type: SorobanStatusDto })
  soroban: SorobanStatusDto;

  @ApiProperty({ type: CacheStatusDto })
  cache: CacheStatusDto;

  @ApiProperty({ example: 3600 })
  uptime_seconds: number;
}
