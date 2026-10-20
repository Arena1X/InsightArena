import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { CreatorEventsService } from './creator-events.service';
import { EventByCodeResponseDto } from './dto/event-by-code-response.dto';
import { ListMatchesQueryDto } from './dto/list-matches-query.dto';
import { ListParticipantsQueryDto } from './dto/list-participants-query.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { SearchEventsQueryDto } from './dto/search-events-query.dto';
import { SearchEventsResponseDto } from './dto/search-events-response.dto';
import { UserScoreResponseDto } from './dto/user-score-response.dto';
import { UserPredictionsResponseDto } from './dto/user-predictions-response.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import {
  PaginatedPayoutsDto,
  PayoutEntryDto,
  PayoutsQueryDto,
} from './dto/payouts.dto';

@ApiTags('creator-events')
@Controller('creator-events')
export class CreatorEventsController {
  constructor(private readonly creatorEventsService: CreatorEventsService) {}

  /**
   * GET /api/creator-events/search
   * #757 - Search creator events with relevance ranking and highlights.
   */
  @Get('search')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120) // 2 minutes
  @ApiOperation({ summary: 'Search creator events' })
  @ApiQuery({
    name: 'q',
    required: true,
    description:
      'Search query matched against event title, description, and creator address',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'cancelled', 'inactive', 'all'],
  })
  @ApiQuery({ name: 'creator', required: false })
  @ApiResponse({
    status: 200,
    description: 'Ranked creator event search results',
    type: SearchEventsResponseDto,
  })
  searchEvents(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: SearchEventsQueryDto,
  ) {
    return this.creatorEventsService.searchEvents(query);
  }

  /**
   * GET /api/creator-events/:id
   * #724 — Fetch a single event by ID with enriched details.
   */
  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120) // 2 minutes
  @ApiOperation({ summary: 'Get event by ID' })
  @ApiResponse({ status: 200, description: 'Event details with enriched data' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getEvent(@Param('id') id: string) {
    return this.creatorEventsService.getEventById(id);
  }

  /**
   * GET /api/creator-events/:id/participants
   * #734 — Fetch paginated participants for an event with scores.
   */
  @Get(':id/participants')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 1 minute
  @ApiOperation({
    summary: 'Get event participants with scores and pagination',
  })
  @ApiResponse({ status: 200, description: 'Paginated participant list' })
  getParticipants(
    @Param('id') id: string,
    @Query() query: ListParticipantsQueryDto,
  ) {
    return this.creatorEventsService.getParticipants(id, query);
  }

  /**
   * GET /api/creator-events/:id/leaderboard
   * Ranked event leaderboard. Reads from DB cache for finalized events,
   * falls back to live contract view otherwise.
   */
  @Get(':id/leaderboard')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30) // 30 seconds
  @ApiOperation({ summary: 'Get ranked leaderboard for an event' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated leaderboard entries' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getLeaderboard(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: LeaderboardQueryDto,
  ) {
    return this.creatorEventsService.getLeaderboard(id, query);
  }

  /**
   * GET /api/creator-events/:id/matches
   * #728 — Fetch all matches for an event with filtering and sorting.
   */
  @Get(':id/matches')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 1 minute
  @ApiOperation({ summary: 'Get event matches with filtering and sorting' })
  @ApiResponse({ status: 200, description: 'List of matches' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getEventMatches(
    @Param('id') id: string,
    @Query() query: ListMatchesQueryDto,
  ) {
    return this.creatorEventsService.getEventMatches(id, query);
  }

  /**
   * GET /api/creator-events/:id/matches/upcoming
   * #1131 — Fetch only future, unresolved matches ordered by match_time ASC.
   */
  @Get(':id/matches/upcoming')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Get upcoming (unresolved, future) matches for an event',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming matches ordered by match time',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getUpcomingMatches(@Param('id') id: string) {
    return this.creatorEventsService.getUpcomingMatches(id);
  }

  /**
   * GET /api/creator-events/:id/stats
   * #727 — Fetch detailed statistics for a specific event.
   */
  @Get(':id/stats')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120) // 2 minutes
  @ApiOperation({ summary: 'Get event statistics' })
  @ApiResponse({
    status: 200,
    description: 'Event statistics with prediction distribution',
    type: EventStatsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getEventStats(@Param('id') id: string): Promise<EventStatsResponseDto> {
    return this.creatorEventsService.getEventStats(id);
  }

  /**
   * GET /api/creator-events/:id/predictions/:address
   * #731 — Fetch all predictions a user has made for a specific event.
   */
  @Get(':id/predictions/:address')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30) // 30 seconds
  @ApiOperation({ summary: 'Get user predictions for an event' })
  @ApiResponse({
    status: 200,
    description: 'User predictions with match details and score',
    type: UserPredictionsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getUserPredictions(
    @Param('id') id: string,
    @Param('address') address: string,
  ): Promise<UserPredictionsResponseDto> {
    return this.creatorEventsService.getUserPredictionsForEvent(id, address);
  }

  /**
   * GET /api/creator-events/:id/score/:address
   * #733 — Fetch user score for an event.
   */
  @Get(':id/score/:address')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30) // 30 seconds
  @ApiOperation({ summary: 'Get user score for an event' })
  @ApiResponse({
    status: 200,
    description: 'User score details',
    type: UserScoreResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getUserScore(
    @Param('id') id: string,
    @Param('address') address: string,
  ): Promise<UserScoreResponseDto> {
    return this.creatorEventsService.getUserScore(id, address);
  }

  /**
   * GET /api/creator-events/:id/payouts
   * #958 — Paginated list of all prize payouts for a finalized event,
   * ordered by rank ascending. Returns 404 when the event does not exist
   * or has not been finalized yet.
   */
  @Get(':id/payouts')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 1 minute — payouts are immutable once created
  @ApiOperation({ summary: 'List all prize payouts for a finalized event' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paginated payout list ordered by rank',
    type: PaginatedPayoutsDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found or not finalized' })
  getPayouts(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PayoutsQueryDto,
  ): Promise<PaginatedPayoutsDto> {
    return this.creatorEventsService.getPayouts(id, query);
  }

  /**
   * GET /api/creator-events/:id/payouts/:address
   * #958 — Returns the payout record for a single address.
   * Returns 404 when the address did not participate or the event has not
   * been finalized.
   */
  @Get(':id/payouts/:address')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: 'Get prize payout for a specific address' })
  @ApiResponse({
    status: 200,
    description: 'Payout record for the address',
    type: PayoutEntryDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Address has no payout in this event',
  })
  getPayoutByAddress(
    @Param('id') id: string,
    @Param('address') address: string,
  ): Promise<PayoutEntryDto> {
    return this.creatorEventsService.getPayoutByAddress(id, address);
  }
}

@ApiTags('creator-events')
@Controller('creator-events')
export class PublicCreatorEventsController {
  constructor(private readonly creatorEventsService: CreatorEventsService) {}

  /**
   * GET /api/creator-events/invite/:code
   * #725 — Fetch event by invite code for public landing page.
   */
  @Public()
  @Get('invite/:code')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get event by invite code' })
  @ApiResponse({
    status: 200,
    description: 'Event details',
    type: EventByCodeResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getEventByInviteCode(
    @Param('code') code: string,
  ): Promise<EventByCodeResponseDto> {
    return this.creatorEventsService.getEventByInviteCode(code);
  }
}

@ApiTags('admin')
@Controller('admin/creator-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiBearerAuth()
export class AdminCreatorEventsController {
  constructor(private readonly creatorEventsService: CreatorEventsService) {}
}
