import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SorobanService, SorobanRpcEvent } from './soroban.service';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { SystemState } from './entities/system-state.entity';

const LAST_LEDGER_KEY = 'soroban:last_processed_ledger';

@Injectable()
export class SorobanListener {
  private readonly logger = new Logger(SorobanListener.name);
  private isPolling = false;

  constructor(
    private readonly sorobanService: SorobanService,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(SystemState)
    private readonly systemStateRepository: Repository<SystemState>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollEvents(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Soroban listener skipped because previous poll is still running');
      return;
    }

    this.isPolling = true;

    try {
      const lastProcessedLedger = await this.getLastProcessedLedger();
      const fromLedger = Math.max(lastProcessedLedger + 1, 1);

      const { events, latestLedger } = await this.sorobanService.getEvents(fromLedger);
      if (events.length === 0) {
        if (latestLedger > lastProcessedLedger) {
          await this.persistLastProcessedLedger(latestLedger);
        }
        return;
      }

      let maxProcessedLedger = lastProcessedLedger;
      const ordered = [...events].sort((a, b) => a.ledger - b.ledger);

      for (const event of ordered) {
        await this.processEvent(event);
        if (event.ledger > maxProcessedLedger) {
          maxProcessedLedger = event.ledger;
        }
      }

      await this.persistLastProcessedLedger(Math.max(maxProcessedLedger, latestLedger));
    } catch (error) {
      this.logger.error('Failed to poll Soroban events', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processEvent(event: SorobanRpcEvent): Promise<void> {
    const eventType = this.detectEventType(event);

    switch (eventType) {
      case 'MarketCreated':
        await this.handleMarketCreated(event.value);
        break;
      case 'MarketResolved':
        await this.handleMarketResolved(event.value);
        break;
      case 'PredictionSubmitted':
        await this.handlePredictionSubmitted(event.value);
        break;
      case 'PayoutClaimed':
        await this.handlePayoutClaimed(event.value);
        break;
      default:
        this.logger.debug(`Skipping unknown Soroban event: ${event.topic.join('.')}`);
    }
  }

  private detectEventType(event: SorobanRpcEvent):
    | 'MarketCreated'
    | 'MarketResolved'
    | 'PredictionSubmitted'
    | 'PayoutClaimed'
    | null {
    const topics = event.topic.map((topic) => topic.toLowerCase());

    if (topics.includes('created') || topics.includes('marketcreated')) {
      return 'MarketCreated';
    }
    if (topics.includes('reslvd') || topics.includes('marketresolved')) {
      return 'MarketResolved';
    }
    if (topics.includes('submitd') || topics.includes('predictionsubmitted')) {
      return 'PredictionSubmitted';
    }
    if (topics.includes('payclmd') || topics.includes('payoutclaimed')) {
      return 'PayoutClaimed';
    }

    const explicitType = this.readString(event.value, 'event');
    if (explicitType === 'MarketCreated') return 'MarketCreated';
    if (explicitType === 'MarketResolved') return 'MarketResolved';
    if (explicitType === 'PredictionSubmitted') return 'PredictionSubmitted';
    if (explicitType === 'PayoutClaimed') return 'PayoutClaimed';

    return null;
  }

  private async handleMarketCreated(payload: Record<string, unknown>): Promise<void> {
    const onChainMarketId =
      this.readString(payload, 'market_id') ??
      this.readString(payload, 'on_chain_market_id') ??
      this.readString(payload, 'marketId');

    if (!onChainMarketId) {
      this.logger.warn('MarketCreated event skipped: missing market_id');
      return;
    }

    const existing = await this.marketsRepository.findOne({
      where: { on_chain_market_id: onChainMarketId },
      relations: ['creator'],
    });
    if (existing) {
      return;
    }

    const creatorAddress =
      this.readString(payload, 'creator') ?? this.readString(payload, 'creator_address');
    const creator = creatorAddress
      ? await this.usersRepository.findOne({ where: { stellar_address: creatorAddress } })
      : null;

    const market = this.marketsRepository.create({
      on_chain_market_id: onChainMarketId,
      creator: creator ?? undefined,
      title: this.readString(payload, 'title') ?? `Market ${onChainMarketId}`,
      description: this.readString(payload, 'description') ?? 'On-chain market',
      category: this.readString(payload, 'category') ?? 'OnChain',
      outcome_options: this.readStringArray(payload, 'outcome_options') ?? ['YES', 'NO'],
      end_time: this.readDate(payload, 'end_time') ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      resolution_time:
        this.readDate(payload, 'resolution_time') ??
        new Date(Date.now() + 48 * 60 * 60 * 1000),
      is_public: this.readBoolean(payload, 'is_public') ?? true,
      is_resolved: false,
      is_cancelled: false,
      total_pool_stroops: this.readBigIntString(payload, 'total_pool_stroops') ?? '0',
      participant_count: this.readNumber(payload, 'participant_count') ?? 0,
    });

    await this.marketsRepository.save(market);
  }

  private async handleMarketResolved(payload: Record<string, unknown>): Promise<void> {
    const market = await this.findMarketFromPayload(payload);
    if (!market) {
      this.logger.warn('MarketResolved event skipped: market not found');
      return;
    }

    market.is_resolved = true;
    market.resolved_outcome =
      this.readString(payload, 'resolved_outcome') ??
      this.readString(payload, 'outcome') ??
      market.resolved_outcome;

    await this.marketsRepository.save(market);
  }

  private async handlePredictionSubmitted(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const market = await this.findMarketFromPayload(payload);
    if (!market) {
      this.logger.warn('PredictionSubmitted event skipped: market not found');
      return;
    }

    const predictorAddress =
      this.readString(payload, 'predictor') ?? this.readString(payload, 'user_address');
    if (!predictorAddress) {
      this.logger.warn('PredictionSubmitted event skipped: missing predictor');
      return;
    }

    const user = await this.usersRepository.findOne({
      where: { stellar_address: predictorAddress },
    });
    if (!user) {
      this.logger.warn(`PredictionSubmitted event skipped: unknown user ${predictorAddress}`);
      return;
    }

    const existing = await this.predictionsRepository.findOne({
      where: {
        user: { id: user.id },
        market: { id: market.id },
      },
      relations: ['user', 'market'],
    });
    if (existing) {
      return;
    }

    const stake =
      this.readBigIntString(payload, 'stake_amount_stroops') ??
      this.readBigIntString(payload, 'stake_amount') ??
      '0';

    const prediction = this.predictionsRepository.create({
      user,
      market,
      chosen_outcome: this.readString(payload, 'chosen_outcome') ?? 'UNKNOWN',
      stake_amount_stroops: stake,
      payout_claimed: false,
      payout_amount_stroops: '0',
      tx_hash: this.readString(payload, 'tx_hash') ?? undefined,
    });

    await this.predictionsRepository.save(prediction);

    market.participant_count += 1;
    market.total_pool_stroops = (
      BigInt(market.total_pool_stroops) + BigInt(stake)
    ).toString();
    await this.marketsRepository.save(market);
  }

  private async handlePayoutClaimed(payload: Record<string, unknown>): Promise<void> {
    const market = await this.findMarketFromPayload(payload);
    if (!market) {
      this.logger.warn('PayoutClaimed event skipped: market not found');
      return;
    }

    const predictorAddress =
      this.readString(payload, 'predictor') ?? this.readString(payload, 'user_address');
    if (!predictorAddress) {
      this.logger.warn('PayoutClaimed event skipped: missing predictor');
      return;
    }

    const user = await this.usersRepository.findOne({
      where: { stellar_address: predictorAddress },
    });
    if (!user) {
      this.logger.warn(`PayoutClaimed event skipped: unknown user ${predictorAddress}`);
      return;
    }

    const prediction = await this.predictionsRepository.findOne({
      where: {
        user: { id: user.id },
        market: { id: market.id },
      },
      relations: ['user', 'market'],
    });
    if (!prediction) {
      this.logger.warn('PayoutClaimed event skipped: prediction not found');
      return;
    }

    prediction.payout_claimed = true;
    prediction.payout_amount_stroops =
      this.readBigIntString(payload, 'payout_amount_stroops') ??
      this.readBigIntString(payload, 'payout_amount') ??
      prediction.payout_amount_stroops;

    await this.predictionsRepository.save(prediction);
  }

  private async findMarketFromPayload(
    payload: Record<string, unknown>,
  ): Promise<Market | null> {
    const onChainMarketId =
      this.readString(payload, 'market_id') ??
      this.readString(payload, 'on_chain_market_id') ??
      this.readString(payload, 'marketId');

    if (!onChainMarketId) {
      return null;
    }

    return this.marketsRepository.findOne({
      where: { on_chain_market_id: onChainMarketId },
    });
  }

  private async getLastProcessedLedger(): Promise<number> {
    const state = await this.systemStateRepository.findOne({
      where: { key: LAST_LEDGER_KEY },
    });

    if (!state) {
      return 0;
    }

    const parsed = Number(state.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async persistLastProcessedLedger(ledger: number): Promise<void> {
    const value = String(ledger);
    await this.systemStateRepository.upsert(
      { key: LAST_LEDGER_KEY, value },
      ['key'],
    );
  }

  private readString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === 'string' ? value : null;
  }

  private readNumber(payload: Record<string, unknown>, key: string): number | null {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private readDate(payload: Record<string, unknown>, key: string): Date | null {
    const seconds = this.readNumber(payload, key);
    if (seconds === null) {
      return null;
    }
    return new Date(seconds * 1000);
  }

  private readBoolean(payload: Record<string, unknown>, key: string): boolean | null {
    const value = payload[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
    return null;
  }

  private readBigIntString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    if (typeof value === 'string') {
      try {
        return BigInt(value).toString();
      } catch {
        return null;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(value).toString();
    }
    return null;
  }

  private readStringArray(payload: Record<string, unknown>, key: string): string[] | null {
    const value = payload[key];
    if (!Array.isArray(value)) {
      return null;
    }

    const items = value.filter((item): item is string => typeof item === 'string');
    return items.length > 0 ? items : null;
  }
}
