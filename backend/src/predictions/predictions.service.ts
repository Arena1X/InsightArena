import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
import {
  ListMyPredictionsDto,
  PredictionStatus,
  PredictionWithStatus,
  PaginatedMyPredictionsResponse,
} from './dto/list-my-predictions.dto';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly sorobanService: SorobanService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Submit a prediction for a market.
   * Validates market state and outcome, prevents duplicates,
   * calls Soroban to lock stake on-chain, then persists and updates counters.
   */
  async submit(dto: SubmitPredictionDto, user: User): Promise<Prediction> {
    const market = await this.marketsRepository.findOne({
      where: { id: dto.market_id },
    });

    if (!market) {
      throw new NotFoundException(`Market "${dto.market_id}" not found`);
    }

    if (
      market.is_resolved ||
      market.is_cancelled ||
      new Date() > market.end_time
    ) {
      throw new BadRequestException(
        'Market is closed - predictions are no longer accepted',
      );
    }

    if (!market.outcome_options.includes(dto.chosen_outcome)) {
      throw new BadRequestException(
        `Invalid outcome "${dto.chosen_outcome}". Valid options: ${market.outcome_options.join(', ')}`,
      );
    }

    const existing = await this.predictionsRepository.findOne({
      where: { user: { id: user.id }, market: { id: market.id } },
    });
    if (existing) {
      throw new ConflictException(
        'You have already submitted a prediction for this market',
      );
    }

    const { tx_hash } = await this.sorobanService.submitPrediction(
      user.stellar_address,
      market.on_chain_market_id,
      dto.chosen_outcome,
      dto.stake_amount_stroops,
    );

    return this.dataSource.transaction(async (manager) => {
      const prediction = manager.create(Prediction, {
        user,
        market,
        chosen_outcome: dto.chosen_outcome,
        stake_amount_stroops: dto.stake_amount_stroops,
        tx_hash,
        payout_claimed: false,
        payout_amount_stroops: '0',
      });

      const saved = await manager.save(prediction);

      await manager
        .createQueryBuilder()
        .update(Market)
        .set({
          participant_count: () => 'participant_count + 1',
          total_pool_stroops: () =>
            `total_pool_stroops + ${BigInt(dto.stake_amount_stroops)}`,
        })
        .where('id = :id', { id: market.id })
        .execute();

      await manager
        .createQueryBuilder()
        .update(User)
        .set({
          total_predictions: () => 'total_predictions + 1',
          total_staked_stroops: () =>
            `total_staked_stroops + ${BigInt(dto.stake_amount_stroops)}`,
        })
        .where('id = :id', { id: user.id })
        .execute();

      this.logger.log(
        `Prediction ${saved.id} saved for user ${user.id} on market ${market.id}`,
      );
      return saved;
    });
  }

  /**
   * Retrieve the calling user's predictions with pagination, status filter,
   * and nested market data.
   */
  async findMine(
    user: User,
    dto: ListMyPredictionsDto,
  ): Promise<PaginatedMyPredictionsResponse> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.predictionsRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .orderBy('prediction.submitted_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [predictions, total] = await qb.getManyAndCount();

    const enriched: PredictionWithStatus[] = predictions
      .map((p) => this.enrichWithStatus(p))
      .filter((p): p is PredictionWithStatus => {
        if (!dto.status) return true;
        return p.status === dto.status;
      });

    return { data: enriched, total, page, limit };
  }

  private enrichWithStatus(prediction: Prediction): PredictionWithStatus {
    const market = prediction.market;
    const status = this.computeStatus(prediction, market);

    return {
      id: prediction.id,
      chosen_outcome: prediction.chosen_outcome,
      stake_amount_stroops: prediction.stake_amount_stroops,
      payout_claimed: prediction.payout_claimed,
      payout_amount_stroops: prediction.payout_amount_stroops,
      tx_hash: prediction.tx_hash ?? null,
      submitted_at: prediction.submitted_at,
      status,
      market: {
        id: market.id,
        title: market.title,
        end_time: market.end_time,
        resolved_outcome: market.resolved_outcome ?? null,
        is_resolved: market.is_resolved,
        is_cancelled: market.is_cancelled,
      },
    };
  }

  private computeStatus(
    prediction: Prediction,
    market: Market,
  ): PredictionStatus {
    if (market.is_cancelled) return PredictionStatus.Pending;
    if (!market.is_resolved) return PredictionStatus.Active;
    if (market.resolved_outcome === prediction.chosen_outcome) {
      return PredictionStatus.Won;
    }
    return PredictionStatus.Lost;
  }
}
