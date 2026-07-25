import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
import { UpdatePredictionNoteDto } from './dto/update-prediction-note.dto';
import {
  ListMarketPredictionsDto,
  MarketPredictionResponseDto,
  PaginatedMarketPredictionsResponse,
} from './dto/list-market-predictions.dto';
import {
  ListMyPredictionsDto,
  PredictionStatus,
  PredictionWithStatus,
  PaginatedMyPredictionsResponse,
} from './dto/list-my-predictions.dto';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';
import {
  ClaimAllRewardsResponseDto,
  RewardsSummaryDto,
} from './dto/rewards-summary.dto';

const STROOPS_PER_XLM = 10_000_000n;

function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_XLM);
}

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
      market.is_paused ||
      new Date() > market.end_time
    ) {
      throw new BadRequestException(
        market.is_paused
          ? 'Market is paused - predictions are no longer accepted'
          : 'Market is closed - predictions are no longer accepted',
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
          ...(BigInt(dto.stake_amount_stroops) !== 0n
            ? {
                total_pool_stroops: () =>
                  'CAST(total_pool_stroops AS BIGINT) + :stakeAmount',
              }
            : {}),
        })
        .where('id = :id', { id: market.id })
        .setParameter(
          'stakeAmount',
          BigInt(dto.stake_amount_stroops).toString(),
        )
        .execute();

      await manager
        .createQueryBuilder()
        .update(User)
        .set({
          total_predictions: () => 'total_predictions + 1',
          ...(BigInt(dto.stake_amount_stroops) !== 0n
            ? {
                total_staked_stroops: () =>
                  'CAST(total_staked_stroops AS BIGINT) + :stakeAmount',
              }
            : {}),
        })
        .where('id = :id', { id: user.id })
        .setParameter(
          'stakeAmount',
          BigInt(dto.stake_amount_stroops).toString(),
        )
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
      .orderBy('prediction.submitted_at', 'DESC');

    // Apply status filter at the database level
    if (dto.status) {
      switch (dto.status) {
        case PredictionStatus.Active:
          qb.andWhere('market.is_resolved = :isResolved', {
            isResolved: false,
          }).andWhere('market.is_cancelled = :isCancelled', {
            isCancelled: false,
          });
          break;
        case PredictionStatus.Won:
          qb.andWhere('market.is_resolved = :isResolved', { isResolved: true })
            .andWhere('market.is_cancelled = :isCancelled', {
              isCancelled: false,
            })
            .andWhere('market.resolved_outcome = prediction.chosen_outcome');
          break;
        case PredictionStatus.Lost:
          qb.andWhere('market.is_resolved = :isResolved', { isResolved: true })
            .andWhere('market.is_cancelled = :isCancelled', {
              isCancelled: false,
            })
            .andWhere('market.resolved_outcome != prediction.chosen_outcome');
          break;
        case PredictionStatus.Pending:
          qb.andWhere('market.is_cancelled = :isCancelled', {
            isCancelled: true,
          });
          break;
      }
    }

    qb.skip(skip).take(limit);

    const [predictions, total] = await qb.getManyAndCount();

    const enriched: PredictionWithStatus[] = predictions.map((p) =>
      this.enrichWithStatus(p),
    );

    return { data: enriched, total, page, limit };
  }

  /**
   * Retrieve a single prediction by ID with authorization check.
   * Only the prediction owner or admin can view.
   * Returns prediction with enriched status.
   */
  async findById(id: string, userId: string): Promise<PredictionWithStatus> {
    const prediction = await this.predictionsRepository.findOne({
      where: { id },
      relations: ['market', 'user'],
    });

    if (!prediction) {
      throw new NotFoundException(`Prediction "${id}" not found`);
    }

    // Check authorization: only owner can view
    if (prediction.user.id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this prediction',
      );
    }

    return this.enrichWithStatus(prediction);
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
      note: prediction.note ?? null,
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

  /**
   * Update the personal note on a prediction.
   * Only the prediction owner can update their note.
   */
  async updateNote(
    predictionId: string,
    dto: UpdatePredictionNoteDto,
    user: User,
  ): Promise<Prediction> {
    const prediction = await this.predictionsRepository.findOne({
      where: { id: predictionId, user: { id: user.id } },
      relations: ['market'],
    });

    if (!prediction) {
      throw new NotFoundException(`Prediction "${predictionId}" not found`);
    }

    prediction.note = dto.note;
    return this.predictionsRepository.save(prediction);
  }

  /**
   * Claim the payout for a winning prediction.
   * Validates that the market is resolved, the user won, and hasn't already claimed.
   */
  async claim(predictionId: string, user: User): Promise<Prediction> {
    const prediction = await this.predictionsRepository.findOne({
      where: { id: predictionId, user: { id: user.id } },
      relations: ['market'],
    });

    if (!prediction) {
      throw new NotFoundException(`Prediction "${predictionId}" not found`);
    }

    if (prediction.payout_claimed) {
      throw new ConflictException('Payout has already been claimed');
    }

    const market = prediction.market;
    if (!market.is_resolved) {
      throw new BadRequestException('Market is not yet resolved');
    }

    if (market.resolved_outcome !== prediction.chosen_outcome) {
      throw new BadRequestException('You did not win this prediction');
    }

    const { tx_hash, payout_amount_stroops } =
      await this.sorobanService.claimPayout(
        user.stellar_address,
        market.on_chain_market_id,
      );

    prediction.payout_claimed = true;
    prediction.tx_hash = tx_hash;
    if (payout_amount_stroops) {
      prediction.payout_amount_stroops = payout_amount_stroops;
    }

    return this.predictionsRepository.save(prediction);
  }

  /**
   * Aggregate a user's rewards across all their predictions:
   * - claimable: won, resolved, not-yet-claimed predictions (stake as a lower-bound
   *   estimate of payout — the exact amount is only known on-chain at claim time)
   * - vesting: predictions on markets that have not resolved yet
   * - total_earned: sum of actual payouts already claimed
   */
  async getRewardsSummary(user: User): Promise<RewardsSummaryDto> {
    const predictions = await this.predictionsRepository.find({
      where: { user: { id: user.id } },
      relations: ['market'],
    });

    let claimableStroops = 0n;
    let vestingStroops = 0n;
    let totalEarnedStroops = 0n;

    for (const prediction of predictions) {
      if (prediction.payout_claimed) {
        totalEarnedStroops += BigInt(prediction.payout_amount_stroops ?? '0');
        continue;
      }

      const market = prediction.market;
      if (!market.is_resolved) {
        vestingStroops += BigInt(prediction.stake_amount_stroops);
      } else if (market.resolved_outcome === prediction.chosen_outcome) {
        claimableStroops += BigInt(prediction.stake_amount_stroops);
      }
    }

    return {
      total_earned_xlm: stroopsToXlm(totalEarnedStroops),
      claimable_xlm: stroopsToXlm(claimableStroops),
      vesting_xlm: stroopsToXlm(vestingStroops),
    };
  }

  /**
   * Claim every currently-claimable prediction for a user in sequence, reusing
   * `claim()` for the actual on-chain submission and bookkeeping per prediction.
   */
  async claimAllRewards(user: User): Promise<ClaimAllRewardsResponseDto> {
    const predictions = await this.predictionsRepository.find({
      where: { user: { id: user.id }, payout_claimed: false },
      relations: ['market'],
    });

    const claimableIds = predictions
      .filter(
        (p) =>
          p.market.is_resolved &&
          p.market.resolved_outcome === p.chosen_outcome,
      )
      .map((p) => p.id);

    if (claimableIds.length === 0) {
      throw new BadRequestException('No claimable rewards');
    }

    let claimedStroops = 0n;
    let lastTxHash = '';
    for (const predictionId of claimableIds) {
      const claimed = await this.claim(predictionId, user);
      claimedStroops += BigInt(claimed.payout_amount_stroops ?? '0');
      lastTxHash = claimed.tx_hash ?? lastTxHash;
    }

    const summary = await this.getRewardsSummary(user);

    return {
      claimed_xlm: stroopsToXlm(claimedStroops),
      claimed_count: claimableIds.length,
      transaction_hash: lastTxHash,
      summary,
    };
  }

  /**
   * Retrieve paginated, anonymized predictions for a specific market.
   * Returns empty list if market does not exist.
   */
  async findByMarket(
    marketId: string,
    dto: ListMarketPredictionsDto,
  ): Promise<PaginatedMarketPredictionsResponse> {
    const market = await this.marketsRepository.findOne({
      where: { id: marketId },
    });
    if (!market) {
      return {
        data: [],
        total: 0,
        page: dto.page ?? 1,
        limit: dto.limit ?? 20,
      };
    }

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [predictions, total] = await this.predictionsRepository.findAndCount({
      where: { market: { id: marketId } },
      order: { submitted_at: 'DESC' },
      skip,
      take: limit,
    });

    const data: MarketPredictionResponseDto[] = predictions.map((p) => ({
      id: p.id,
      chosen_outcome: p.chosen_outcome,
      stake_amount_stroops: p.stake_amount_stroops,
      payout_claimed: p.payout_claimed,
      payout_amount_stroops: p.payout_amount_stroops,
      tx_hash: p.tx_hash ?? null,
      submitted_at: p.submitted_at,
    }));

    return { data, total, page, limit };
  }
}
