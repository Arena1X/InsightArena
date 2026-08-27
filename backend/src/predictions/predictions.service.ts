import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, In } from 'typeorm';
import { Readable } from 'stream';
import { Prediction } from './entities/prediction.entity';
import {
  FraudFlagStatus,
  FraudSignalType,
  PredictionFraudFlag,
} from './entities/prediction-fraud-flag.entity';
import { ListFraudFlagsQueryDto } from './dto/list-fraud-flags-query.dto';
import { SubmitPredictionDto } from './dto/submit-prediction.dto';
import { SubmitPredictionResponseDto } from './dto/submit-prediction-response.dto';
import {
  BatchPredictionItemDto,
  MAX_BATCH_PREDICTIONS,
  SubmitBatchPredictionsDto,
} from './dto/submit-batch-prediction.dto';
import {
  BATCH_PREDICTION_STATUS,
  BatchPredictionResultDto,
  BatchSubmitResponseDto,
} from './dto/batch-submit-response.dto';
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
import { PnlQueryDto, PnlResponseDto } from './dto/pnl-query.dto';
import { ExportPredictionsDto } from './dto/export-predictions.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Market } from '../markets/entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';
import { SlippageCheckerService } from './services/slippage-checker.service';
import {
  ClaimAllRewardsResponseDto,
  RewardsSummaryDto,
} from './dto/rewards-summary.dto';

const STROOPS_PER_XLM = 10_000_000n;

function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_XLM);
}

/**
 * Same conversion but accepts negative bigint values, preserving the sign.
 */
