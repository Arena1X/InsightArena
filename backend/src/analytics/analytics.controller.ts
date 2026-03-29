import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import { MarketAnalyticsDto } from './dto/market-analytics.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aggregated dashboard KPIs for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard KPIs',
    type: DashboardKpisDto,
  })
  async getDashboard(@CurrentUser() user: User): Promise<DashboardKpisDto> {
    return this.analyticsService.getDashboard(user);
  }

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
