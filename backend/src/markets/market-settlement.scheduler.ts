import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Market, MarketSettlementState } from './entities/market.entity';
import {
  SettlementAttempt,
  SettlementAttemptStatus,
} from './entities/settlement-attempt.entity';
import { SorobanService } from '../soroban/soroban.service';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';

export interface SettlementRetryInfo {
  marketId: string;
  attempts: number;
  lastError?: string;
  nextRetryAt: Date;
}

@Injectable()
export class MarketSettlementScheduler {
  private readonly logger = new Logger(MarketSettlementScheduler.name);
  private readonly MAX_SETTLEMENTS_PER_TICK = 50;
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly INITIAL_BACKOFF_MS = 60000; // 1 minute
  // A market stuck in SETTLING with its latest attempt still RESOLVING past
  // this age is presumed abandoned by a crashed/killed instance and is
  // eligible to be picked back up.
  private readonly STALE_SETTLING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly deadLetterQueue: Map<string, SettlementRetryInfo> =
    new Map();

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(SettlementAttempt)
    private readonly settlementAttemptRepository: Repository<SettlementAttempt>,
    private readonly dataSource: DataSource,
    private readonly sorobanService: SorobanService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleSettlement(): Promise<void> {
    try {
      await this.settleEligibleMarkets();
      await this.processRetries();
    } catch (err) {
      this.logger.error('Market settlement sweep failed', err);
    }
  }

  /**
   * Process items in retry queue with exponential backoff
   */
  private async processRetries(): Promise<void> {
    const now = new Date();
    const retriesToProcess = Array.from(this.deadLetterQueue.entries()).filter(
      ([, info]) =>
        info.nextRetryAt <= now && info.attempts < this.MAX_RETRY_ATTEMPTS,
    );

    for (const [marketId, retryInfo] of retriesToProcess) {
      const market = await this.marketsRepository.findOne({
        where: { id: marketId },
      });
      if (!market) {
        this.deadLetterQueue.delete(marketId);
        continue;
      }

      const settled = await this.settleMarketWithRetry(market, retryInfo);
      if (settled) {
        this.deadLetterQueue.delete(marketId);
        this.logger.log(
          `Market ${marketId} settled after ${retryInfo.attempts + 1} attempt(s)`,
        );
      } else if (retryInfo.attempts >= this.MAX_RETRY_ATTEMPTS - 1) {
        // Move to permanent dead-letter store
        this.logger.error(
          `Market ${marketId} failed after ${this.MAX_RETRY_ATTEMPTS} attempts, moving to dead-letter store`,
        );
        await this.emitDeadLetterAlert(market, retryInfo);
      }
    }
  }

  /**
   * Emit alert when a settlement moves to dead-letter store
   */
  private async emitDeadLetterAlert(
    market: Market,
    retryInfo: SettlementRetryInfo,
  ): Promise<void> {
    await this.webhookDispatcher.emit('market.settlement.failed', {
      marketId: market.id,
      onChainMarketId: market.on_chain_market_id,
      attempts: retryInfo.attempts,
      lastError: retryInfo.lastError,
      timestamp: new Date(),
    });
  }

  /**
   * Finds PROPOSED markets whose grace period has elapsed, plus SETTLING
   * markets abandoned by a crashed run, and settles them. Each market is
   * claimed under a Postgres advisory lock scoped to the claim transaction,
   * so calling this concurrently (multiple instances, or an overlapping
   * tick) settles each eligible market exactly once. A per-market try/catch
   * means one market's unexpected failure never blocks the rest of the
   * batch.
   */
  async settleEligibleMarkets(): Promise<number> {
    const proposedCandidates = await this.marketsRepository.find({
      where: { settlement_state: MarketSettlementState.PROPOSED },
      take: this.MAX_SETTLEMENTS_PER_TICK,
    });

    const now = Date.now();
    const due = proposedCandidates.filter((market) => {
      if (!market.resolution_proposed_at) {
        return false;
      }
      const deadline =
        market.resolution_proposed_at.getTime() +
        market.grace_period_seconds * 1000;
      return deadline <= now;
    });

    const staleSettling = await this.findStaleSettlingMarkets();

    let settledCount = 0;
    for (const market of [...due, ...staleSettling]) {
      try {
        const settled = await this.settleMarket(market);
        if (settled) {
          settledCount++;
        }
      } catch (err) {
        // Skip-and-log: an unexpected failure on one market must not stop
        // the rest of the batch from being processed.
        this.logger.error(
          `Unexpected error settling market ${market.id}, skipping`,
          err,
        );
      }
    }

    if (settledCount > 0) {
      this.logger.log(`Settled ${settledCount} market(s) past grace period`);
    }

    return settledCount;
  }

