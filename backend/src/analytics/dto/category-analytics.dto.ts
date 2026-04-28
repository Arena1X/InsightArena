export class CategoryStatsDto {
  name: string;
  total_markets: number;
  active_markets: number;
  total_volume_stroops: string;
  avg_participants: number;
  trending: boolean;
}

export class CategoryAnalyticsResponseDto {
  categories: CategoryStatsDto[];
  generated_at: Date;
}
