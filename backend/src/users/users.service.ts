import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prediction } from '../predictions/entities/prediction.entity';
import {
  ListUserPredictionsDto,
  PaginatedPublicUserPredictionsResponse,
  PublicPredictionOutcomeFilter,
  PublicUserPredictionItem,
} from './dto/list-user-predictions.dto';
import { User } from './entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { UpdateUserDto } from './dto/update-user.dto';

import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import {
  ListUserCompetitionsDto,
  UserCompetitionFilterStatus,
} from './dto/list-user-competitions.dto';
import {
  ListUserMarketsDto,
  PaginatedUserMarketsResponse,
  UserMarketFilterStatus,
  UserMarketsSortBy,
  UserMarketsSortOrder,
} from './dto/list-user-markets.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(CompetitionParticipant)
    private readonly participantsRepository: Repository<CompetitionParticipant>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async findByAddress(stellar_address: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ stellar_address });
    if (!user) {
      throw new NotFoundException(
        `User with address ${stellar_address} not found`,
      );
    }
    return user;
  }

  async findPublicPredictionsByAddress(
    stellar_address: string,
    dto: ListUserPredictionsDto,
  ): Promise<PaginatedPublicUserPredictionsResponse> {
    const user = await this.findByAddress(stellar_address);

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.predictionsRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .andWhere('market.is_resolved = true')
      .orderBy('prediction.submitted_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [predictions, total] = await qb.getManyAndCount();

    const data = predictions
      .map((prediction) => this.mapPublicPrediction(prediction))
      .filter((prediction) => {
        if (!dto.outcome) return true;
        return prediction.outcome === dto.outcome;
      });

    return { data, total, page, limit };
  }

  private mapPublicPrediction(
    prediction: Prediction,
  ): PublicUserPredictionItem {
    const outcome = this.computePublicOutcome(prediction);

    return {
      id: prediction.id,
      chosen_outcome: prediction.chosen_outcome,
      stake_amount_stroops: prediction.stake_amount_stroops,
      payout_claimed: prediction.payout_claimed,
      payout_amount_stroops: prediction.payout_amount_stroops,
      tx_hash: prediction.tx_hash ?? null,
      submitted_at: prediction.submitted_at,
      outcome,
      market: {
        id: prediction.market.id,
        title: prediction.market.title,
        end_time: prediction.market.end_time,
        resolved_outcome: prediction.market.resolved_outcome ?? null,
        is_resolved: prediction.market.is_resolved,
        is_cancelled: prediction.market.is_cancelled,
      },
    };
  }

  private computePublicOutcome(
    prediction: Prediction,
  ): PublicPredictionOutcomeFilter {
    if (prediction.market.resolved_outcome == null) {
      return PublicPredictionOutcomeFilter.Pending;
    }

    if (prediction.market.resolved_outcome === prediction.chosen_outcome) {
      return PublicPredictionOutcomeFilter.Correct;
    }

    return PublicPredictionOutcomeFilter.Incorrect;
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(userId);

    if (dto.username !== undefined) {
      user.username = dto.username;
    }
    if (dto.avatar_url !== undefined) {
      user.avatar_url = dto.avatar_url;
    }

    return this.usersRepository.save(user);
  }

  async findUserCompetitions(address: string, dto: ListUserCompetitionsDto) {
    const user = await this.findByAddress(address);
    const { page = 1, limit = 20, status } = dto;
    const skip = (page - 1) * limit;
    const now = new Date();

    const qb = this.participantsRepository
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.competition', 'competition')
      .where('participant.user_id = :userId', { userId: user.id });

    if (status === UserCompetitionFilterStatus.Active) {
      qb.andWhere('competition.end_time >= :now', { now });
    } else if (status === UserCompetitionFilterStatus.Completed) {
      qb.andWhere('competition.end_time < :now', { now });
    }

    const [items, total] = await qb
      .orderBy('competition.end_time', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = items.map((p) => ({
      id: p.competition.id,
      title: p.competition.title,
      rank: p.rank,
      score: p.score,
      end_time: p.competition.end_time,
      status: p.competition.end_time < now ? 'completed' : 'active',
    }));

    return { data, total, page, limit };
  }

  async findMarketsByAddress(
    stellar_address: string,
    dto: ListUserMarketsDto,
  ): Promise<PaginatedUserMarketsResponse> {
    const user = await this.findByAddress(stellar_address);
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.marketsRepository
      .createQueryBuilder('market')
      .leftJoinAndSelect('market.creator', 'creator')
      .where('market.creatorId = :userId', { userId: user.id });

    if (dto.status) {
      switch (dto.status) {
        case UserMarketFilterStatus.Active:
          qb.andWhere(
            'market.is_resolved = false AND market.is_cancelled = false',
          );
          break;
        case UserMarketFilterStatus.Resolved:
          qb.andWhere('market.is_resolved = true');
          break;
        case UserMarketFilterStatus.Cancelled:
          qb.andWhere('market.is_cancelled = true');
          break;
      }
    }

    const sortColumn =
      dto.sort_by === UserMarketsSortBy.ParticipantCount
        ? 'market.participant_count'
        : 'market.created_at';
    const sortDir =
      (dto.order ?? UserMarketsSortOrder.Desc) === UserMarketsSortOrder.Asc
        ? 'ASC'
        : 'DESC';

    qb.orderBy(sortColumn, sortDir).skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async exportUserData(userId: string) {
    const user = await this.findById(userId);

    const [predictions, markets, notifications, competitions] =
      await Promise.all([
        this.predictionsRepository.find({
          where: { user: { id: user.id } },
          relations: ['market'],
        }),
        this.marketsRepository.find({
          where: { creator: { id: user.id } },
        }),
        this.notificationsRepository.find({
          where: { user: { id: user.id } },
          order: { created_at: 'DESC' },
        }),
        this.participantsRepository.find({
          where: { user_id: user.id },
          relations: ['competition'],
        }),
      ]);

    return {
      profile: {
        id: user.id,
        stellar_address: user.stellar_address,
        username: user.username,
        avatar_url: user.avatar_url,
        reputation_score: user.reputation_score,
        season_points: user.season_points,
        created_at: user.created_at,
      },
      stats: {
        total_predictions: user.total_predictions,
        correct_predictions: user.correct_predictions,
        total_staked_stroops: user.total_staked_stroops,
        total_winnings_stroops: user.total_winnings_stroops,
      },
      predictions: predictions.map((p) => ({
        id: p.id,
        market_id: p.market.id,
        market_title: p.market.title,
        chosen_outcome: p.chosen_outcome,
        stake_amount_stroops: p.stake_amount_stroops,
        submitted_at: p.submitted_at,
      })),
      markets_created: markets.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        is_resolved: m.is_resolved,
        created_at: m.created_at,
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        is_read: n.is_read,
        created_at: n.created_at,
      })),
      competitions_joined: competitions.map((c) => ({
        id: c.competition.id,
        title: c.competition.title,
        rank: c.rank,
        score: c.score,
      })),
      exported_at: new Date().toISOString(),
    };
  }
}