  /**
   * Markets left in SETTLING whose most recent attempt is still RESOLVING
   * but old enough to be presumed lost to a crash. These are re-claimed
   * exactly like fresh PROPOSED markets.
   */
  private async findStaleSettlingMarkets(): Promise<Market[]> {
    const settlingMarkets = await this.marketsRepository.find({
      where: { settlement_state: MarketSettlementState.SETTLING },
      take: this.MAX_SETTLEMENTS_PER_TICK,
    });
    if (settlingMarkets.length === 0) {
      return [];
    }

    const staleBefore = new Date(Date.now() - this.STALE_SETTLING_THRESHOLD_MS);
    const stale: Market[] = [];
    for (const market of settlingMarkets) {
      const latestAttempt = await this.settlementAttemptRepository.findOne({
        where: { market_id: market.id },
        order: { created_at: 'DESC' },
      });
      if (
        latestAttempt &&
        latestAttempt.status === SettlementAttemptStatus.RESOLVING &&
        latestAttempt.created_at <= staleBefore
      ) {
        stale.push(market);
      }
    }
    return stale;
  }

  /**
   * Acquire a transaction-scoped advisory lock for a market. Scoped with
   * `pg_try_advisory_xact_lock` rather than session-scoped so it is
   * released automatically on commit, rollback, *or* a dropped connection —
   * a crashed instance can never hold the lock forever.
   */
  private async acquireAdvisoryLock(
    queryRunner: QueryRunner,
    marketId: string,
  ): Promise<boolean> {
    const result: Array<{ locked: boolean }> = await queryRunner.query(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
      [marketId],
    );
    return result?.[0]?.locked === true;
  }

  /**
   * Claim a market for settlement: acquire the advisory lock, re-verify
   * eligibility under the lock (guards against re-settling a market another
   * instance already resolved), write a settlement-attempt row, and mark
   * the market SETTLING — all in one short transaction. Returns the claimed
   * outcome/attempt id, or null if the market could not be claimed.
   */
  private async claimMarketForSettlement(
    market: Market,
  ): Promise<{ outcome: string; attemptId: string } | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const gotLock = await this.acquireAdvisoryLock(queryRunner, market.id);
      if (!gotLock) {
        await queryRunner.rollbackTransaction();
        this.logger.debug(
          `Market ${market.id} is locked by another instance, skipping`,
        );
        return null;
      }

      const fresh = await queryRunner.manager.findOne(Market, {
        where: { id: market.id },
      });
      const stillEligible =
        fresh &&
        (fresh.settlement_state === MarketSettlementState.PROPOSED ||
          fresh.settlement_state === MarketSettlementState.SETTLING) &&
        !!fresh.proposed_outcome;

      if (!stillEligible) {
        await queryRunner.rollbackTransaction();
        this.logger.debug(
          `Market ${market.id} no longer eligible (state=${fresh?.settlement_state}), skipping`,
        );
        return null;
      }

      const attempt = queryRunner.manager.create(SettlementAttempt, {
        market_id: fresh.id,
        status: SettlementAttemptStatus.RESOLVING,
        proposed_outcome: fresh.proposed_outcome,
      });
      const savedAttempt = await queryRunner.manager.save(attempt);

      if (fresh.settlement_state !== MarketSettlementState.SETTLING) {
        await queryRunner.manager.update(
          Market,
          { id: fresh.id },
          { settlement_state: MarketSettlementState.SETTLING },
        );
      }

