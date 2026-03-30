import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import {
  ListCompetitionsDto,
  CompetitionStatus,
  PaginatedCompetitionsResponse,
} from './dto/list-competitions.dto';
import {
  ListParticipantsQueryDto,
  ParticipantItem,
  PaginatedParticipantsResponse,
} from './dto/list-participants.dto';
import { User } from '../users/entities/user.entity';
import { UserRankResponseDto } from './dto/user-rank-response.dto';

@Injectable()
export class CompetitionsService {
  private rankCache = new Map<
    string,
    { data: UserRankResponseDto; timestamp: number }
  >();
  private readonly RANK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(Competition)
    private readonly competitionsRepository: Repository<Competition>,
    @InjectRepository(CompetitionParticipant)
    private readonly participantsRepository: Repository<CompetitionParticipant>,
  ) {}

  async create(dto: CreateCompetitionDto, user: User): Promise<Competition> {
    const inviteCode =
      dto.visibility === CompetitionVisibility.Private
        ? Math.random().toString(36).slice(2, 8).toUpperCase()
        : null;

    const competition = this.competitionsRepository.create({
      title: dto.title,
      description: dto.description,
      start_time: new Date(dto.start_time),
      end_time: new Date(dto.end_time),
      prize_pool_stroops: dto.prize_pool_stroops,
      max_participants: dto.max_participants ?? undefined,
      visibility: dto.visibility,
      invite_code: inviteCode ?? undefined,
      creator: user,
    });

    return this.competitionsRepository.save(competition);
  }

  async findAll(): Promise<Competition[]> {
    return this.competitionsRepository.find({
      where: { visibility: CompetitionVisibility.Public },
      order: { created_at: 'DESC' },
      relations: ['creator'],
    });
  }

  async list(dto: ListCompetitionsDto): Promise<PaginatedCompetitionsResponse> {
    const { page = 1, limit = 20, status, visibility } = dto;
    const skip = (page - 1) * limit;
    const now = new Date();

    let query = this.competitionsRepository
      .createQueryBuilder('competition')
      .leftJoinAndSelect('competition.creator', 'creator');

    // Apply status filter
    if (status) {
      query = this.applyStatusFilter(query, status, now);
    }

    // Apply visibility filter
    if (visibility) {
      query = query.andWhere('competition.visibility = :visibility', {
        visibility,
      });
    }

    query = query
      .orderBy('competition.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [competitions, total] = await query.getManyAndCount();

    const data = competitions.map((competition) => ({
      id: competition.id,
      title: competition.title,
      description: competition.description,
      start_time: competition.start_time,
      end_time: competition.end_time,
      prize_pool_stroops: competition.prize_pool_stroops,
      max_participants: competition.max_participants,
      visibility: competition.visibility,
      creator_id: competition.creator_id,
      participant_count: 0, // TODO: Implement actual participant counting
      status: this.getCompetitionStatus(competition, now),
      time_remaining_ms: this.getTimeRemaining(competition, now),
      created_at: competition.created_at,
    }));

    return { data, total, page, limit };
  }

  private applyStatusFilter(
    query: SelectQueryBuilder<Competition>,
    status: CompetitionStatus,
    now: Date,
  ): SelectQueryBuilder<Competition> {
    switch (status) {
      case CompetitionStatus.Active:
        return query.andWhere(
          'competition.start_time <= :now AND competition.end_time >= :now',
          { now },
        );
      case CompetitionStatus.Upcoming:
        return query.andWhere('competition.start_time > :now', { now });
      case CompetitionStatus.Ended:
        return query.andWhere('competition.end_time < :now', { now });
      default:
        return query;
    }
  }

  private getCompetitionStatus(
    competition: Competition,
    now: Date,
  ): CompetitionStatus {
    if (now < competition.start_time) {
      return CompetitionStatus.Upcoming;
    } else if (now >= competition.start_time && now <= competition.end_time) {
      return CompetitionStatus.Active;
    } else {
      return CompetitionStatus.Ended;
    }
  }

  private getTimeRemaining(competition: Competition, now: Date): number | null {
    if (now >= competition.end_time) {
      return null; // Competition has ended
    }
    if (now < competition.start_time) {
      return competition.start_time.getTime() - now.getTime(); // Time until start
    }
    return competition.end_time.getTime() - now.getTime(); // Time until end
  }

  async getParticipants(
    competitionId: string,
    dto: ListParticipantsQueryDto,
  ): Promise<PaginatedParticipantsResponse> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [participants, total] = await this.participantsRepository
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.user', 'user')
      .where('participant.competition_id = :competitionId', { competitionId })
      .orderBy('participant.score', 'DESC')
      .addOrderBy('participant.joined_at', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data: ParticipantItem[] = participants.map((p, index) => ({
      id: p.id,
      user_id: p.user_id,
      username: p.user?.username ?? null,
      stellar_address: p.user?.stellar_address ?? '',
      score: p.score,
      rank: p.rank ?? skip + index + 1,
      joined_at: p.joined_at,
    }));

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<Competition | null> {
    return this.competitionsRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
  }

  async getMyRank(
    competitionId: string,
    userId: string,
  ): Promise<UserRankResponseDto> {
    const cacheKey = `${competitionId}:${userId}`;
    const cached = this.rankCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.RANK_CACHE_TTL_MS) {
      return cached.data;
    }

    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    const participant = await this.participantsRepository.findOne({
      where: { competition_id: competitionId, user_id: userId },
    });

    if (!participant) {
      throw new NotFoundException(
        `User is not a participant in competition "${competitionId}"`,
      );
    }

    // Calculate rank: count participants with higher score,
    // or same score but joined earlier.
    const rank =
      (await this.participantsRepository
        .createQueryBuilder('p')
        .where('p.competition_id = :competitionId', { competitionId })
        .andWhere(
          '(p.score > :score OR (p.score = :score AND p.joined_at < :joinedAt))',
          {
            score: participant.score,
            joinedAt: participant.joined_at,
          },
        )
        .getCount()) + 1;

    const total_participants = await this.participantsRepository.count({
      where: { competition_id: competitionId },
    });

    const percentile =
      total_participants > 0
        ? Math.round((1 - (rank - 1) / total_participants) * 10000) / 100
        : 100;

    const result: UserRankResponseDto = {
      rank,
      score: participant.score,
      total_participants,
      percentile,
    };

    this.rankCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }
}
