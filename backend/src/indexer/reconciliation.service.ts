import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ChainSyncCheckpoint } from './entities/chain-sync-checkpoint.entity';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { ReorgEvent } from './entities/reorg-event.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { CHECKPOINT_LEDGER_KEY } from './indexer.service';

const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;
const DEFAULT_RECONCILE_WINDOW = 200;
const BACKFILL_BATCH_SIZE = 100;
const DEFAULT_REORG_ROLLBACK_DEPTH = 10;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastBackfillCount = 0;

  constructor(
    private readonly configService: ConfigService,

    @InjectRepository(ChainSyncCheckpoint)
    private readonly checkpointRepository: Repository<ChainSyncCheckpoint>,

    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,

    @InjectRepository(ReorgEvent)
    private readonly reorgEventRepository: Repository<ReorgEvent>,

    @InjectRepository(IndexerCheckpoint)
    private readonly indexerCheckpointRepository: Repository<IndexerCheckpoint>,
  ) {}

  @Cron('*/60 * * * * *')
  async reconcile(): Promise<void> {
    if (!this.isEnabled()) return;

    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');
    if (!contractId || contractId === 'your-contract-id-here') return;

    if (this.isRunning) {
      this.logger.warn('Reconciliation skipped: previous run still active');
      return;
    }

    this.isRunning = true;
    try {
      await this.runReconciliation(contractId);
    } catch (error) {
      this.logger.error('Reconciliation failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async runReconciliation(contractId: string): Promise<void> {
    const checkpoint = await this.getOrCreateCheckpoint(contractId);

    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL');
    if (!rpcUrl) {
      this.logger.warn(
        'SOROBAN_RPC_URL not configured; skipping reconciliation',
      );
      return;
    }

    await this.detectAndHandleReorg(contractId, checkpoint, rpcUrl);

    const chainHead = await this.fetchChainHead(rpcUrl, contractId);
    if (chainHead === null) return;

    checkpoint.chain_head_ledger = chainHead;

    const lastIndexed = Number(checkpoint.last_indexed_ledger);
    if (lastIndexed >= chainHead) {
      checkpoint.last_indexed_ledger_hash =
        (await this.fetchLedgerHash(rpcUrl, lastIndexed)) ??
        checkpoint.last_indexed_ledger_hash;
      await this.checkpointRepository.save(checkpoint);
      this.lastRunAt = new Date();
      return;
    }

    const window = this.getReconcileWindow();
    const fromLedger = Math.max(lastIndexed + 1, 1);
    const toLedger = Math.min(fromLedger + window - 1, chainHead);

    const backfilledCount = await this.backfillGap(
      rpcUrl,
      contractId,
      fromLedger,
      toLedger,
    );

    checkpoint.last_reconciled_from = fromLedger;
    checkpoint.last_reconciled_to = toLedger;
    checkpoint.last_reconciled_at = new Date();
    checkpoint.last_backfill_count = backfilledCount;

    if (backfilledCount >= 0) {
      checkpoint.last_indexed_ledger = toLedger;
    }

    checkpoint.last_indexed_ledger_hash =
      (await this.fetchLedgerHash(rpcUrl, checkpoint.last_indexed_ledger)) ??
      checkpoint.last_indexed_ledger_hash;

    await this.checkpointRepository.save(checkpoint);
    this.lastRunAt = new Date();
    this.lastBackfillCount = backfilledCount;

    if (backfilledCount > 0) {
      this.logger.log(
        `Reconciliation backfilled ${backfilledCount} events (ledgers ${fromLedger}–${toLedger})`,
      );
    }
  }

  private async backfillGap(
    rpcUrl: string,
    contractId: string,
    fromLedger: number,
    toLedger: number,
  ): Promise<number> {
    let backfilled = 0;

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-reconciliation',
          method: 'getEvents',
          params: {
            startLedger: fromLedger,
            filters: [{ type: 'contract', contractIds: [contractId] }],
            xdrFormat: 'json',
            limit: BACKFILL_BATCH_SIZE,
          },
        }),
      });

      if (!response.ok) {
        this.logger.error(`Reconciliation RPC error: HTTP ${response.status}`);
        return 0;
      }

      const body = (await response.json()) as {
        error?: { message?: string };
        result?: { events?: unknown[]; latestLedger?: number };
      };

      if (body.error) {
        this.logger.error(
          `Reconciliation RPC error: ${body.error.message ?? 'Unknown'}`,
        );
        return 0;
      }

      const rawEvents = body.result?.events ?? [];

      for (const raw of rawEvents) {
        if (!raw || typeof raw !== 'object') continue;
        const record = raw as Record<string, unknown>;
        const ledger = typeof record.ledger === 'number' ? record.ledger : null;
        if (ledger === null || ledger > toLedger) continue;

        const logIndex =
          typeof record.log_index === 'number' ? record.log_index : 0;

        const existing = await this.contractEventRepository.findOne({
          where: { ledger, log_index: logIndex },
        });

        if (existing) continue;

        const eventType = this.extractEventType(record);
        const txHash =
          typeof record.tx_hash === 'string' ? record.tx_hash : null;
        const data =
          record.value && typeof record.value === 'object'
            ? (record.value as Record<string, unknown>)
            : ((record.data as Record<string, unknown>) ?? {});

        const contractEvent = this.contractEventRepository.create({
          ledger,
          log_index: logIndex,
          event_type: eventType || 'unknown',
          data,
          tx_hash: txHash,
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        });

        await this.contractEventRepository.save(contractEvent);
        backfilled++;
      }
    } catch (error) {
      this.logger.error('Backfill fetch failed', error);
    }

    return backfilled;
  }

  private extractEventType(record: Record<string, unknown>): string | null {
    if (typeof record.type === 'string') return record.type;

    const value = record.value as Record<string, unknown> | undefined;
    if (value && typeof value.event === 'string') return value.event;
    if (value && typeof value.event_type === 'string') return value.event_type;

    return null;
  }

  private async fetchChainHead(
    rpcUrl: string,
    contractId: string,
  ): Promise<number | null> {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-reconciliation-head',
          method: 'getEvents',
          params: {
            startLedger: 1,
            filters: [{ type: 'contract', contractIds: [contractId] }],
            limit: 1,
          },
        }),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as {
        result?: { latestLedger?: number };
      };

      return typeof body.result?.latestLedger === 'number'
        ? body.result.latestLedger
        : null;
    } catch {
      this.logger.error('Failed to fetch chain head');
      return null;
    }
  }

  private async fetchLedgerHash(
    rpcUrl: string,
    ledger: number,
  ): Promise<string | null> {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-reconciliation-ledger-hash',
          method: 'getLedgers',
          params: {
            startLedger: ledger,
            limit: 1,
          },
        }),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as {
        result?: { ledgers?: unknown[] };
      };

      const ledgers = body.result?.ledgers;
      if (!Array.isArray(ledgers) || ledgers.length === 0) return null;

      const first = ledgers[0];
      if (!first || typeof first !== 'object') return null;

      const hash = (first as Record<string, unknown>).hash;
      return typeof hash === 'string' ? hash : null;
    } catch {
      this.logger.error('Failed to fetch ledger hash');
      return null;
    }
  }

  /**
   * Detects a chain reorg by comparing the hash we have stored for our last
   * indexed ledger against what the chain currently reports for that same
   * ledger number. If they diverge, rolls back the indexed event log and
   * both checkpoint systems to a fork point (last_indexed_ledger minus a
   * configurable rollback depth) so the next poll/reconciliation cycle
   * re-fetches and re-processes that range from the canonical chain.
   *
   * Known limitation: this corrects derived state only when the canonical
   * branch produces different on-chain IDs for re-indexed events (the case
   * for idempotent-by-on-chain-id handlers). If a reorg replays the exact
   * same on-chain ID with different content, derived rows are not corrected
   * here — that is out of scope for this pass.
   */
  private async detectAndHandleReorg(
    contractId: string,
    checkpoint: ChainSyncCheckpoint,
    rpcUrl: string,
  ): Promise<ReorgEvent | null> {
    const previousLedger = Number(checkpoint.last_indexed_ledger);
    if (previousLedger <= 0 || !checkpoint.last_indexed_ledger_hash) {
      return null;
    }

    const currentHash = await this.fetchLedgerHash(rpcUrl, previousLedger);
    if (currentHash === null) return null;

    if (currentHash === checkpoint.last_indexed_ledger_hash) return null;

    const rollbackDepth =
      this.configService.get<number>('INDEXER_REORG_ROLLBACK_DEPTH') ??
      DEFAULT_REORG_ROLLBACK_DEPTH;
    const forkLedger = Math.max(0, previousLedger - rollbackDepth);

    const deleteResult = await this.contractEventRepository.delete({
      ledger: MoreThan(forkLedger),
    });
    const rolledBackEventCount = deleteResult.affected ?? 0;

    const previousHash = checkpoint.last_indexed_ledger_hash;

    checkpoint.last_indexed_ledger = forkLedger;
    checkpoint.last_indexed_ledger_hash =
      (await this.fetchLedgerHash(rpcUrl, forkLedger)) ?? null;
    await this.checkpointRepository.save(checkpoint);

    await this.indexerCheckpointRepository.update(
      { key: CHECKPOINT_LEDGER_KEY },
      { value: forkLedger },
    );

    const reorgEvent = this.reorgEventRepository.create({
      contract_id: contractId,
      fork_ledger: forkLedger,
      previous_ledger: previousLedger,
      previous_hash: previousHash,
      new_hash: currentHash,
      rolled_back_event_count: rolledBackEventCount,
    });
    const saved = await this.reorgEventRepository.save(reorgEvent);

    this.logger.error(
      `Chain reorg detected for contract ${contractId}: rolled back from ledger ${previousLedger} to ${forkLedger}, ${rolledBackEventCount} events removed`,
    );

    return saved;
  }

  async getReorgEvents(contractId?: string, limit = 50): Promise<ReorgEvent[]> {
    return this.reorgEventRepository.find({
      where: contractId ? { contract_id: contractId } : {},
      order: { detected_at: 'DESC' },
      take: limit,
    });
  }

  private async getOrCreateCheckpoint(
    contractId: string,
  ): Promise<ChainSyncCheckpoint> {
    let checkpoint = await this.checkpointRepository.findOne({
      where: { contract_id: contractId },
    });

    if (!checkpoint) {
      checkpoint = this.checkpointRepository.create({
        contract_id: contractId,
        last_indexed_ledger: 0,
        chain_head_ledger: 0,
        last_reconciled_from: 0,
        last_reconciled_to: 0,
        last_reconciled_at: null,
        last_backfill_count: 0,
      });
      await this.checkpointRepository.save(checkpoint);
    }

    return checkpoint;
  }

  async advanceCheckpoint(contractId: string, ledger: number): Promise<void> {
    const checkpoint = await this.getOrCreateCheckpoint(contractId);
    if (ledger > Number(checkpoint.last_indexed_ledger)) {
      checkpoint.last_indexed_ledger = ledger;
      await this.checkpointRepository.save(checkpoint);
    }
  }

  isEnabled(): boolean {
    const enabled = this.configService.get<string>('RECONCILE_ENABLED');
    return enabled !== 'false' && enabled !== '0';
  }

  getReconcileWindow(): number {
    const window = this.configService.get<number>('RECONCILE_WINDOW');
    return window && window > 0 ? window : DEFAULT_RECONCILE_WINDOW;
  }

  getReconcileIntervalMs(): number {
    const interval = this.configService.get<number>('RECONCILE_INTERVAL_MS');
    return interval && interval > 0 ? interval : DEFAULT_RECONCILE_INTERVAL_MS;
  }

  getStatus(): {
    enabled: boolean;
    is_running: boolean;
    last_run_at: string | null;
    last_backfill_count: number;
  } {
    return {
      enabled: this.isEnabled(),
      is_running: this.isRunning,
      last_run_at: this.lastRunAt?.toISOString() ?? null,
      last_backfill_count: this.lastBackfillCount,
    };
  }

  async getCheckpointForContract(
    contractId: string,
  ): Promise<ChainSyncCheckpoint | null> {
    return this.checkpointRepository.findOne({
      where: { contract_id: contractId },
    });
  }
}
