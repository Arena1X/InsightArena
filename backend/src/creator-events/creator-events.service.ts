import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  ContractService,
  ContractEvent,
  ContractConfig,
  ContractParticipant,
  ContractMatch,
} from '../contract/contract.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
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
import {
  CreatorEventSearchStatus,
  SearchEventsQueryDto,
} from './dto/search-events-query.dto';
import {
  SearchEventResultDto,
  SearchEventsResponseDto,
  SearchHighlightsDto,
} from './dto/search-events-response.dto';
import { UserScoreResponseDto } from './dto/user-score-response.dto';

export interface EnrichedEvent extends ContractEvent {
  matchCount: number;
  matchPreview: Array<{ matchId: string; homeTeam: string; awayTeam: string }>;
  winnerCount: number;
  creatorVerified: boolean;
}

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

@Injectable()
export class CreatorEventsService {
  private readonly logger = new Logger(CreatorEventsService.name);

  constructor(
    private readonly contractService: ContractService,
    @InjectRepository(CreatorEvent)
    private readonly creatorEventRepository: Repository<CreatorEvent>,
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

    const searchVector = this.getSearchVectorSql('creatorEvent');
    const searchQuery = `websearch_to_tsquery('english', :searchTerm)`;

    const searchQueryBuilder = this.creatorEventRepository
      .createQueryBuilder('creatorEvent')
      .addSelect(`ts_rank_cd((${searchVector}), ${searchQuery})`, 'search_rank')
      .where(
        new Brackets((qb) => {
          qb.where(`(${searchVector}) @@ ${searchQuery}`).orWhere(
            "creatorEvent.creator_address ILIKE :creatorAddressSearch ESCAPE '\\'",
          );
        }),
      )
      .setParameter('searchTerm', searchTerm)
      .setParameter(
        'creatorAddressSearch',
        `%${this.escapeLikePattern(searchTerm)}%`,
      );

    this.applyStatusFilter(searchQueryBuilder, query.status);

    if (query.creator?.trim()) {
      searchQueryBuilder.andWhere(
        'LOWER(creatorEvent.creator_address) = LOWER(:creator)',
        { creator: query.creator.trim() },
      );
    }

    const total = await searchQueryBuilder.clone().getCount();
    const { entities, raw } = await searchQueryBuilder
      .orderBy('search_rank', 'DESC')
      .addOrderBy('creatorEvent.participant_count', 'DESC')
      .addOrderBy('creatorEvent.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities<{ search_rank?: string | number }>();

    return {
      data: entities.map((event, index) =>
        this.toSearchResult(event, raw[index]?.search_rank, searchTerm),
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
      const match = matches.find((m) => m.matchId === prediction.matchId);
      if (!match) continue;

      if (!match.resolved) {
        pendingPredictions++;
      } else if (match.outcome === prediction.chosenOutcome) {
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
        case ParticipantSortBy.JoinedAt:
          return (a.joinedAt - b.joinedAt) * dir;
        case ParticipantSortBy.Score:
          return (a.accuracyPct - b.accuracyPct) * dir;
        case ParticipantSortBy.Address:
          return a.address.localeCompare(b.address) * dir;
        default:
          return 0;
      }
    });
  }

  private getSearchVectorSql(alias: string): string {
    return `
      setweight(to_tsvector('english', coalesce(${alias}.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(${alias}.description, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(${alias}.creator_address, '')), 'C')
    `;
  }

  private applyStatusFilter(
    queryBuilder: ReturnType<Repository<CreatorEvent>['createQueryBuilder']>,
    status: CreatorEventSearchStatus = CreatorEventSearchStatus.All,
  ): void {
    switch (status) {
      case CreatorEventSearchStatus.Active:
        queryBuilder.andWhere('creatorEvent.is_active = :isActive', {
          isActive: true,
        });
        queryBuilder.andWhere('creatorEvent.is_cancelled = :isCancelled', {
          isCancelled: false,
        });
        break;
      case CreatorEventSearchStatus.Cancelled:
        queryBuilder.andWhere('creatorEvent.is_cancelled = :isCancelled', {
          isCancelled: true,
        });
        break;
      case CreatorEventSearchStatus.Inactive:
        queryBuilder.andWhere('creatorEvent.is_active = :isActive', {
          isActive: false,
        });
        break;
      case CreatorEventSearchStatus.All:
      default:
        break;
    }
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
      highlights: this.buildHighlights(event, searchTerm),
    };
  }

  private buildHighlights(
    event: CreatorEvent,
    searchTerm: string,
  ): SearchHighlightsDto {
    return {
      title: this.highlightMatches(event.title, searchTerm),
      description: this.highlightMatches(event.description, searchTerm),
      creator_address: this.highlightMatches(event.creator_address, searchTerm),
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

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async discoverEvents(
    userAddress?: string,
    limit: number = 20,
    excludeJoined: boolean = false,
  ): Promise<any> {
    const events = await this.creatorEventRepository
      .createQueryBuilder('event')
      .where('event.is_active = true')
      .andWhere('event.is_cancelled = false')
      .orderBy('event.participant_count', 'DESC')
      .addOrderBy('event.match_count', 'DESC')
      .addOrderBy('event.created_at', 'DESC')
      .take(limit)
      .getMany();

    const result = events.map((event) => ({
      id: event.id,
      on_chain_event_id: event.on_chain_event_id,
      title: event.title,
      description: event.description,
      creator_address: event.creator_address,
      participant_count: event.participant_count,
      match_count: event.match_count,
      is_active: event.is_active,
      discovery_reason: this.getDiscoveryReason(event),
      created_at: event.on_chain_created_at,
    }));

    return {
      data: result,
      total: result.length,
      limit,
    };
  }

  private getDiscoveryReason(event: CreatorEvent): string {
    if (event.participant_count === 0) return 'new';
    if (event.participant_count > 50) return 'popular';
    if (event.match_count > 10) return 'trending';
    return 'similar';
  }
}
