import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import {
  LeaderboardQueryDto,
  LeaderboardEntryResponse,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import { PaginatedCursorResponse } from './dto/cursor-pagination.dto';
import {
  LeaderboardHistoryQueryDto,
  PaginatedLeaderboardHistoryResponse,
  PaginatedAddressHistoryResponse,
} from './dto/leaderboard-history.dto';
import { UserRankDto } from './dto/user-rank.dto';
import {
  RankHistoryQueryDto,
  RankHistoryResponse,
} from './dto/rank-history.dto';
import {
  LeaderboardSnapshotQueryDto,
  PaginatedSnapshotRankingResponse,
} from './dto/leaderboard-snapshot-query.dto';
import { CoachInsightsResponse } from './dto/coach-insights.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * Personalised weekly insights for the authenticated user. Auth required
   * (no @Public) so insights are always scoped to the caller. Declared before
   * the :address routes below.
   */
  @Get('coach/insights')
  @ApiOperation({
    summary:
      "Get the authenticated user's personalised leaderboard coach insights",
    description:
      'Returns accuracy trend, best/worst categories and streaks computed from resolved prediction history. When the user is below the minimum resolved-prediction threshold, has_history is false with an onboarding message instead of insights.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coach insights or the new-user onboarding shape',
    type: CoachInsightsResponse,
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async getCoachInsights(
    @CurrentUser() user: User,
  ): Promise<CoachInsightsResponse> {
    return this.leaderboardService.getCoachInsights(user);
  }

  @Get('top/:n')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Get top N leaderboard entries for the active season',
  })
  @ApiQuery({ name: 'n', required: true, type: Number, description: 'Max 20' })
  async getTopLeaderboard(
    @Param('n', ParseIntPipe) n: number,
  ): Promise<LeaderboardEntryResponse[]> {
    return this.leaderboardService.getTopLeaderboard(n);
  }

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get global leaderboard (all-time or by season)',
    description:
      'Supports opaque cursor-based pagination via `cursor`/`limit` (recommended for deep pagination — stable under concurrent score changes) or legacy `page`/`limit` offset pagination (deprecated, see the `page` param description).',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: "Opaque cursor from a previous response's nextCursor",
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Deprecated: prefer `cursor` for deep pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max 100',
  })
  @ApiQuery({ name: 'season_id', required: false, type: String })
  @ApiResponse({
    status: 200,
    description:
      'Paginated leaderboard with accuracy_rate computed server-side. Cursor shape (nextCursor/hasMore) when `cursor` or no `page` is used for the first page; offset shape (total/page) otherwise.',
  })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse | PaginatedCursorResponse> {
    if (query.cursor) {
      return this.leaderboardService.getLeaderboardCursor(query);
    }
    return this.leaderboardService.getLeaderboard(query);
  }

  @Get('history')
  @Public()
  @ApiOperation({ summary: 'Get historical leaderboard rankings' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'season_id', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Historical leaderboard with rank changes',
    type: PaginatedLeaderboardHistoryResponse,
  })
  async getHistory(
    @Query() query: LeaderboardHistoryQueryDto,
  ): Promise<
    PaginatedLeaderboardHistoryResponse | PaginatedAddressHistoryResponse
  > {
    if (query.address) {
      return this.leaderboardService.getHistoryForAddress(
        query.address,
        query.days,
        query.page,
        query.limit,
      );
    }
    return this.leaderboardService.getHistory(query);
  }

  @Get('snapshots')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Get leaderboard ranking as of a specific date',
    description:
      'Returns the ranking from the nearest snapshot on or before the requested date. A clear message is returned when the date is outside the retention window.',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    description: 'YYYY-MM-DD date to look up',
  })
  @ApiQuery({ name: 'season_id', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Historical ranking snapshot',
    type: PaginatedSnapshotRankingResponse,
  })
  async getSnapshots(
    @Query() query: LeaderboardSnapshotQueryDto,
  ): Promise<PaginatedSnapshotRankingResponse> {
    return this.leaderboardService.getSnapshots(query);
  }

  @Get(':address/rank-history')
  @Public()
  @ApiOperation({
    summary:
      "Get a user's rank/score history over time from periodic snapshots",
  })
  @ApiQuery({ name: 'season_id', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Rank history points with signed rank_delta vs. prior point',
    type: RankHistoryResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getRankHistory(
    @Param('address') address: string,
    @Query() query: RankHistoryQueryDto,
  ): Promise<RankHistoryResponse> {
    return this.leaderboardService.getRankHistory(address, query);
  }

  @Get(':address')
  @Public()
  @ApiOperation({
    summary: 'Get user rank and stats by Stellar address (public)',
    description:
      'Returns rank, reputation_score, season_points, total_predictions, correct_predictions, accuracy_rate, and total_winnings_stroops for a user. Returns 404 if user has no leaderboard entry.',
  })
  @ApiResponse({
    status: 200,
    description: 'User rank and leaderboard stats',
    type: UserRankDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found or has no leaderboard entry',
  })
  async getUserRank(@Param('address') address: string): Promise<UserRankDto> {
    return this.leaderboardService.getUserRank(address);
  }
}
