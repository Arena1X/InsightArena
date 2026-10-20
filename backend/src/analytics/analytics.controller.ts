import {
  Controller,
  Get,
  Param,
  Query,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import { MarketAnalyticsDto } from './dto/market-analytics.dto';
import { MarketHistoryResponseDto } from './dto/market-history.dto';
import { UserTrendsDto } from './dto/user-trends.dto';
import { CategoryAnalyticsResponseDto } from './dto/category-analytics.dto';
import { RetentionResponseDto, RetentionQueryDto } from './dto/retention.dto';
import { PlatformStatsDto } from './dto/platform-stats.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('active-users')
  @Public()
  @ApiOperation({
    summary: 'Get real-time active users gauge',
  })
  @ApiResponse({
    status: 200,
    description: 'Current active users count',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    },
  })
  getActiveUsers(): { count: number } {
    return { count: this.analyticsService.getActiveUsersCount() };
  }

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
  @ApiResponse({ status: 400, description: 'Invalid date range query' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketHistory(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DateRangeQueryDto,
    @Query('interval') interval?: string, // TODO: Implement interval-based aggregation
  ): Promise<MarketHistoryResponseDto> {
    const { from, to } = query.resolveRange();
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

  @Get('retention')
  @ApiBearerAuth()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Get user retention by signup cohort (admin only)' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Period granularity (default: week)',
  })
  @ApiQuery({
    name: 'periods',
    required: false,
    type: Number,
    description: 'Number of periods to analyze (default: 8, max 52)',
  })
  @ApiResponse({
    status: 200,
    description: 'Cohort-by-period retention matrix',
    type: RetentionResponseDto,
  })
  async getRetention(
    @Query() query: RetentionQueryDto,
  ): Promise<RetentionResponseDto> {
    return this.analyticsService.getRetention(
      query.period ?? 'week',
      query.periods ?? 8,
    );
  }

  @Get('platform')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: 'Get platform-wide public statistics' })
  @ApiResponse({
    status: 200,
    description:
      'Platform statistics: total markets, predictions, volume, active users, and active markets',
    type: PlatformStatsDto,
  })
  async getPlatformStats(): Promise<PlatformStatsDto> {
    return this.analyticsService.getPlatformStats();
  }
}
