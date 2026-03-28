import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AnalyticsService } from './analytics.service';
import { MarketAnalyticsDto } from './dto/market-analytics.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('markets/:id')
  @Public()
  @ApiOperation({ summary: 'Get market analytics and statistics' })
  @ApiResponse({
    status: 200,
    description:
      'Market analytics including pool size, outcome distribution, and time remaining',
    type: MarketAnalyticsDto,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketAnalytics(
    @Param('id') id: string,
  ): Promise<MarketAnalyticsDto> {
    return this.analyticsService.getMarketAnalytics(id);
  }
}
