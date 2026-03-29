import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';

export interface SorobanPredictionResult {
  tx_hash: string;
}

export interface SorobanCreateMarketResult {
  market_id: string;
  tx_hash: string;
}

export interface SorobanCreateSeasonResult {
  on_chain_season_id: number;
  tx_hash: string;
}

export interface SorobanRpcEvent {
  id: string;
  ledger: number;
  topic: string[];
  value: Record<string, unknown>;
}

export interface SorobanEventsResponse {
  events: SorobanRpcEvent[];
  latestLedger: number;
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly contractId: string;
  private readonly network: string;
  private readonly serverSecretKey: string;
  private readonly rpcUrl: string;
  private readonly rpcServer: SorobanRpc.Server;

  constructor(private readonly configService: ConfigService) {
    this.contractId =
      this.configService.get<string>('SOROBAN_CONTRACT_ID') ?? '';
    this.network = this.configService.get<string>('STELLAR_NETWORK') ?? '';
    this.serverSecretKey =
      this.configService.get<string>('SERVER_SECRET_KEY') ?? '';
    this.rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';

    this.rpcServer = new SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
    });

    if (!this.contractId || !this.network || !this.serverSecretKey) {
      this.logger.warn(
        'SorobanService initialized with missing config values (SOROBAN_CONTRACT_ID/STELLAR_NETWORK/SERVER_SECRET_KEY)',
      );
    }
  }

  getRpcClient(): SorobanRpc.Server {
    return this.rpcServer;
  }

  async testConnection(): Promise<boolean> {
    return this.withSorobanErrorHandling('testConnection', async () => {
      await this.rpcServer.getHealth();
      return true;
    });
  }

  async createMarket(
    title: string,
    description: string,
    category: string,
    outcomeOptions: string[],
    endTime: string,
    resolutionTime: string,
  ): Promise<SorobanCreateMarketResult> {
    return this.withSorobanErrorHandling('createMarket', () => {
      this.logger.log(
        `Soroban createMarket: title=${title} category=${category} outcomes=${outcomeOptions.length} end=${endTime} resolve=${resolutionTime}`,
      );

      const market_id = `market_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tx_hash = Buffer.from(`${market_id}:${description}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      return Promise.resolve({ market_id, tx_hash });
    });
  }

  /**
   * Create a season on the Soroban contract (admin flow).
   * Stub implementation until real contract invocations are wired via stellar-sdk.
   */
  async createSeason(
    startTimeUnix: number,
    endTimeUnix: number,
    rewardPoolStroops: string,
  ): Promise<SorobanCreateSeasonResult> {
    return this.withSorobanErrorHandling('createSeason', () => {
      this.logger.log(
        `Soroban createSeason: start=${startTimeUnix} end=${endTimeUnix} pool=${rewardPoolStroops}`,
      );
      const mix =
        (BigInt(startTimeUnix) ^ BigInt(endTimeUnix)) & BigInt(0x7fffffff);
      const on_chain_season_id = mix === 0n ? 1 : Number(mix);
      const tx_hash = Buffer.from(
        `season:${startTimeUnix}:${endTimeUnix}:${rewardPoolStroops}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);
      return Promise.resolve({ on_chain_season_id, tx_hash });
    });
  }

  async resolveMarket(marketOnChainId: string, outcome: string): Promise<void> {
    return this.withSorobanErrorHandling('resolveMarket', () => {
      this.logger.log(
        `Soroban resolveMarket: market=${marketOnChainId} outcome=${outcome}`,
      );
      return Promise.resolve();
    });
  }

  /**
   * Submit a prediction to the Soroban contract, locking the stake on-chain.
   * Returns the transaction hash of the confirmed operation.
   *
   * TODO: Replace stub with real Soroban contract invocation via stellar-sdk.
   */
  submitPrediction(
    userStellarAddress: string,
    marketOnChainId: string,
    chosenOutcome: string,
    stakeAmountStroops: string,
  ): Promise<SorobanPredictionResult> {
    return this.withSorobanErrorHandling('submitPrediction', () => {
      this.logger.log(
        `Soroban submitPrediction: user=${userStellarAddress} market=${marketOnChainId} outcome=${chosenOutcome} stake=${stakeAmountStroops}`,
      );
      // Stub: return a deterministic-looking hash for development/testing.
      const stub = Buffer.from(
        `${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);
      return Promise.resolve({ tx_hash: stub });
    });
  }

  /**
   * Claim winnings from the Soroban contract.
   * Returns the transaction hash of the confirmed operation.
   *
   * TODO: Replace stub with real Soroban contract invocation.
   */
  claimPayout(
    userStellarAddress: string,
    marketOnChainId: string,
  ): Promise<SorobanPredictionResult> {
    this.logger.log(
      `Soroban claimPayout: user=${userStellarAddress} market=${marketOnChainId}`,
    );
    // Stub: return a deterministic-looking hash.
    const stub = Buffer.from(
      `claim:${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
    )
      .toString('hex')
      .padEnd(64, '0')
      .slice(0, 64);
    return Promise.resolve({ tx_hash: stub });
  }

  async getEvents(fromLedger: number): Promise<SorobanEventsResponse> {
    return this.withSorobanErrorHandling('getEvents', async () => {
      if (!this.rpcUrl || !this.contractId) {
        this.logger.warn(
          'SOROBAN_RPC_URL or SOROBAN_CONTRACT_ID is not configured; skipping event poll',
        );
        return { events: [], latestLedger: fromLedger };
      }

      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-events',
          method: 'getEvents',
          params: {
            startLedger: fromLedger,
            filters: [{ type: 'contract', contractIds: [this.contractId] }],
            limit: 200,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Soroban RPC error: HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        error?: { message?: string };
        result?: { events?: unknown[]; latestLedger?: number };
      };

      if (body.error) {
        throw new Error(body.error.message ?? 'Unknown Soroban RPC error');
      }

      const rawEvents = body.result?.events ?? [];
      const latestLedger =
        typeof body.result?.latestLedger === 'number'
          ? body.result.latestLedger
          : fromLedger;

      const events: SorobanRpcEvent[] = rawEvents
        .map((event) => this.normalizeEvent(event))
        .filter((event): event is SorobanRpcEvent => event !== null);

      return { events, latestLedger };
    });
  }

  private async withSorobanErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Soroban error';
      this.logger.error(`Soroban ${operation} failed: ${message}`);
      throw error;
    }
  }

  private normalizeEvent(rawEvent: unknown): SorobanRpcEvent | null {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return null;
    }

    const eventRecord = rawEvent as Record<string, unknown>;
    const id =
      typeof eventRecord.id === 'string'
        ? eventRecord.id
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    const ledger = this.toNumber(eventRecord.ledger);
    if (ledger === null) {
      return null;
    }

    const topic = this.toStringArray(eventRecord.topic ?? eventRecord.topics);
    const value = this.toRecord(eventRecord.value ?? eventRecord.data);

    if (!value) {
      return null;
    }

    return { id, ledger, topic, value };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (typeof obj.symbol === 'string') {
            return obj.symbol;
          }
          if (typeof obj.value === 'string') {
            return obj.value;
          }
        }
        return null;
      })
      .filter((item): item is string => item !== null);
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }
}
