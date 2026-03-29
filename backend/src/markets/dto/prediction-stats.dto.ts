import { Expose } from 'class-transformer';

export class PredictionStatsDto {
  @Expose()
  outcome: string;

  @Expose()
  count: number;

  @Expose()
  total_staked_stroops: string;
}
