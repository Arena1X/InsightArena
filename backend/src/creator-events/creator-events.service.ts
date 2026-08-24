import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ContractService,
  ContractEvent,
  ContractConfig,
  ContractParticipant,
  ContractMatch,
} from '../contract/contract.service';
import { SearchService } from '../search/search.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';
import { CreatorEventLeaderboardEntry } from '../matches/entities/creator-event-leaderboard-entry.entity';
import { CreatorEventPayout } from '../matches/entities/creator-event-payout.entity';
import {
  EventByCodeResponseDto,
  MatchPreviewDto,
} from './dto/event-by-code-response.dto';
import {
  ListMatchesQueryDto,
  MatchSortBy,
  MatchStatus,
  SortOrder,
} from './dto/list-matches-query.dto';
import {
  ListParticipantsQueryDto,
  ParticipantSortBy,
  SortOrder as ParticipantSortOrder,
} from './dto/list-participants-query.dto';
import { SearchEventsQueryDto } from './dto/search-events-query.dto';
import {
  SearchEventResultDto,
  SearchEventsResponseDto,
  SearchHighlightsDto,
} from './dto/search-events-response.dto';
import { UserScoreResponseDto } from './dto/user-score-response.dto';
import { UserPredictionsResponseDto } from './dto/user-predictions-response.dto';
import { EventStatsResponseDto } from './dto/event-stats-response.dto';
import {
  LeaderboardQueryDto,
  LeaderboardEntryResponse,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import {
  PayoutsQueryDto,
  PaginatedPayoutsDto,
  PayoutEntryDto,
} from './dto/payouts.dto';
import {
  normalizeContractPrediction,
  resolveCorrectness,
} from './utils/prediction.util';

// Type definitions - exported for use in controllers
export interface ParticipantWithStats {
  address: string;
  joinedAt: number;
  totalPredictions: number;
  correctPredictions: number;
  accuracyPct: number;
  rank: number;
}

export interface PaginatedParticipants {
  data: ParticipantWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EnrichedEvent extends ContractEvent {
  matchCount: number;
  matchPreview: MatchPreviewDto[];
  winnerCount: number;
  creatorVerified: boolean;
}

@Injectable()
export class CreatorEventsService {
  private readonly logger = new Logger(CreatorEventsService.name);

  constructor(
    private readonly contractService: ContractService,
    private readonly searchService: SearchService,
    @InjectRepository(CreatorEvent)
    private readonly creatorEventRepository: Repository<CreatorEvent>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(MatchPrediction)
    private readonly matchPredictionRepository: Repository<MatchPrediction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CreatorEventLeaderboardEntry)
    private readonly leaderboardEntryRepository: Repository<CreatorEventLeaderboardEntry>,
    @InjectRepository(CreatorEventPayout)
    private readonly creatorEventPayoutRepository: Repository<CreatorEventPayout>,
  ) {}

  async searchEvents(
    query: SearchEventsQueryDto,
  ): Promise<SearchEventsResponseDto> {
    const searchTerm = query.q?.trim() ?? '';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (!searchTerm) {
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        query: searchTerm,
      };
    }

    const { data: hits, total } = await this.searchService.searchCreatorEvents({
      query: searchTerm,
      skip: (page - 1) * limit,
      limit,
      status: query.status,
      creator: query.creator,
    });

    return {
      data: hits.map(({ event, searchRank }) =>
        this.toSearchResult(event, searchRank, searchTerm),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: searchTerm,
    };
  }

  async getEventById(id: string): Promise<EnrichedEvent> {
    const event = await this.contractService.getEvent(id);

    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }

    const [matches, winners, creatorVerified] = await Promise.all([
      this.contractService.getEventMatches(id),
      this.contractService.getEventWinners(id),
      this.contractService.isVerified(event.creator),
    ]);

    return {
      ...event,
      matchCount: matches.length,
      matchPreview: matches.slice(0, 5).map((m) => ({
        matchId: m.matchId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        startTime: m.startTime,
      })),
      winnerCount: winners.length,
      creatorVerified,
    };
  }

  async getParticipants(
    eventId: string,
    query: ListParticipantsQueryDto,
  ): Promise<PaginatedParticipants> {
    const raw: ContractParticipant[] =
      await this.contractService.getEventParticipants(eventId);

    const withStats: ParticipantWithStats[] = raw.map((p, i) => {
      const correct =
        typeof (p as ContractParticipant & { correctPredictions?: number })
          .correctPredictions === 'number'
          ? (p as ContractParticipant & { correctPredictions: number })
              .correctPredictions
          : 0;
      const accuracy =
        p.predictionCount > 0
          ? Math.round((correct / p.predictionCount) * 100)
          : 0;
      return {
        address: p.address,
        joinedAt: p.joinedAt,
        totalPredictions: p.predictionCount,
        correctPredictions: correct,
        accuracyPct: accuracy,
        rank: i + 1,
      };
    });

    const sorted = this.sortParticipants(
      withStats,
      query.sortBy,
      query.sortOrder,
    );
    sorted.forEach((p, i) => {
      p.rank = i + 1;
    });

    const total = sorted.length;
    const start = (query.page - 1) * query.limit;
    const data = sorted.slice(start, start + query.limit);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getContractConfig(): Promise<ContractConfig> {
    const config = await this.contractService.getConfig();

    if (!config) {
      this.logger.warn(
        'getContractConfig: contract returned null, returning defaults',
      );
      return {
        admin: '',
        aiAgent: '',
        treasury: '',
        celoToken: '',
        creationFee: '0',
        paused: false,
      };
    }

    return config;
  }

  async getUpcomingMatches(eventId: string): Promise<Match[]> {
    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: Number(eventId) as unknown as number },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }
    return this.matchRepository
      .createQueryBuilder('match')
      .where('match.event_id = :eventId', { eventId: event.id })
      .andWhere('match.match_time > :now', { now: new Date() })
      .andWhere('match.result_submitted = false')
      .orderBy('match.match_time', 'ASC')
      .getMany();
  }

  async getEventMatches(
    eventId: string,
    query: ListMatchesQueryDto,
  ): Promise<
    Array<ContractMatch & { predictionCount: number; userPrediction?: string }>
  > {
    const event = await this.contractService.getEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    let matches = await this.contractService.getEventMatches(eventId);

    if (query.status !== MatchStatus.All) {
      matches = matches.filter((m) => {
        if (query.status === MatchStatus.Pending) {
          return !m.resolved;
        }
        if (query.status === MatchStatus.Completed) {
          return m.resolved;
        }
        return true;
      });
    }

    matches = this.sortMatches(matches, query.sortBy, query.sortOrder);

    return matches.map((m) => ({
      ...m,
      predictionCount: 0,
    }));
  }

  async getEventByInviteCode(code: string): Promise<EventByCodeResponseDto> {
    const event = await this.contractService.getEventByCode(code);

    if (!event) {
      throw new NotFoundException(`Event with invite code ${code} not found`);
    }

    const [matches] = await Promise.all([
      this.contractService.getEventMatches(event.eventId),
      this.contractService.getEventWinners(event.eventId),
    ]);

    let status: 'active' | 'full' | 'cancelled' = 'active';
    if (!event.isActive) {
      status = 'cancelled';
    } else if (event.participantCount >= event.maxParticipants) {
      status = 'full';
    }

    const matchPreview: MatchPreviewDto[] = matches.slice(0, 5).map((m) => ({
      matchId: m.matchId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      startTime: m.startTime,
    }));

    return {
      eventId: event.eventId,
      title: event.title,
      description: event.description,
      creator: event.creator,
      participantCount: event.participantCount,
      maxParticipants: event.maxParticipants,
      matchCount: matches.length,
      status,
      matchPreview,
      startTime: event.startTime,
      endTime: event.endTime,
      prizePool: event.prizePool,
      entryFee: event.entryFee,
      category: event.category,
      bannerUrl: event.bannerUrl,
      isFinalized: event.isFinalized,
      rewardDistribution: event.rewardDistribution,
    };
  }

  async getUserPredictionsForEvent(
    eventId: string,
    address: string,
  ): Promise<UserPredictionsResponseDto> {
    const event = await this.contractService.getEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const [matches, rawPredictions] = await Promise.all([
      this.contractService.getEventMatches(eventId),
      this.contractService.getUserPredictions(address, eventId),
    ]);

    const matchMap = new Map(matches.map((m) => [String(m.matchId), m]));
    const predictedMatchIds = new Set<string>();

    let correctPredictions = 0;
    let resolvedPredictions = 0;

    const predictions = rawPredictions
      .map((raw) => {
        const normalized = normalizeContractPrediction(raw);
        const match = matchMap.get(normalized.matchId);
        if (!match) {
          return null;
        }

        predictedMatchIds.add(normalized.matchId);
        const isCorrect = resolveCorrectness(
          normalized,
          match.resolved,
          match.outcome,
        );

        if (match.resolved) {
          resolvedPredictions++;
          if (isCorrect) {
            correctPredictions++;
          }
        }

        return {
          predictionId: normalized.predictionId,
          matchId: normalized.matchId,
          match: {
            matchId: match.matchId,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            matchTime: match.startTime,
          },
          predictedOutcome: normalized.predictedOutcome,
          actualResult: match.resolved ? match.outcome : null,
          isCorrect,
          predictedAt: normalized.predictedAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.match.matchTime - b.match.matchTime);

    const totalPredictions = predictions.length;
    const matchesRemaining = matches.filter(
      (m) => !predictedMatchIds.has(String(m.matchId)),
    ).length;
    const accuracyPercentage =
      resolvedPredictions > 0
        ? Math.round((correctPredictions / resolvedPredictions) * 100)
        : 0;

    return {
      address,
      eventId,
      score: {
        totalPredictions,
        correctPredictions,
        accuracyPercentage,
        matchesRemaining,
      },
      predictions,
    };
  }

  async getEventStats(eventId: string): Promise<EventStatsResponseDto> {
    const event = await this.contractService.getEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const [statistics, matches, participants, cachedEvent] = await Promise.all([
      this.contractService.getEventStatistics(eventId),
      this.contractService.getEventMatches(eventId),
      this.contractService.getEventParticipants(eventId),
      this.creatorEventRepository.findOne({
        where: { on_chain_event_id: Number(eventId) as unknown as number },
        select: ['prize_pool', 'total_entry_fees_collected'],
      }),
    ]);

    const matchesResolved = matches.filter((m) => m.resolved).length;
    const matchesPending = matches.length - matchesResolved;

    const distributionResults = await Promise.all(
      matches.map(async (match) => {
        const distribution =
          await this.contractService.getPredictionDistribution(
            String(match.matchId),
          );
        return {
          matchId: String(match.matchId),
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          teamA: distribution.teamA,
          teamB: distribution.teamB,
          draw: distribution.draw,
          total: distribution.teamA + distribution.teamB + distribution.draw,
        };
      }),
    );

    const totalParticipants =
      statistics?.participantCount ?? participants.length;
    const totalMatches = statistics?.matchCount ?? matches.length;
    const totalPredictions =
      statistics?.totalPredictions ??
      distributionResults.reduce((sum, item) => sum + item.total, 0);

    const matchCount = matches.length;
    const usersWithFullPredictions = participants.filter(
      (p) => p.predictionCount >= matchCount && matchCount > 0,
    ).length;
    const completionRate =
      totalParticipants > 0
        ? Math.round((usersWithFullPredictions / totalParticipants) * 100)
        : 0;

    const averagePredictionsPerUser =
      totalParticipants > 0
        ? Math.round((totalPredictions / totalParticipants) * 100) / 100
        : 0;

    return {
      eventId,
      totalParticipants,
      totalMatches,
      matchesResolved,
      matchesPending,
      totalPredictions,
      predictionDistribution: distributionResults,
      winnersVerified: statistics?.winnersVerified ?? false,
      winnerCount: statistics?.winnerCount ?? 0,
      averagePredictionsPerUser,
      completionRate,
      prizePool: cachedEvent?.prize_pool ?? '0',
      totalEntryFeesCollected: cachedEvent?.total_entry_fees_collected ?? '0',
    };
  }

  async getUserScore(
    eventId: string,
    address: string,
  ): Promise<UserScoreResponseDto> {
    const event = await this.contractService.getEvent(eventId);
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const [matches, userPredictions, participants] = await Promise.all([
      this.contractService.getEventMatches(eventId),
      this.contractService.getUserPredictions(address, eventId),
      this.contractService.getEventParticipants(eventId),
    ]);

    const userParticipant = participants.find((p) => p.address === address);
    const rank = userParticipant
      ? participants.findIndex((p) => p.address === address) + 1
      : participants.length + 1;

    let correctPredictions = 0;
    let incorrectPredictions = 0;
    let pendingPredictions = 0;

    for (const prediction of userPredictions) {
      const normalized = normalizeContractPrediction(prediction);
      const match = matches.find(
        (m) => String(m.matchId) === normalized.matchId,
      );
      if (!match) continue;

      if (!match.resolved) {
        pendingPredictions++;
      } else if (
        resolveCorrectness(normalized, match.resolved, match.outcome)
      ) {
        correctPredictions++;
      } else {
        incorrectPredictions++;
      }
    }

    const totalPredictions = userPredictions.length;
    const resolvedPredictions = correctPredictions + incorrectPredictions;
    const accuracyPercentage =
      resolvedPredictions > 0
        ? Math.round((correctPredictions / resolvedPredictions) * 100)
        : 0;

    const isWinner =
      totalPredictions > 0 &&
      incorrectPredictions === 0 &&
      pendingPredictions === 0;

    let totalPoints = 0;
    const userEntity = await this.userRepository.findOne({
      where: { stellar_address: address },
    });
    if (userEntity && matches.length > 0) {
      const dbMatches = await this.matchRepository.find({
        where: { event: { on_chain_event_id: Number(eventId) } },
      });
      if (dbMatches.length > 0) {
        const dbPredictions = await this.matchPredictionRepository.find({
          where: {
            user: { id: userEntity.id },
            match: { id: In(dbMatches.map((m) => m.id)) },
          },
        });
        totalPoints = dbPredictions.reduce(
          (sum, p) => sum + p.points_earned,
          0,
        );
      }
    }

    return {
      address,
      totalMatches: matches.length,
      totalPredictions,
      correctPredictions,
      incorrectPredictions,
      pendingPredictions,
      accuracyPercentage,
      rank,
      isWinner,
      totalPoints,
    };
  }

  private sortMatches(
    matches: ContractMatch[],
    sortBy: MatchSortBy,
    sortOrder: SortOrder,
  ): ContractMatch[] {
    const dir = sortOrder === SortOrder.Asc ? 1 : -1;

    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case MatchSortBy.MatchTime:
          return (a.startTime - b.startTime) * dir;
        case MatchSortBy.CreatedAt:
          return (a.startTime - b.startTime) * dir;
        default:
          return 0;
      }
    });
  }

  private sortParticipants(
    participants: ParticipantWithStats[],
    sortBy: ParticipantSortBy,
    sortOrder: ParticipantSortOrder,
  ): ParticipantWithStats[] {
    const dir = sortOrder === ParticipantSortOrder.Asc ? 1 : -1;

    return [...participants].sort((a, b) => {
      switch (sortBy) {
        case ParticipantSortBy.Score:
          return (a.accuracyPct - b.accuracyPct) * dir;
        case ParticipantSortBy.Address:
          return a.address.localeCompare(b.address) * dir;
        case ParticipantSortBy.JoinedAt:
          return (a.joinedAt - b.joinedAt) * dir;
        default:
          return 0;
      }
    });
  }

  private buildHighlights(
    event: CreatorEvent,
    searchTerm: string,
  ): SearchHighlightsDto {
    return {
      title: this.highlightMatches(event.title, searchTerm),
      description: this.highlightMatches(event.description, searchTerm),
      creator_address: this.highlightMatches(event.creator_address, searchTerm),
      category: this.highlightMatches(event.category, searchTerm),
    };
  }

  private toSearchResult(
    event: CreatorEvent,
    rank: string | number | undefined,
    searchTerm: string,
  ): SearchEventResultDto {
    return {
      id: event.id,
      on_chain_event_id: event.on_chain_event_id,
      title: event.title,
      description: event.description,
      creator_address: event.creator_address,
      is_active: event.is_active,
      is_cancelled: event.is_cancelled,
      participant_count: event.participant_count,
      match_count: event.match_count,
      rank: Number(rank ?? 0),
      prize_pool: event.prize_pool,
      entry_fee: event.entry_fee,
      category: event.category,
      banner_url: event.banner_url ?? null,
      is_finalized: event.is_finalized,
      highlights: this.buildHighlights(event, searchTerm),
    };
  }

  private highlightMatches(value: string, searchTerm: string): string {
    const escapedValue = this.escapeHtml(value);
    const terms = this.getHighlightTerms(searchTerm);

    if (terms.length === 0) {
      return escapedValue;
    }

    const pattern = terms.map((term) => this.escapeRegExp(term)).join('|');
    return escapedValue.replace(
      new RegExp(`(${pattern})`, 'gi'),
      '<mark>$1</mark>',
    );
  }

  private getHighlightTerms(searchTerm: string): string[] {
    return Array.from(
      new Set(
        searchTerm
          .toLowerCase()
          .split(/\s+/)
          .map((term) => term.replace(/["']/g, '').trim())
          .filter(Boolean),
      ),
    );
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      const replacements: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };

      return replacements[char];
    });
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * GET /creator-events/:id/payouts
   *
   * Returns all payout records for a finalized event, ordered by rank ASC.
   * Raises 404 when the event does not exist or is not yet finalized so the
   * frontend knows not to show the payouts UI prematurely.
   *
   * Time complexity: O(k log n) where k = limit, n = total payout rows.
   * The query uses the IDX_cep_event_id index + leaderboard entry JOIN.
   */
  async getPayouts(
    eventId: string,
    query: PayoutsQueryDto,
  ): Promise<PaginatedPayoutsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const cachedEvent = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: Number(eventId) as unknown as number },
      select: ['is_finalized'],
    });

    if (!cachedEvent?.is_finalized) {
      throw new NotFoundException(
        `Event ${eventId} is not finalized or does not exist`,
      );
    }

    const [payouts, total] = await this.creatorEventPayoutRepository
      .createQueryBuilder('payout')
      .leftJoinAndSelect('payout.leaderboard_entry', 'entry')
      .where('payout.event_id = :eventId', { eventId })
      .orderBy('entry.rank', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: payouts.map((p) => this.toPayoutDto(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * GET /creator-events/:id/payouts/:address
   *
   * Returns a single payout for the given address.
   * Returns 404 when the address has no payout row (i.e. the address did not
   * participate, or the event has not been finalized yet).
   *
   * Time complexity: O(log n) — uses the UQ_cep_event_address composite index.
   */
  async getPayoutByAddress(
    eventId: string,
    address: string,
  ): Promise<PayoutEntryDto> {
    const payout = await this.creatorEventPayoutRepository.findOne({
      where: { event_id: eventId, user_address: address },
      relations: ['leaderboard_entry'],
    });

    if (!payout) {
      throw new NotFoundException(
        `No payout found for address ${address} in event ${eventId}`,
      );
    }

    return this.toPayoutDto(payout);
  }

  private toPayoutDto(payout: CreatorEventPayout): PayoutEntryDto {
    return {
      id: payout.id,
      event_id: payout.event_id,
      user_address: payout.user_address,
      payout_amount_stroops: payout.payout_amount_stroops,
      is_claimed: payout.is_claimed,
      rank: payout.leaderboard_entry?.rank ?? 0,
      is_winner: payout.leaderboard_entry?.is_winner ?? false,
      created_at: payout.created_at,
    };
  }

  async getLeaderboard(
    eventId: string,
    query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Check if event is finalized via DB cache
    const cachedEvent = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: Number(eventId) as unknown as number },
      select: ['is_finalized'],
    });

    if (cachedEvent?.is_finalized) {
      const [entries, total] =
        await this.leaderboardEntryRepository.findAndCount({
          where: { event_id: eventId },
          order: { rank: 'ASC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      return {
        data: entries.map((e) => ({
          rank: e.rank,
          user_address: e.user_address,
          total_predictions: e.total_predictions,
          correct_predictions: e.correct_predictions,
          accuracy_percentage: Number(e.accuracy_percentage),
          is_winner: e.is_winner,
          completion_time: e.completion_time
            ? e.completion_time.toISOString()
            : null,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        source: 'cache',
      };
    }

    // Live read from contract
    const all = await this.contractService.getEventLeaderboard(eventId);
    const total = all.length;
    const slice = all.slice((page - 1) * limit, page * limit);

    const data: LeaderboardEntryResponse[] = slice.map((e) => ({
      rank: e.rank,
      user_address: e.address,
      total_predictions: e.total_predictions,
      correct_predictions: e.correct_predictions,
      accuracy_percentage: e.accuracy_percentage,
      is_winner: e.is_winner,
      completion_time: e.completion_time ?? null,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      source: 'contract',
    };
  }
}