function signedStroopsToXlm(stroops: bigint): number {
  if (stroops < 0n) {
    return -(Number(-stroops) / Number(STROOPS_PER_XLM));
  }
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
    @InjectRepository(PredictionFraudFlag)
    private readonly fraudFlagsRepository: Repository<PredictionFraudFlag>,
    private readonly sorobanService: SorobanService,
    private readonly slippageCheckerService: SlippageCheckerService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Submit a prediction for a market with optional slippage protection.
   * Validates market state and outcome, prevents duplicates,
   * calls Soroban to lock stake on-chain, checks slippage tolerance,
   * then persists and updates counters.
   */
  async submit(
    dto: SubmitPredictionDto,
    user: User,
  ): Promise<SubmitPredictionResponseDto> {
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

    const { tx_hash, realized_price, shares_received } =
      await this.sorobanService.submitPrediction(
        user.stellar_address,
        market.on_chain_market_id,
        dto.chosen_outcome,
        dto.stake_amount_stroops,
      );

    // Check slippage tolerance if bounds are specified and contract returned price/shares
    if (
      (dto.maxPrice || dto.minSharesOut) &&
      realized_price &&
      shares_received
    ) {
      this.slippageCheckerService.checkSlippage(
        dto.maxPrice,
        dto.minSharesOut,
        realized_price,
        shares_received,
      );
    }

    const prediction = await this.dataSource.transaction(async (manager) => {
      const pred = manager.create(Prediction, {
        user,
        market,
        chosen_outcome: dto.chosen_outcome,
        stake_amount_stroops: dto.stake_amount_stroops,
        tx_hash,
        payout_claimed: false,
        payout_amount_stroops: '0',
      });

      const saved = await manager.save(pred);

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

    // Fraud signals are advisory-only and must never block or roll back a
    // legitimate prediction submission, so evaluation failures are swallowed.
    this.evaluateFraudSignalsForUser(user.id).catch((err) => {
      this.logger.error(
        `Fraud signal evaluation failed for user ${user.id}`,
        err,
      );
    });

    // A submitted prediction is this user's qualifying action for referral
    // purposes; no-ops if they weren't referred. Non-blocking for the same
    // reason as fraud signal evaluation above.
    this.usersService.recordQualifyingAction(user.id).catch((err) => {
      this.logger.error(
        `Referral qualifying-action tracking failed for user ${user.id}`,
        err,
      );
    });

    return {
      prediction,
      realized_price: realized_price || '0',
      shares_received: shares_received || '0',
    };
  }

  /**
   * Submit a batch (slip) of predictions in a single call.
   *
   * Validation is performed up-front for every item. In atomic mode
   * (default) any validation or on-chain failure rejects the whole slip
   * before anything is persisted; in non-atomic mode valid items are still
   * submitted and failures are reported per item in the response.
   */
  async submitBatch(
    dto: SubmitBatchPredictionsDto,
    user: User,
  ): Promise<BatchSubmitResponseDto> {
    const atomic = dto.atomic ?? true;
    const items = dto.predictions;

    if (items.length > MAX_BATCH_PREDICTIONS) {
      throw new BadRequestException(
        `Batch size exceeds the maximum of ${MAX_BATCH_PREDICTIONS} predictions`,
      );
    }

    // Bulk-load every referenced market exactly once.
    const marketIds = [...new Set(items.map((item) => item.market_id))];
    const markets =
      marketIds.length > 0
        ? await this.marketsRepository.find({ where: { id: In(marketIds) } })
        : [];
    const marketById = new Map(markets.map((market) => [market.id, market]));

    // Markets this user has already predicted on (duplicate guard).
    const existingPredictions =
      marketIds.length > 0
        ? await this.predictionsRepository.find({
            where: {
              user: { id: user.id },
              market: { id: In(marketIds) },
            },
          })
        : [];
    const predictedMarketIds = new Set(
      existingPredictions.map((prediction) => prediction.market.id),
    );

    // Validate every item before touching the chain.
    const seenInBatch = new Set<string>();
    const failures = new Map<number, string>();
    items.forEach((item, index) => {
      const failure = this.getBatchItemFailure(
        item,
        marketById.get(item.market_id),
        predictedMarketIds,
        seenInBatch,
      );
      if (failure) {
        failures.set(index, failure);
      }
    });

    if (atomic && failures.size > 0) {
      throw new BadRequestException({
        message:
          'Batch submission failed validation - no predictions were submitted',
        errors: [...failures].map(([index, error]) => ({ index, error })),
      });
    }

    // On-chain submissions + slippage checks for actionable items only.
    const chainResults = new Map<
      number,
      { tx_hash: string; realized_price: string; shares_received: string }
    >();

    for (let index = 0; index < items.length; index++) {
      if (failures.has(index)) continue;

      const item = items[index];
      const market = marketById.get(item.market_id) as Market;

      try {
        const result = await this.sorobanService.submitPrediction(
          user.stellar_address,
          market.on_chain_market_id,
          item.chosen_outcome,
          item.stake_amount_stroops,
        );

        if (
          (item.maxPrice || item.minSharesOut) &&
          result.realized_price &&
          result.shares_received
        ) {
          this.slippageCheckerService.checkSlippage(
            item.maxPrice,
            item.minSharesOut,
            result.realized_price,
            result.shares_received,
          );
        }

        chainResults.set(index, {
          tx_hash: result.tx_hash,
          realized_price: result.realized_price || '0',
          shares_received: result.shares_received || '0',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.set(index, `On-chain submission failed: ${message}`);

        if (atomic) {
          throw new BadRequestException({
            message:
              'Batch submission failed on-chain - no predictions were persisted',
            errors: [...failures].map(([i, error]) => ({ index: i, error })),
          });
        }
      }
    }

    // Persist every successful item inside a single database transaction.
    const persistedByIndex = await this.dataSource.transaction(
      async (
        manager,
      ): Promise<Map<number, { prediction: Prediction; tx_hash: string }>> => {
        const savedByIndex = new Map<
          number,
          { prediction: Prediction; tx_hash: string }
        >();
        let totalStake = 0n;

        for (const [index, result] of chainResults) {
          const item = items[index];
          const market = marketById.get(item.market_id) as Market;
          totalStake += BigInt(item.stake_amount_stroops);

          const pred = manager.create(Prediction, {
            user,
            market,
            chosen_outcome: item.chosen_outcome,
            stake_amount_stroops: item.stake_amount_stroops,
            tx_hash: result.tx_hash,
            payout_claimed: false,
            payout_amount_stroops: '0',
          });

          const saved = await manager.save(pred);
          savedByIndex.set(index, {
            prediction: saved,
            tx_hash: result.tx_hash,
          });

          await manager
            .createQueryBuilder()
            .update(Market)
            .set({
              participant_count: () => 'participant_count + 1',
              ...(BigInt(item.stake_amount_stroops) !== 0n
                ? {
                    total_pool_stroops: () =>
                      'CAST(total_pool_stroops AS BIGINT) + :stakeAmount',
                  }
                : {}),
            })
            .where('id = :id', { id: market.id })
            .setParameter(
              'stakeAmount',
              BigInt(item.stake_amount_stroops).toString(),
            )
            .execute();

          this.logger.log(
            `Batch item ${index}: prediction ${saved.id} saved for user ${user.id} on market ${market.id}`,
          );
        }

        // Aggregate user counters once per slip.
        if (chainResults.size > 0) {
          await manager
            .createQueryBuilder()
            .update(User)
            .set({
              total_predictions: () =>
                `total_predictions + ${chainResults.size}`,
              ...(totalStake !== 0n
                ? {
                    total_staked_stroops: () =>
                      'CAST(total_staked_stroops AS BIGINT) + :totalStake',
                  }
                : {}),
            })
            .where('id = :id', { id: user.id })
            .setParameter('totalStake', totalStake.toString())
            .execute();
        }

        return savedByIndex;
      },
    );

    // Post-persist hooks are advisory-only and non-blocking.
    this.evaluateFraudSignalsForUser(user.id).catch((err) => {
      this.logger.error(
        `Fraud signal evaluation failed for user ${user.id}`,
        err,
      );
    });
    this.usersService.recordQualifyingAction(user.id).catch((err) => {
      this.logger.error(
        `Referral qualifying-action tracking failed for user ${user.id}`,
        err,
      );
    });

    const results: BatchPredictionResultDto[] = items.map((item, index) => {
      const saved = persistedByIndex.get(index);

      if (!saved) {
        return {
          index,
          market_id: item.market_id,
          status: BATCH_PREDICTION_STATUS.REJECTED,
          error: failures.get(index),
        };
      }

      return {
        index,
        market_id: item.market_id,
        status: BATCH_PREDICTION_STATUS.FULFILLED,
        prediction: saved.prediction,
        realized_price: chainResults.get(index)?.realized_price || '0',
        shares_received: chainResults.get(index)?.shares_received || '0',
      };
    });

    return {
      results,
      succeeded: results.filter(
        (r) => r.status === BATCH_PREDICTION_STATUS.FULFILLED,
      ).length,
      failed: results.filter(
        (r) => r.status === BATCH_PREDICTION_STATUS.REJECTED,
      ).length,
      atomic,
    };
  }

  private getBatchItemFailure(
    item: BatchPredictionItemDto,
    market: Market | undefined,
    predictedMarketIds: Set<string>,
    seenInBatch: Set<string>,
  ): string | null {
    if (!market) {
      return `Market "${item.market_id}" not found`;
    }

    if (market.is_paused) {
      return 'Market is paused - predictions are no longer accepted';
    }

    if (
      market.is_resolved ||
      market.is_cancelled ||
      new Date() > market.end_time
    ) {
      return 'Market is closed - predictions are no longer accepted';
    }

    if (!market.outcome_options.includes(item.chosen_outcome)) {
      return `Invalid outcome "${item.chosen_outcome}". Valid options: ${market.outcome_options.join(', ')}`;
    }

    if (predictedMarketIds.has(market.id)) {
      return 'You have already submitted a prediction for this market';
    }

    if (seenInBatch.has(market.id)) {
      return 'Duplicate prediction for this market within the batch';
    }
    seenInBatch.add(market.id);

    return null;
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

  /**
   * Stream the user's predictions as a CSV without loading all rows into memory.
   * Returns a Readable stream that pipes CSV rows as they are fetched.
   */
  exportCsv(user: User, dto: ExportPredictionsDto): Readable {
    const qb = this.predictionsRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .orderBy('prediction.submitted_at', 'DESC')
      .select([
        'prediction.id',
        'prediction.chosen_outcome',
        'prediction.stake_amount_stroops',
        'prediction.payout_claimed',
        'prediction.payout_amount_stroops',
        'prediction.submitted_at',
        'prediction.note',
        'market.title',
        'market.resolved_outcome',
        'market.is_resolved',
        'market.is_cancelled',
      ]);

    if (dto.start_date) {
      qb.andWhere('prediction.submitted_at >= :startDate', {
        startDate: new Date(dto.start_date),
      });
    }
    if (dto.end_date) {
      qb.andWhere('prediction.submitted_at <= :endDate', {
        endDate: new Date(dto.end_date),
      });
    }

    const readable = new Readable({ read() {} });

    // Start streaming asynchronously
    (async () => {
      try {
        readable.push(
          'id,market_title,chosen_outcome,stake_stroops,status,payout_stroops,note,submitted_at\n',
        );

        const stream = await qb.stream();

        for await (const prediction of stream) {
          const market = prediction.market ?? {};
          const status = computeExportStatus(prediction, market);
          const note = (prediction.note ?? '').replace(/"/g, '""');
          const title = (market.title ?? '').replace(/"/g, '""');
          const row = [
            prediction.id,
            `"${title}"`,
            `"${prediction.chosen_outcome}"`,
            prediction.stake_amount_stroops,
            status,
            prediction.payout_amount_stroops ?? '0',
            `"${note}"`,
            prediction.submitted_at instanceof Date
              ? prediction.submitted_at.toISOString()
              : String(prediction.submitted_at),
          ].join(',');

          readable.push(row + '\n');
        }

        readable.push(null);
      } catch (err) {
        readable.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return readable;
  }

  /**
   * Compute fraud signals for a user and persist advisory flags for any
   * signal that exceeds its configured threshold. This never bans, mutes,
   * or otherwise restricts the user - it only records data for admin review.
   */
  async evaluateFraudSignalsForUser(
    userId: string,
  ): Promise<PredictionFraudFlag[]> {
    const created: PredictionFraudFlag[] = [];

    const timingResult = await this.computeTimingClusteringSignal(userId);
    if (timingResult) {
      created.push(
        await this.upsertFraudFlag(
          userId,
          FraudSignalType.TIMING_CLUSTERING,
          timingResult,
        ),
      );
    }

    const concentrationResult =
      await this.computeCounterpartyConcentrationSignal(userId);
    if (concentrationResult) {
      created.push(
        await this.upsertFraudFlag(
          userId,
          FraudSignalType.COUNTERPARTY_CONCENTRATION,
          concentrationResult,
        ),
      );
    }

    return created;
  }

  /**
   * Timing clustering signal: measures how tightly a user's prediction
   * submissions bunch together in time. A high ratio of very short gaps
   * between consecutive predictions is characteristic of scripted/bot-driven
   * wash-trading rather than organic, independently-timed decisions.
   */
  private async computeTimingClusteringSignal(
    userId: string,
  ): Promise<FraudSignalResult | null> {
    const minSample = this.getIntConfig('FRAUD_TIMING_MIN_SAMPLE', 5);
    const windowSeconds = this.getIntConfig(
      'FRAUD_TIMING_CLUSTER_WINDOW_SECONDS',
      30,
    );
    const minRatio = this.getFloatConfig('FRAUD_TIMING_CLUSTER_MIN_RATIO', 0.6);

    const predictions = await this.predictionsRepository.find({
      where: { user: { id: userId } },
      order: { submitted_at: 'ASC' },
    });

    if (predictions.length < minSample) {
      return null;
    }

    const totalGaps = predictions.length - 1;
    let clusteredGaps = 0;
    for (let i = 1; i < predictions.length; i++) {
      const gapSeconds =
        (predictions[i].submitted_at.getTime() -
          predictions[i - 1].submitted_at.getTime()) /
        1000;
      if (gapSeconds <= windowSeconds) {
        clusteredGaps++;
      }
    }

    const ratio = totalGaps > 0 ? clusteredGaps / totalGaps : 0;
    if (ratio < minRatio) {
      return null;
    }

    return {
      score: ratio,
      threshold: minRatio,
      details: {
        sample_size: predictions.length,
        clustered_gaps: clusteredGaps,
        total_gaps: totalGaps,
        window_seconds: windowSeconds,
      },
    };
  }

  /**
   * Counterparty concentration signal: measures how concentrated a user's
   * market co-participation is across other users, using a
   * Herfindahl-Hirschman Index (HHI) over the share of the user's markets
   * each counterparty also participated in. A high HHI means the user
   * repeatedly shows up alongside the same small clique of accounts, which
   * is a hallmark of collusion rings or self-dealing across linked wallets.
   */
  private async computeCounterpartyConcentrationSignal(
    userId: string,
  ): Promise<FraudSignalResult | null> {
    const minMarkets = this.getIntConfig('FRAUD_COUNTERPARTY_MIN_MARKETS', 5);
    const hhiThreshold = this.getFloatConfig(
      'FRAUD_COUNTERPARTY_HHI_THRESHOLD',
      0.5,
    );

    const userMarketRows: Array<{ marketId: string }> =
      await this.predictionsRepository
        .createQueryBuilder('prediction')
        .select('DISTINCT prediction.marketId', 'marketId')
        .where('prediction.userId = :userId', { userId })
        .getRawMany();

    const marketIds = userMarketRows.map((row) => row.marketId);
    if (marketIds.length < minMarkets) {
      return null;
    }

    const counterpartyRows: Array<{
      counterpartyId: string;
      marketId: string;
    }> = await this.predictionsRepository
      .createQueryBuilder('prediction')
      .select('prediction.userId', 'counterpartyId')
      .addSelect('prediction.marketId', 'marketId')
      .where('prediction.marketId IN (:...marketIds)', { marketIds })
      .andWhere('prediction.userId != :userId', { userId })
      .getRawMany();

    const marketsByCounterparty = new Map<string, Set<string>>();
    for (const row of counterpartyRows) {
      const set = marketsByCounterparty.get(row.counterpartyId) ?? new Set();
      set.add(row.marketId);
      marketsByCounterparty.set(row.counterpartyId, set);
    }

    if (marketsByCounterparty.size === 0) {
      return null;
    }

    const totalMarkets = marketIds.length;
    let hhi = 0;
    let topCounterpartyId: string | null = null;
    let topShare = 0;
    for (const [counterpartyId, sharedMarkets] of marketsByCounterparty) {
      const share = sharedMarkets.size / totalMarkets;
      hhi += share * share;
      if (share > topShare) {
        topShare = share;
        topCounterpartyId = counterpartyId;
      }
    }

    if (hhi < hhiThreshold) {
      return null;
    }

    return {
      score: hhi,
      threshold: hhiThreshold,
      details: {
        total_markets: totalMarkets,
        distinct_counterparties: marketsByCounterparty.size,
        top_counterparty_id: topCounterpartyId,
        top_counterparty_share: topShare,
      },
    };
  }

  /**
   * Creates a new advisory flag, or refreshes the existing open flag for the
   * same user/signal so repeated evaluations don't spam duplicate rows.
   */
  private async upsertFraudFlag(
    userId: string,
    signalType: FraudSignalType,
    result: FraudSignalResult,
  ): Promise<PredictionFraudFlag> {
    const existing = await this.fraudFlagsRepository.findOne({
      where: {
        user_id: userId,
        signal_type: signalType,
        status: FraudFlagStatus.OPEN,
      },
    });

    if (existing) {
      existing.score = result.score;
      existing.threshold = result.threshold;
      existing.details = result.details;
      return this.fraudFlagsRepository.save(existing);
    }

    const flag = this.fraudFlagsRepository.create({
      user_id: userId,
      signal_type: signalType,
      score: result.score,
      threshold: result.threshold,
      details: result.details,
      status: FraudFlagStatus.OPEN,
    });

    const saved = await this.fraudFlagsRepository.save(flag);

    this.logger.warn(
      `Fraud signal "${signalType}" flagged for user ${userId} (score=${result.score.toFixed(3)}, threshold=${result.threshold})`,
    );

    return saved;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // P&L Calculation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Compute realized and unrealized P&L for a user.
   *
   * Realized P&L  — settled (resolved or cancelled) markets only.
   *   Won:      payout_amount_stroops - stake_amount_stroops
   *   Lost:     0 - stake_amount_stroops  (stake is gone)
   *   Cancelled: 0 (stake returned by protocol; treated as break-even here)
   *
   * Unrealized P&L — open (unresolved, uncancelled) markets.
   *   Implied fair value = stake × (total_pool / stake_for_chosen_outcome)
   *   Unrealized P&L    = implied_value - stake
   *
   *   When stake_for_chosen_outcome is 0 (shouldn't happen but guard it),
   *   we fall back to 0 unrealized value.
   *
   * The optional time filter applies to `prediction.submitted_at` so users
   * can scope the report to a specific window.
   *
   * When `breakdown=true` the response also includes a per-market array whose
   * values sum exactly to the aggregate totals (verified by the caller and
   * by our unit tests).
   */
  async getPnl(user: User, dto: PnlQueryDto): Promise<PnlResponseDto> {
    const qb = this.predictionsRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id });

    if (dto.from) {
      qb.andWhere('prediction.submitted_at >= :from', {
        from: new Date(dto.from),
      });
    }
    if (dto.to) {
      qb.andWhere('prediction.submitted_at <= :to', {
        to: new Date(dto.to),
      });
    }

    const predictions = await qb.getMany();

    // We need per-outcome stake totals for every open market the user is in,
    // so we can compute implied odds. Fetch all predictions for those markets
    // (not just the user's) in a single query.
    const openMarketIds = [
      ...new Set(
        predictions
          .filter((p) => !p.market.is_resolved && !p.market.is_cancelled)
          .map((p) => p.market.id),
      ),
    ];

    // Map: marketId -> outcome -> total staked (stroops as bigint)
    const marketOutcomeStake = new Map<string, Map<string, bigint>>();

    if (openMarketIds.length > 0) {
      const rows: Array<{ marketId: string; outcome: string; total: string }> =
        await this.predictionsRepository
          .createQueryBuilder('p')
          .select('p.marketId', 'marketId')
          .addSelect('p.chosen_outcome', 'outcome')
          .addSelect('SUM(CAST(p.stake_amount_stroops AS BIGINT))', 'total')
          .where('p.marketId IN (:...openMarketIds)', { openMarketIds })
          .groupBy('p.marketId, p.chosen_outcome')
          .getRawMany();

      for (const row of rows) {
        if (!marketOutcomeStake.has(row.marketId)) {
          marketOutcomeStake.set(row.marketId, new Map());
        }
        marketOutcomeStake
          .get(row.marketId)!
          .set(row.outcome, BigInt(row.total));
      }
    }

    // Aggregate
    let totalRealizedStroops = 0n;
    let totalUnrealizedStroops = 0n;
    let totalStakedStroops = 0n;

    const perMarketMap = new Map<
      string,
      {
        market_id: string;
        market_title: string;
        realizedStroops: bigint;
        unrealizedStroops: bigint;
        stakedStroops: bigint;
      }
    >();

    for (const prediction of predictions) {
      const market = prediction.market;
      const stake = BigInt(prediction.stake_amount_stroops);
      totalStakedStroops += stake;

      let realizedStroops = 0n;
      let unrealizedStroops = 0n;

      if (market.is_cancelled) {
        // Protocol returns the stake; treat as break-even (0 P&L)
        realizedStroops = 0n;
      } else if (market.is_resolved) {
        // Settled market
        if (market.resolved_outcome === prediction.chosen_outcome) {
          // Won: payout - stake
          const payout = BigInt(prediction.payout_amount_stroops ?? '0');
          realizedStroops = payout - stake;
        } else {
          // Lost: -stake
          realizedStroops = -stake;
        }
      } else {
        // Open position — compute implied value from pool-weighted odds
        const outcomeStake = marketOutcomeStake.get(market.id);
        const chosenOutcomeStake =
          outcomeStake?.get(prediction.chosen_outcome) ?? 0n;
        const totalPool = BigInt(market.total_pool_stroops ?? '0');

        if (chosenOutcomeStake > 0n && totalPool > 0n) {
          // implied_value = stake * (total_pool / chosen_outcome_pool)
          // Using integer arithmetic with a precision multiplier to avoid
          // floating-point loss before the final XLM conversion.
          const PRECISION = 1_000_000n;
          const impliedValueStroops =
            (stake * totalPool * PRECISION) / chosenOutcomeStake / PRECISION;
          unrealizedStroops = impliedValueStroops - stake;
        }
        // else: can't compute odds; leave unrealized at 0
      }

      totalRealizedStroops += realizedStroops;
      totalUnrealizedStroops += unrealizedStroops;

      if (dto.breakdown) {
        const existing = perMarketMap.get(market.id);
        if (existing) {
          existing.realizedStroops += realizedStroops;
          existing.unrealizedStroops += unrealizedStroops;
          existing.stakedStroops += stake;
        } else {
          perMarketMap.set(market.id, {
            market_id: market.id,
            market_title: market.title,
            realizedStroops,
            unrealizedStroops,
            stakedStroops: stake,
          });
        }
      }
    }

    const result: PnlResponseDto = {
      realized_pnl_xlm: signedStroopsToXlm(totalRealizedStroops),
      unrealized_pnl_xlm: signedStroopsToXlm(totalUnrealizedStroops),
      total_staked_xlm: stroopsToXlm(totalStakedStroops),
    };

    if (dto.breakdown) {
      result.per_market = [...perMarketMap.values()].map((entry) => ({
        market_id: entry.market_id,
        market_title: entry.market_title,
        realized_pnl_xlm: signedStroopsToXlm(entry.realizedStroops),
        unrealized_pnl_xlm: signedStroopsToXlm(entry.unrealizedStroops),
        staked_xlm: stroopsToXlm(entry.stakedStroops),
      }));
    }

    return result;
  }

  private getIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getFloatConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw !== undefined ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Paginated, admin-facing listing of advisory fraud flags. Flags are
   * informational only; no enforcement action is taken based on this data
   * alone.
   */
  async listFraudFlags(query: ListFraudFlagsQueryDto): Promise<{
    data: PredictionFraudFlag[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.fraudFlagsRepository
      .createQueryBuilder('flag')
      .leftJoinAndSelect('flag.user', 'user')
      .orderBy('flag.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('flag.status = :status', { status: query.status });
    }
    if (query.signal_type) {
      qb.andWhere('flag.signal_type = :signalType', {
        signalType: query.signal_type,
      });
    }
    if (query.user_id) {
      qb.andWhere('flag.user_id = :userId', { userId: query.user_id });
    }

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

interface FraudSignalResult {
  score: number;
  threshold: number;
  details: Record<string, unknown>;
}

function computeExportStatus(
  prediction: { chosen_outcome: string },
  market: {
    is_cancelled?: boolean;
    is_resolved?: boolean;
    resolved_outcome?: string | null;
  },
): string {
  if (market.is_cancelled) return 'pending';
  if (!market.is_resolved) return 'active';
  if (market.resolved_outcome === prediction.chosen_outcome) return 'won';
  return 'lost';
}