      await queryRunner.commitTransaction();
      return {
        outcome: fresh.proposed_outcome as string,
        attemptId: savedAttempt.id,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to claim market ${market.id}`, err);
      return null;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Record the outcome of an attempt and, on success, flip the market to
   * SETTLED. Reacquires the advisory lock for this short write so a
   * concurrent stale-recovery pass can't interleave with it.
   */
  private async finalizeSettlement(
    market: Market,
    outcome: string,
    attemptId: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.acquireAdvisoryLock(queryRunner, market.id);
      await queryRunner.manager.update(
        Market,
        { id: market.id },
        {
          settlement_state: MarketSettlementState.SETTLED,
          is_resolved: true,
          resolved_outcome: outcome,
          resolved_at: new Date(),
        },
      );
      await queryRunner.manager.update(
        SettlementAttempt,
        { id: attemptId },
        { status: SettlementAttemptStatus.RESOLVED, completed_at: new Date() },
      );
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.webhookDispatcher.emit('market.settled', {
      id: market.id,
      on_chain_market_id: market.on_chain_market_id,
      resolved_outcome: outcome,
      settled_at: new Date(),
    });

    this.logger.log(`Market ${market.id} settled after grace period elapsed`);
  }

  private async recordAttemptFailure(
    attemptId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.settlementAttemptRepository.update(attemptId, {
      status: SettlementAttemptStatus.FAILED,
      error_message: errorMessage,
      completed_at: new Date(),
    });
  }

  private async settleMarket(market: Market): Promise<boolean> {
    const claim = await this.claimMarketForSettlement(market);
    if (!claim) {
      return false;
    }
    const { outcome, attemptId } = claim;

    // The on-chain call runs outside the claim transaction/lock so a slow
    // or hanging RPC call never holds a DB connection or an advisory lock.
    // The market stays SETTLING (and the attempt row stays RESOLVING) for
    // the duration; if this process dies here, the next sweep's staleness
    // check resumes it instead of losing it silently between states.
    try {
      await this.sorobanService.resolveMarket(
        market.on_chain_market_id,
        outcome,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Soroban settlement call failed for market ${market.id}`,
        err,
      );
      await this.recordAttemptFailure(attemptId, errorMsg);
      await this.addToRetryQueue(market, errorMsg);
      return false;
    }

    await this.finalizeSettlement(market, outcome, attemptId);
    return true;
  }

  /**
   * Settle market with retry tracking
   */
  private async settleMarketWithRetry(
    market: Market,
    retryInfo: SettlementRetryInfo,
  ): Promise<boolean> {
    try {
      await this.sorobanService.resolveMarket(
        market.on_chain_market_id,
        market.proposed_outcome as string,
      );

      await this.webhookDispatcher.emit('market.settled', {
        id: market.id,
        on_chain_market_id: market.on_chain_market_id,
        resolved_outcome: market.proposed_outcome,
        settled_at: new Date(),
      });

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Retry attempt ${retryInfo.attempts + 1} failed for market ${market.id}: ${errorMsg}`,
      );

      retryInfo.attempts++;
      retryInfo.lastError = errorMsg;
      retryInfo.nextRetryAt = this.calculateNextRetry(retryInfo.attempts);

      return false;
    }
  }

  /**
   * Add market to retry queue with exponential backoff
   */
  private async addToRetryQueue(market: Market, error: string): Promise<void> {
    if (!this.deadLetterQueue.has(market.id)) {
      this.deadLetterQueue.set(market.id, {
        marketId: market.id,
        attempts: 0,
        lastError: error,
        nextRetryAt: this.calculateNextRetry(0),
      });
      this.logger.log(`Added market ${market.id} to retry queue`);
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(attempts: number): Date {
    const backoffMs = this.INITIAL_BACKOFF_MS * Math.pow(2, attempts);
    return new Date(Date.now() + backoffMs);
  }

  /**
   * Get dead-letter queue contents (admin endpoint)
   */
  getDeadLetterQueue(): SettlementRetryInfo[] {
    return Array.from(this.deadLetterQueue.values());
  }

  /**
   * Manually retry a failed settlement (admin endpoint)
   */
  async retrySettlement(marketId: string): Promise<boolean> {
    const market = await this.marketsRepository.findOne({
      where: { id: marketId },
    });
    if (!market) {
      throw new Error(`Market ${marketId} not found`);
    }

    const retryInfo = this.deadLetterQueue.get(marketId);
    if (!retryInfo) {
      throw new Error(`Market ${marketId} not in retry queue`);
    }

    const settled = await this.settleMarketWithRetry(market, retryInfo);
    if (settled) {
      this.deadLetterQueue.delete(marketId);
    }

    return settled;
  }
}