import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import { MarketAnalyticsDto } from './dto/market-analytics.dto';
import { MarketHistoryResponseDto } from './dto/market-history.dto';
import { UserTrendsDto } from './dto/user-trends.dto';
import { CategoryAnalyticsResponseDto } from './dto/category-analytics.dto';

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
    return this.analyticsService.getDashboardKPIs(user);
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

  @Get('markets/:id/history')
  @Public()
  @ApiOperation({ summary: 'Get historical data for a market over time' })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'End date (ISO string)',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    type: String,
    description: 'Time interval (hour, day, week)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Market history with prediction volume, pool size, and participant growth',
    type: MarketHistoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketHistory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') interval?: string, // TODO: Implement interval-based aggregation
  ): Promise<MarketHistoryResponseDto> {
    return this.analyticsService.getMarketHistory(id, from, to, interval);
  }

  @Get('users/:address/trends')
  @Public()
  @ApiOperation({ summary: 'Get user performance trends over time' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to retrieve (default 30, max 90)',
  })
  @ApiResponse({
    status: 200,
    description:
      'User trends including accuracy, volume, profit/loss, and category performance',
    type: UserTrendsDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserTrends(
    @Param('address') address: string,
    @Query('days') days?: number,
  ): Promise<UserTrendsDto> {
    return this.analyticsService.getUserTrends(address, days);
  }

  @Get('categories')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600) // 10 minutes
  @ApiOperation({ summary: 'Get category analytics and statistics' })
  @ApiResponse({
    status: 200,
    description:
      'Category analytics including market counts, volume, participants, and trending status',
    type: CategoryAnalyticsResponseDto,
  })
  async getCategoryAnalytics(): Promise<CategoryAnalyticsResponseDto> {
    return this.analyticsService.getCategoryAnalytics();
  }
}
