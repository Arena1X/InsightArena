import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market, MarketSettlementState } from './entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';

@Injectable()
export class MarketSettlementScheduler {
  private readonly logger = new Logger(MarketSettlementScheduler.name);
  private readonly MAX_SETTLEMENTS_PER_TICK = 50;

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    private readonly sorobanService: SorobanService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleSettlement(): Promise<void> {
    try {
      await this.settleEligibleMarkets();
    } catch (err) {
      this.logger.error('Market settlement sweep failed', err);
    }
  }

  /**
   * Finds PROPOSED markets whose grace period has elapsed and settles them.
   * Each market is claimed via a conditional UPDATE guarded on its current
   * settlement_state, so calling this concurrently or twice for the same
   * tick settles each eligible market exactly once.
   */
  async settleEligibleMarkets(): Promise<number> {
    const candidates = await this.marketsRepository.find({
      where: { settlement_state: MarketSettlementState.PROPOSED },
      take: this.MAX_SETTLEMENTS_PER_TICK,
    });

    const now = Date.now();
    const due = candidates.filter((market) => {
      if (!market.resolution_proposed_at) {
        return false;
      }
      const deadline =
        market.resolution_proposed_at.getTime() +
        market.grace_period_seconds * 1000;
      return deadline <= now;
    });

    let settledCount = 0;
    for (const market of due) {
      const settled = await this.settleMarket(market);
      if (settled) {
        settledCount++;
      }
    }

    if (settledCount > 0) {
      this.logger.log(`Settled ${settledCount} market(s) past grace period`);
    }

    return settledCount;
  }

  private async settleMarket(market: Market): Promise<boolean> {
    const { affected } = await this.marketsRepository.update(
      { id: market.id, settlement_state: MarketSettlementState.PROPOSED },
      {
        settlement_state: MarketSettlementState.SETTLED,
        is_resolved: true,
        resolved_outcome: market.proposed_outcome as string,
        resolved_at: new Date(),
      },
    );

    if (!affected) {
      this.logger.debug(
        `Market ${market.id} was already settled by another run, skipping`,
      );
      return false;
    }

    try {
      await this.sorobanService.resolveMarket(
        market.on_chain_market_id,
        market.proposed_outcome as string,
      );
    } catch (err) {
      this.logger.error(
        `Soroban settlement call failed for market ${market.id}`,
        err,
      );
    }

    await this.webhookDispatcher.emit('market.settled', {
      id: market.id,
      on_chain_market_id: market.on_chain_market_id,
      resolved_outcome: market.proposed_outcome,
      settled_at: new Date(),
    });

    this.logger.log(`Market ${market.id} settled after grace period elapsed`);

    return true;
  }
}
