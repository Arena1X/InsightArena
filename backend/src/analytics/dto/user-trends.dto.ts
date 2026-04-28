export class TrendDataPointDto {
  timestamp: Date;
  value: number;
}

export class CategoryPerformanceDto {
  category: string;
  accuracy_rate: number;
  prediction_count: number;
  profit_loss_stroops: string;
}

export class UserTrendsDto {
  address: string;
  accuracy_trend: TrendDataPointDto[];
  prediction_volume_trend: TrendDataPointDto[];
  profit_loss_trend: TrendDataPointDto[];
  category_performance: CategoryPerformanceDto[];
  best_category: CategoryPerformanceDto | null;
  worst_category: CategoryPerformanceDto | null;
}
