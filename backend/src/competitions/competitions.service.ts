import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CompetitionBracket } from './entities/competition-bracket.entity';
import { BracketRound } from './entities/bracket-round.entity';
import { BracketMatchup } from './entities/bracket-matchup.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { GenerateBracketDto, SeedingMetric } from './dto/generate-bracket.dto';
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
import {
  BracketResponseDto,
  BracketRoundResponseDto,
  BracketMatchupResponseDto,
} from './dto/bracket-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

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
    @InjectRepository(CompetitionBracket)
    private readonly bracketsRepository: Repository<CompetitionBracket>,
    @InjectRepository(BracketRound)
    private readonly roundsRepository: Repository<BracketRound>,
    @InjectRepository(BracketMatchup)
    private readonly matchupsRepository: Repository<BracketMatchup>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateCompetitionDto, user: User): Promise<Competition> {
    const inviteCode =
      dto.visibility === CompetitionVisibility.Private
        ? crypto.randomBytes(3).toString('hex').toUpperCase()
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
      where: {
        visibility: CompetitionVisibility.Public,
        is_cancelled: false,
      },
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
          'competition.start_time <= :now AND competition.end_time >= :now AND competition.is_cancelled = false',
          { now },
        );
      case CompetitionStatus.Upcoming:
        return query.andWhere(
          'competition.start_time > :now AND competition.is_cancelled = false',
          { now },
        );
      case CompetitionStatus.Ended:
        return query.andWhere(
          'competition.end_time < :now AND competition.is_cancelled = false',
          { now },
        );
      case CompetitionStatus.Cancelled:
        return query.andWhere('competition.is_cancelled = true');
      default:
        return query;
    }
  }

  private getCompetitionStatus(
    competition: Competition,
    now: Date,
  ): CompetitionStatus {
    if (competition.is_cancelled) {
      return CompetitionStatus.Cancelled;
    }

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

  async update(
    id: string,
    dto: UpdateCompetitionDto,
    userId: string,
  ): Promise<Competition> {
    const competition = await this.competitionsRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!competition) {
      throw new NotFoundException(`Competition with ID "${id}" not found`);
    }

    if (competition.creator.id !== userId) {
      throw new ForbiddenException(
        'Only the creator can update this competition',
      );
    }

    if (new Date() >= competition.start_time) {
      throw new BadRequestException(
        'Cannot update a competition that has already started',
      );
    }

    if (dto.title !== undefined) competition.title = dto.title;
    if (dto.description !== undefined)
      competition.description = dto.description;
    if (dto.prize_pool_stroops !== undefined)
      competition.prize_pool_stroops = dto.prize_pool_stroops;
    if (dto.max_participants !== undefined)
      competition.max_participants = dto.max_participants;

    return this.competitionsRepository.save(competition);
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

  async joinCompetition(
    competitionId: string,
    user: User,
  ): Promise<CompetitionParticipant> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    if (competition.is_cancelled) {
      throw new BadRequestException('Competition has been cancelled');
    }

    // Check if competition is active
    const now = new Date();
    if (now >= competition.end_time) {
      throw new BadRequestException('Competition has already ended');
    }

    // Check if user already joined
    const existing = await this.participantsRepository.findOne({
      where: {
        user_id: user.id,
        competition_id: competitionId,
      },
    });

    if (existing) {
      throw new ConflictException('You have already joined this competition');
    }

    // Check max participants
    if (competition.max_participants > 0) {
      const currentCount = await this.participantsRepository.count({
        where: { competition_id: competitionId },
      });

      if (currentCount >= competition.max_participants) {
        throw new BadRequestException('Competition is full');
      }
    }

    // Create participant
    const participant = this.participantsRepository.create({
      user_id: user.id,
      competition_id: competitionId,
      score: 0,
    });

    const saved = await this.participantsRepository.save(participant);

    // Update participant count
    await this.competitionsRepository.increment(
      { id: competitionId },
      'participant_count',
      1,
    );

    return saved;
  }

  async leave(competitionId: string, userId: string): Promise<void> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    // Check if competition has started
    const now = new Date();
    if (now >= competition.start_time) {
      throw new BadRequestException(
        'Cannot leave competition after it has started',
      );
    }

    // Use transaction for atomic removal and decrement
    await this.competitionsRepository.manager.transaction(async (manager) => {
      const participant = await manager.findOne(CompetitionParticipant, {
        where: {
          user_id: userId,
          competition_id: competitionId,
        },
      });

      if (!participant) {
        throw new NotFoundException(
          'You are not a participant in this competition',
        );
      }

      await manager.remove(participant);

      await manager.decrement(
        Competition,
        { id: competitionId },
        'participant_count',
        1,
      );
    });
  }

  async cancel(competitionId: string, userId: string): Promise<Competition> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
      relations: ['creator'],
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    if (competition.creator?.id !== userId) {
      throw new ForbiddenException(
        'Only the creator can cancel this competition',
      );
    }

    if (competition.is_cancelled) {
      throw new ConflictException('Competition is already cancelled');
    }

    competition.is_cancelled = true;
    const saved = await this.competitionsRepository.save(competition);

    await this.notifyParticipantsOfCancellation(competition);

    return saved;
  }

  private async notifyParticipantsOfCancellation(
    competition: Competition,
  ): Promise<void> {
    const participants = await this.participantsRepository.find({
      where: { competition_id: competition.id },
      relations: ['user'],
    });

    await Promise.all(
      participants
        .filter((p) => p.user?.stellar_address)
        .map((p) =>
          this.notificationsService.create(
            p.user.stellar_address,
            NotificationType.EventCancelled,
            'Competition cancelled',
            `"${competition.title}" has been cancelled by the organizer.`,
            { competition_id: competition.id },
            p.user_id,
          ),
        ),
    );
  }

  // -------------------------------------------------------------------------
  // Bracket generation
  // -------------------------------------------------------------------------

  async generateBracket(
    competitionId: string,
    dto: GenerateBracketDto,
    userId: string,
  ): Promise<CompetitionBracket> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId },
      relations: ['creator'],
    });

    if (!competition) {
      throw new NotFoundException(
        `Competition with ID "${competitionId}" not found`,
      );
    }

    if (competition.creator?.id !== userId) {
      throw new ForbiddenException('Only the creator can generate a bracket');
    }

    // Check for existing bracket
    const existing = await this.bracketsRepository.findOne({
      where: { competition_id: competitionId },
    });
    if (existing) {
      throw new ConflictException(
        'Bracket already exists for this competition',
      );
    }

    // Fetch all participants
    const participants = await this.participantsRepository.find({
      where: { competition_id: competitionId },
      order: this.getOrderClause(dto.metric),
    });

    if (participants.length < 2) {
      throw new BadRequestException(
        'At least 2 participants are required to generate a bracket',
      );
    }

    const totalParticipants = participants.length;
    const totalRounds = Math.ceil(Math.log2(totalParticipants));
    const bracketSize = Math.pow(2, totalRounds);
    const byeCount = bracketSize - totalParticipants;

    // Create bracket
    const bracket = this.bracketsRepository.create({
      competition_id: competitionId,
      total_rounds: totalRounds,
    });
    const savedBracket = await this.bracketsRepository.save(bracket);

    // Create rounds
    const rounds: BracketRound[] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const name = this.getRoundName(r, totalRounds);
      const round = this.roundsRepository.create({
        bracket_id: savedBracket.id,
        round_number: r,
        name,
      });
      rounds.push(await this.roundsRepository.save(round));
    }

    // Seed first round matchups
    // Top seeds get byes
    let participantIndex = 0;
    const firstRoundMatchups: CompetitionParticipant[][] = [];

    for (let m = 0; m < bracketSize / 2; m++) {
      const matchup: CompetitionParticipant[] = [];
      const isByeSlot = m < byeCount;

      if (isByeSlot) {
        // Top seed gets a bye
        matchup.push(participants[participantIndex++]);
        matchup.push(null as unknown as CompetitionParticipant);
      } else {
        matchup.push(participants[participantIndex++]);
        matchup.push(participants[participantIndex++]);
      }
      firstRoundMatchups.push(matchup);
    }

    // Create first round matchups
    const savedMatchups: BracketMatchup[][] = [];
    for (let m = 0; m < firstRoundMatchups.length; m++) {
      const [p1, p2] = firstRoundMatchups[m];
      const isBye = !p2;
      const matchup = this.matchupsRepository.create({
        round_id: rounds[0].id,
        match_number: m + 1,
        participant_1_id: p1?.id ?? null,
        participant_2_id: p2?.id ?? null,
        winner_id: isBye ? (p1?.id ?? null) : null,
        is_bye: isBye,
      });
      const saved = await this.matchupsRepository.save(matchup);
      savedMatchups.push([saved]);
    }

    // Create empty matchups for subsequent rounds
    for (let r = 1; r < totalRounds; r++) {
      const matchesInRound = bracketSize / Math.pow(2, r + 1);
      for (let m = 0; m < matchesInRound; m++) {
        const matchup = this.matchupsRepository.create({
          round_id: rounds[r].id,
          match_number: m + 1,
          participant_1_id: null,
          participant_2_id: null,
          winner_id: null,
          is_bye: false,
        });
        await this.matchupsRepository.save(matchup);
      }
    }

    return savedBracket;
  }

  async getBracket(competitionId: string): Promise<BracketResponseDto> {
    const bracket = await this.bracketsRepository.findOne({
      where: { competition_id: competitionId },
    });

    if (!bracket) {
      throw new NotFoundException(
        `No bracket found for competition "${competitionId}"`,
      );
    }

    const rounds = await this.roundsRepository.find({
      where: { bracket_id: bracket.id },
      order: { round_number: 'ASC' },
    });

    const roundDtos: BracketRoundResponseDto[] = [];
    for (const round of rounds) {
      const matchups = await this.matchupsRepository.find({
        where: { round_id: round.id },
        order: { match_number: 'ASC' },
      });

      const matchupDtos: BracketMatchupResponseDto[] = matchups.map((m) => ({
        id: m.id,
        match_number: m.match_number,
        participant_1_id: m.participant_1_id,
        participant_2_id: m.participant_2_id,
        winner_id: m.winner_id,
        is_bye: m.is_bye,
      }));

      roundDtos.push({
        id: round.id,
        round_number: round.round_number,
        name: round.name,
        matchups: matchupDtos,
      });
    }

    return {
      id: bracket.id,
      competition_id: bracket.competition_id,
      total_rounds: bracket.total_rounds,
      status: bracket.status,
      generated_at: bracket.generated_at,
      rounds: roundDtos,
    };
  }

  private getOrderClause(metric: SeedingMetric): Record<string, string> {
    switch (metric) {
      case SeedingMetric.Score:
        return { score: 'DESC', joined_at: 'ASC' };
      case SeedingMetric.Rank:
        return { rank: 'ASC', joined_at: 'ASC' };
      case SeedingMetric.JoinedAt:
        return { joined_at: 'ASC' };
      default:
        return { score: 'DESC', joined_at: 'ASC' };
    }
  }

  private getRoundName(roundNumber: number, totalRounds: number): string {
    const diff = totalRounds - roundNumber;
    if (diff === 0) return 'Finals';
    if (diff === 1) return 'Semifinals';
    if (diff === 2) return 'Quarterfinals';
    return `Round ${roundNumber}`;
  }
}
