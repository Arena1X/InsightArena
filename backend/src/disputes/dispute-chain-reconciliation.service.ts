import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Dispute,
  DisputeResolution,
  DisputeStatus,
} from './entities/dispute.entity';
import {
  SorobanOnChainDispute,
  SorobanService,
} from '../soroban/soroban.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

const DEFAULT_RECONCILE_BATCH_SIZE = 50;
const DEFAULT_DRIFT_ALERT_THRESHOLD = 5;
const DEFAULT_CRITICAL_DRIFT_THRESHOLD = 10;

export enum DisputeChainMismatchKind {
  /** Local row has no on-chain ID but the contract holds a dispute. Corrected. */
  MISSING_CHAIN_ID = 'missing_chain_id',
  /** Local on-chain ID differs from the contract's canonical ID. Corrected. */
  CHAIN_ID_MISMATCH = 'chain_id_mismatch',
  /** Local row claims an on-chain ID but the contract has no dispute. Flagged only. */
  NOT_FOUND_ON_CHAIN = 'not_found_on_chain',
  /** Local and on-chain resolution state disagree. Flagged only. */
  RESOLUTION_MISMATCH = 'resolution_mismatch',
}

export interface DisputeChainMismatch {
  disputeId: string;
  marketId: string;
  onChainMarketId: string;
  kind: DisputeChainMismatchKind;
  localValue: string | null;
  chainValue: string | null;
  corrected: boolean;
}

export interface DisputeChainReconciliationReport {
  marketsChecked: number;
  disputesChecked: number;
  corrected: number;
  failedMarkets: string[];
  mismatches: DisputeChainMismatch[];
  driftDetected: boolean;
  driftSeverity: 'none' | 'warning' | 'critical';
  driftPercentage: number;
  startedAt: string;
  finishedAt: string;
}

/**
 * Reconciles locally stored dispute chain IDs (and resolution state) against
 * the Soroban contract. The contract stores exactly one dispute per market
 * under `DataKey::Dispute(market_id)`, so every tier of a market's local
 * escalation chain maps to the same on-chain record, whose canonical ID is
 * the market's on-chain ID.
 *
 * Only the chain ID is auto-corrected, since it is derived purely from
 * on-chain state. Missing on-chain disputes and resolution disagreements are
 * reported for an admin to act on, never auto-enforced.
 */
@Injectable()
export class DisputeChainReconciliationService {
  private readonly logger = new Logger(DisputeChainReconciliationService.name);
  private isRunning = false;
  private lastReport: DisputeChainReconciliationReport | null = null;

  constructor(
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
    private readonly notificationGenerator: NotificationGeneratorService,
  ) {}

