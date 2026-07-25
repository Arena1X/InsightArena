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
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { BanGuard } from '../common/guards/ban.guard';
import { OptionalIdempotencyInterceptor } from '../common/idempotency/optional-idempotency.interceptor';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { User } from '../users/entities/user.entity';
import { BulkCreateMarketsDto } from './dto/bulk-create-markets.dto';
import { ChallengeResolutionDto } from './dto/challenge-resolution.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateDisputeDto } from '../disputes/dto/create-dispute.dto';
import { CreateMarketDto } from './dto/create-market.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { ProposeResolutionDto } from './dto/propose-resolution.dto';
import { ResolveChallengeDto } from './dto/resolve-challenge.dto';
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
import { MarketAnalyticsDto } from '../analytics/dto/market-analytics.dto';
import { DisputesService } from '../disputes/disputes.service';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto';

@ApiTags('Markets')
@Controller('markets')
export class MarketsController {
  constructor(
    private readonly marketsService: MarketsService,
    private readonly analyticsService: AnalyticsService,
    private readonly disputesService: DisputesService,
    private readonly idempotencyService: IdempotencyService,
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

  @Get(':id/analytics')
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

  // -------------------------------------------------------------------------
  // POST /markets — with optional idempotency
  // -------------------------------------------------------------------------

  @Post()
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseInterceptors(OptionalIdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a new prediction market' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Optional UUID. On re-submission the stored response is returned with ' +
      'Idempotency-Replayed: true. A different body with the same key returns 422.',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Market created', type: Market })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different request body',
  })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async createMarket(
    @Body() dto: CreateMarketDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.create(dto, user);
  }

  // -------------------------------------------------------------------------
  // POST /markets/bulk — with optional idempotency
  // -------------------------------------------------------------------------

  @Post('bulk')
  @UseGuards(BanGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseInterceptors(OptionalIdempotencyInterceptor)
  @ApiOperation({
    summary: 'Bulk create prediction markets (max 10 per request)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Optional UUID. Idempotent replay of bulk creation is supported.',
    required: false,
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
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different request body',
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

  // -------------------------------------------------------------------------
  // GET /markets — list with pagination metadata
  // -------------------------------------------------------------------------

  @Get()
  @Public()
  @ApiOperation({ summary: 'List and filter markets with pagination' })
  @ApiResponse({
    status: 200,
    description:
      'Paginated markets list. Returns meta.totalPages alongside results. ' +
      'limit is bounded to 1–100; out-of-range values return 400.',
  })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters' })
  async listMarkets(
    @Query() query: ListMarketsDto,
  ): Promise<PaginatedMarketsResponse> {
    const result = await this.marketsService.findAllFiltered(query);
    return {
      ...result,
      totalPages: buildPaginationMeta(result.total, result.page, result.limit)
        .totalPages,
    };
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
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    const result = await this.marketsService.findFeaturedMarkets(
      pageNum,
      limitNum,
    );
    return {
      ...result,
      totalPages: buildPaginationMeta(result.total, result.page, result.limit)
        .totalPages,
    };
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a prediction market (creator or admin)' })
  @ApiResponse({ status: 200, description: 'Market cancelled', type: Market })
  @ApiResponse({
    status: 400,
    description: 'Market has already ended or is resolved',
  })
  @ApiResponse({ status: 403, description: 'Caller is not creator or admin' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async cancelMarket(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.cancelMarket(id, user);
  }

  @Post(':id/pause')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pause a prediction market (admin only)' })
  @ApiResponse({ status: 200, description: 'Market paused', type: Market })
  @ApiResponse({ status: 400, description: 'Market cannot be paused' })
  @ApiResponse({ status: 403, description: 'Caller is not admin' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async pauseMarket(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.pauseMarket(id, user);
  }

  @Post(':id/resume')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a prediction market (admin only)' })
  @ApiResponse({ status: 200, description: 'Market resumed', type: Market })
  @ApiResponse({ status: 400, description: 'Market cannot be resumed' })
  @ApiResponse({ status: 403, description: 'Caller is not admin' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async resumeMarket(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.resumeMarket(id, user);
  }

  @Post(':id/propose-resolution')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Propose a resolution outcome, starting the grace/challenge window',
  })
  @ApiResponse({
    status: 200,
    description: 'Resolution proposed, market awaiting settlement',
    type: Market,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid outcome or market has not ended',
  })
  @ApiResponse({ status: 403, description: 'Caller is not creator or admin' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({
    status: 409,
    description: 'Market already resolved or resolution already proposed',
  })
  async proposeResolution(
    @Param('id') id: string,
    @Body() dto: ProposeResolutionDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.proposeResolution(id, dto, user);
  }

  @Post(':id/challenge')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Challenge a proposed resolution before the grace period elapses',
  })
  @ApiResponse({
    status: 200,
    description:
      'Challenge recorded, auto-settlement frozen pending admin review',
    type: Market,
  })
  @ApiResponse({
    status: 400,
    description:
      'No pending resolution to challenge, or challenge window closed',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async challengeResolution(
    @Param('id') id: string,
    @Body() dto: ChallengeResolutionDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.challengeResolution(id, dto, user);
  }

  @Post(':id/resolve-challenge')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve a challenged market (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Challenge resolved and market settled',
    type: Market,
  })
  @ApiResponse({
    status: 400,
    description: 'No active challenge, or invalid outcome',
  })
  @ApiResponse({ status: 403, description: 'Caller is not admin' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async resolveChallenge(
    @Param('id') id: string,
    @Body() dto: ResolveChallengeDto,
    @CurrentUser() user: User,
  ): Promise<Market> {
    return this.marketsService.resolveChallenge(id, dto, user);
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

  // -------------------------------------------------------------------------
  // GET /markets/:id/comments — paginated with metadata
  // -------------------------------------------------------------------------

  @Get(':id/comments')
  @Public()
  @ApiOperation({ summary: 'Get comments for a market (paginated)' })
  @ApiResponse({
    status: 200,
    description:
      'Paginated list of comments with total, page, limit, totalPages. ' +
      'limit is bounded to 1–100; out-of-range values return 400.',
  })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getComments(
    @Param('id') id: string,
    @Query() query: ListCommentsDto,
  ): Promise<{
    data: Comment[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const result = await this.marketsService.getComments(
      id,
      query.page,
      query.limit,
    );
    return {
      ...result,
      totalPages: buildPaginationMeta(result.total, result.page, result.limit)
        .totalPages,
    };
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

  // -------------------------------------------------------------------------
  // GET /markets/:id/history — paginated via PaginationQueryDto
  // -------------------------------------------------------------------------

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
  @ApiResponse({ status: 400, description: 'Invalid date range query' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketHistory(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DateRangeQueryDto,
  ) {
    const { from, to } = query.resolveRange();
    return this.analyticsService.getMarketHistory(id, from, to);
  }

  @Post(':id/dispute')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Raise a dispute for a resolved market' })
  @ApiResponse({
    status: 201,
    description: 'Dispute created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Dispute window has passed or market not resolved',
  })
  @ApiResponse({
    status: 409,
    description: 'Dispute already raised for this market',
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async raiseDispute(
    @Param('id') id: string,
    @Body() createDisputeDto: { reason: string },
    @CurrentUser() user: User,
  ) {
    const disputeDto: CreateDisputeDto = {
      market_id: id,
      reason: createDisputeDto.reason,
    };
    return this.disputesService.create(disputeDto, user);
  }
}
