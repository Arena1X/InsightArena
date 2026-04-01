import { IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platform_fee_percent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_stake_stroops?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_markets_per_user?: number;

  @IsOptional()
  @IsBoolean()
  maintenance_mode?: boolean;

  @IsOptional()
  @IsBoolean()
  feature_competitions?: boolean;

  @IsOptional()
  @IsBoolean()
  feature_leaderboard?: boolean;
}

export interface SystemConfigValues {
  platform_fee_percent: number;
  min_stake_stroops: number;
  max_markets_per_user: number;
  maintenance_mode: boolean;
  feature_competitions: boolean;
  feature_leaderboard: boolean;
}

export const DEFAULT_CONFIG: SystemConfigValues = {
  platform_fee_percent: 2,
  min_stake_stroops: 1000000,
  max_markets_per_user: 10,
  maintenance_mode: false,
  feature_competitions: true,
  feature_leaderboard: true,
};