  @Cron('0 30 * * * *')
  async runScheduledReconciliation(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error('Dispute chain reconciliation failed', error);
    }
  }

  /**
   * Runs a full pass over every dispute whose market is on-chain. Returns
   * `null` if a pass is already in progress.
   */
  async reconcile(): Promise<DisputeChainReconciliationReport | null> {
    if (this.isRunning) {
      this.logger.warn(
        'Dispute chain reconciliation skipped: previous run still active',
      );
      return null;
    }

    this.isRunning = true;
    const startedAt = new Date();
    const report: DisputeChainReconciliationReport = {
      marketsChecked: 0,
      disputesChecked: 0,
      corrected: 0,
      failedMarkets: [],
      mismatches: [],
      driftDetected: false,
      driftSeverity: 'none',
      driftPercentage: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
    };

    try {
      const batchSize = this.getBatchSize();
      let offset = 0;

      for (;;) {
        const marketIds = await this.fetchMarketIdBatch(offset, batchSize);
        if (marketIds.length === 0) break;
        offset += marketIds.length;

        const disputes = await this.disputesRepository.find({
          where: { marketId: In(marketIds) },
          order: { tier: 'ASC', createdAt: 'ASC' },
        });

        const byMarket = new Map<string, Dispute[]>();
        for (const dispute of disputes) {
          const group = byMarket.get(dispute.marketId) ?? [];
          group.push(dispute);
          byMarket.set(dispute.marketId, group);
        }

        for (const [marketId, group] of byMarket) {
          await this.reconcileMarket(marketId, group, report);
        }

        if (marketIds.length < batchSize) break;
      }

      // Calculate drift metrics
      this.calculateDriftMetrics(report);

      // Send drift alert if threshold exceeded
      if (report.driftDetected) {
        await this.sendDriftAlert(report);
      }
    } finally {
      report.finishedAt = new Date().toISOString();
      this.lastReport = report;
      this.isRunning = false;
    }

    if (report.mismatches.length > 0 || report.failedMarkets.length > 0) {
      this.logger.warn(
        `Dispute chain reconciliation: ${report.mismatches.length} mismatches ` +
          `(${report.corrected} corrected), ${report.failedMarkets.length} ` +
          `markets unreadable, across ${report.disputesChecked} disputes. ` +
          `Drift: ${report.driftSeverity} (${report.driftPercentage.toFixed(2)}%)`,
      );
    }

    return report;
  }

  getLastReport(): DisputeChainReconciliationReport | null {
    return this.lastReport;
  }

  isEnabled(): boolean {
    const enabled = this.configService.get<string>(
      'DISPUTE_CHAIN_RECONCILE_ENABLED',
    );
    return enabled !== 'false' && enabled !== '0';
  }

  private getBatchSize(): number {
    const size = Number(
      this.configService.get<number>('DISPUTE_CHAIN_RECONCILE_BATCH_SIZE'),
    );
    return Number.isInteger(size) && size > 0
      ? size
      : DEFAULT_RECONCILE_BATCH_SIZE;
  }

  /** Distinct local market IDs that have disputes and an on-chain market. */
  private async fetchMarketIdBatch(
    offset: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.disputesRepository
      .createQueryBuilder('dispute')
      .innerJoin('dispute.market', 'market')
      .select('dispute.market_id', 'market_id')
      .where('market.on_chain_market_id IS NOT NULL')
      .andWhere("market.on_chain_market_id <> ''")
      .groupBy('dispute.market_id')
      .orderBy('dispute.market_id', 'ASC')
      .offset(offset)
      .limit(limit)
      .getRawMany<{ market_id: string }>();

    return rows.map((row) => row.market_id);
  }

  private async reconcileMarket(
    marketId: string,
    disputes: Dispute[],
    report: DisputeChainReconciliationReport,
  ): Promise<void> {
    const onChainMarketId = disputes[0]?.market?.on_chain_market_id;
    if (!onChainMarketId) return;

    let chainDispute: SorobanOnChainDispute | null;
    try {
      chainDispute = await this.sorobanService.getDispute(onChainMarketId);
    } catch (error) {
      // An unreachable chain must never be read as "no dispute on-chain".
      report.failedMarkets.push(marketId);
      this.logger.error(
        `Could not read on-chain dispute for market ${marketId} ` +
          `(on-chain ${onChainMarketId})`,
        error,
      );
      return;
    }

    report.marketsChecked++;
    report.disputesChecked += disputes.length;

    for (const dispute of disputes) {
      await this.reconcileChainId(
        dispute,
        onChainMarketId,
        chainDispute,
        report,
      );
    }

    // The contract's resolution state tracks the latest round, so compare
    // it only against the highest local tier.
    if (chainDispute) {
      const latest = disputes.reduce((a, b) => (b.tier > a.tier ? b : a));
      this.compareResolution(latest, onChainMarketId, chainDispute, report);
    }
  }

  private async reconcileChainId(
    dispute: Dispute,
    onChainMarketId: string,
    chainDispute: SorobanOnChainDispute | null,
    report: DisputeChainReconciliationReport,
  ): Promise<void> {
    const local = dispute.onChainDisputeId;

    if (!chainDispute) {
      if (local) {
        report.mismatches.push({
          disputeId: dispute.id,
          marketId: dispute.marketId,
          onChainMarketId,
          kind: DisputeChainMismatchKind.NOT_FOUND_ON_CHAIN,
          localValue: local,
          chainValue: null,
          corrected: false,
        });
      }
      return;
    }

    const canonical = chainDispute.dispute_id;
    if (local === canonical) return;

    await this.disputesRepository.update(dispute.id, {
      onChainDisputeId: canonical,
    });
    dispute.onChainDisputeId = canonical;
    report.corrected++;
    report.mismatches.push({
      disputeId: dispute.id,
      marketId: dispute.marketId,
      onChainMarketId,
      kind: local
        ? DisputeChainMismatchKind.CHAIN_ID_MISMATCH
        : DisputeChainMismatchKind.MISSING_CHAIN_ID,
      localValue: local,
      chainValue: canonical,
      corrected: true,
    });

    this.logger.log(
      `Dispute ${dispute.id} on-chain ID reconciled: ${local ?? 'null'} -> ${canonical}`,
    );
  }

  private compareResolution(
    dispute: Dispute,
    onChainMarketId: string,
    chainDispute: SorobanOnChainDispute,
    report: DisputeChainReconciliationReport,
  ): void {
    const localResolved = dispute.status === DisputeStatus.RESOLVED;
    const localState = localResolved
      ? `resolved:${dispute.resolution ?? 'unknown'}`
      : `unresolved:${dispute.status}`;

    const chainResolution =
      chainDispute.resolution_upheld === null
        ? 'unknown'
        : chainDispute.resolution_upheld
          ? DisputeResolution.UPHELD
          : DisputeResolution.OVERTURNED;
    const chainState = chainDispute.is_resolved
      ? `resolved:${chainResolution}`
      : 'unresolved';

    const agrees = localResolved
      ? chainDispute.is_resolved && dispute.resolution === chainResolution
      : !chainDispute.is_resolved;
    if (agrees) return;

    report.mismatches.push({
      disputeId: dispute.id,
      marketId: dispute.marketId,
      onChainMarketId,
      kind: DisputeChainMismatchKind.RESOLUTION_MISMATCH,
      localValue: localState,
      chainValue: chainState,
      corrected: false,
    });
  }
}
