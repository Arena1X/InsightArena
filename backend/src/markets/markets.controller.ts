import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { BanGuard } from '../common/guards/ban.guard';
import { User } from '../users/entities/user.entity';
import { BulkCreateMarketsDto } from './dto/bulk-create-markets.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import {
  ListMarketsDto,
  PaginatedMarketsResponse,
} from './dto/list-markets.dto';
import { PredictionStatsDto } from './dto/prediction-stats.dto';
import {
  PaginatedTrendingMarketsResponse,
  TrendingMarketsQueryDto,
} from './dto/trending-markets.dto';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { Market } from './entities/market.entity';
import { MarketsService } from './markets.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('Markets')
@Controller('markets')
export class MarketsController {
  constructor(
    private readonly marketsService: MarketsService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('templates')
  @Public()
  @ApiOperation({ summary: 'List predefined market templates' })
  @ApiResponse({
    status: 200,
    description: 'List of market templates',
    type: [MarketTemplate],
  })
  async getTemplates(): Promise<MarketTemplate[]> {
    return this.marketsService.getTemplates();
  }

  @Get('trending')
  @Public()
  @ApiOperation({ summary: 'Get trending/popular markets' })
  @ApiResponse({
    status: 200,
    description: 'Paginated trending markets sorted by trending score',
  })
  async getTrendingMarkets(
    @Query() query: TrendingMarketsQueryDto,
  ): Promise<PaginatedTrendingMarketsResponse> {
    return this.marketsService.getTrendingMarkets(query);
  }

  @Get(':id/predictions')
  @Public()
  @ApiOperation({ summary: 'Get prediction statistics for a market' })
  @ApiResponse({
    status: 200,
    description: 'Prediction statistics by outcome (anonymous)',
    type: [PredictionStatsDto],
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketPredictions(
    @Param('id') id: string,
  ): Promise<PredictionStatsDto[]> {
    return this.marketsService.getPredictionStats(id);
  }

  @Post()
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new prediction market' })
  @ApiResponse({ status: 201, description: 'Market created', type: Market })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async createMarket(
    @Body() dto: CreateMarketDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.create(dto, user);
  }

  @Post('bulk')
  @UseGuards(BanGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bulk create prediction markets (max 10 per request)',
  })
  @ApiResponse({
    status: 201,
    description: 'Markets created',
    type: [Market],
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or exceeds limit',
  })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async bulkCreateMarkets(
    @Body() dto: BulkCreateMarketsDto,
    @CurrentUser() user: User,
  ): Promise<Market[]> {
    return this.marketsService.createBulk(dto.markets, user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update market title, description, and/or category',
  })
  @ApiResponse({
    status: 200,
    description: 'Market updated',
    type: Market,
  })
  @ApiResponse({ status: 400, description: 'Market has already ended' })
  @ApiResponse({ status: 403, description: 'Not authorized to update' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async updateMarket(
    @Param('id') id: string,
    @Body() dto: UpdateMarketDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.update(id, user.id, dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List and filter markets with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated markets list',
  })
  async listMarkets(
    @Query() query: ListMarketsDto,
  ): Promise<PaginatedMarketsResponse> {
    return this.marketsService.findAllFiltered(query);
  }

  @Get('featured')
  @Public()
  @ApiOperation({ summary: 'Get featured markets' })
  @ApiResponse({
    status: 200,
    description: 'Paginated featured markets list',
  })
  async getFeaturedMarkets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedMarketsResponse> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 50) : 20;
    return this.marketsService.findFeaturedMarkets(pageNum, limitNum);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Fetch market by ID or on-chain ID' })
  @ApiResponse({
    status: 200,
    description: 'Market with nested creator profile',
    type: Market,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketById(@Param('id') id: string): Promise<Market> {
    return this.marketsService.findByIdOrOnChainId(id);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a prediction market' })
  @ApiResponse({ status: 200, description: 'Market cancelled', type: Market })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description: 'Market cannot be cancelled (already resolved)',
  })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async cancelMarket(@Param('id') id: string): Promise<Market> {
    return this.marketsService.cancelMarket(id);
  }

  @Post(':id/comments')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Post a comment on a market' })
  @ApiResponse({ status: 201, description: 'Comment posted', type: Comment })
  @ApiResponse({ status: 404, description: 'Market/Parent not found' })
  async postComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ): Promise<Comment> {
    return this.marketsService.createComment(id, dto, user);
  }

  @Get(':id/comments')
  @Public()
  @ApiOperation({ summary: 'Get comments for a market' })
  @ApiResponse({
    status: 200,
    description: 'List of comments (nested structure)',
    type: [Comment],
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getComments(@Param('id') id: string): Promise<Comment[]> {
    return this.marketsService.getComments(id);
  }

  @Get(':id/report')
  @Public()
  @ApiOperation({
    summary: 'Generate detailed market report with anonymized predictions',
  })
  @ApiResponse({
    status: 200,
    description: 'Market report with outcome distribution and timeline',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketReport(@Param('id') id: string): Promise<any> {
    return this.marketsService.generateMarketReport(id);
  }

  @Post(':id/bookmark')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmark a market' })
  @ApiResponse({ status: 201, description: 'Market bookmarked' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async bookmarkMarket(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketsService.addBookmark(id, user);
  }

  @Delete(':id/bookmark')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a market bookmark' })
  @ApiResponse({ status: 200, description: 'Bookmark removed' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async removeBookmark(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketsService.removeBookmark(id, user);
  }

  @Get(':id/history')
  @Public()
  @ApiOperation({
    summary: 'Get historical data for a market',
    description:
      'Returns pool size, participant count, and outcome probabilities over time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Historical data points',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketHistory(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getMarketHistory(id, from, to);
  }
}
