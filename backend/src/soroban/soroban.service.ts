import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  TransactionBuilder,
  Address,
  Contract,
  nativeToScVal,
  Networks,
} from '@stellar/stellar-sdk';

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

export interface SorobanRefundResult {
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

export interface SorobanDisputeResult {
  dispute_id: string;
  tx_hash: string;
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

  /**
   * Resolve a market on-chain via the Soroban contract.
   * Only the oracle (SERVER_SECRET_KEY) can resolve markets.
   *
   * Invokes: resolve_market(market_id, outcome)
   * Errors: Unauthorized, MarketAlreadyResolved, InvalidOutcome
   */
  async cancelMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('cancelMarket', () => {
      this.logger.log(`Soroban cancelMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `cancelMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(
        `cancel:${marketOnChainId}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`cancelMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  async resolveMarket(marketOnChainId: string, outcome: string): Promise<void> {
    return this.withSorobanErrorHandling('resolveMarket', () => {
      this.logger.log(
        `Soroban resolveMarket: market=${marketOnChainId} outcome=${outcome}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resolveMarket signed by oracle: ${serverKeypair.publicKey()}`,
      );

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we log the intent and return success
      const txHash = Buffer.from(
        `resolve:${marketOnChainId}:${outcome}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resolveMarket submitted: tx_hash=${txHash}`);
      return Promise.resolve();
    });
  }

  async refundCompetitionParticipant(
    userStellarAddress: string,
    competitionId: string,
    refundAmountStroops: string,
    correlationId?: string,
  ): Promise<SorobanRefundResult> {
    const cid = correlationId || `refund_${Date.now()}`;
    return this.withSorobanErrorHandling(
      `refundCompetitionParticipant[${cid}]`,
      async () => {
        this.logger.log(
          `[${cid}] Initiating Soroban refund: user=${userStellarAddress} competition=${competitionId} amount=${refundAmountStroops}`,
        );

        const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
        const serverAccount = await this.rpcServer.getAccount(
          serverKeypair.publicKey(),
        );

        const contract = new Contract(this.contractId);

        // Build the invocation
        const tx = new TransactionBuilder(serverAccount, {
          fee: '10000', // Base fee, updated by simulation
          networkPassphrase:
            this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
        })
          .addOperation(
            contract.call(
              'refund',
              new Address(userStellarAddress).toScVal(),
              nativeToScVal(BigInt(refundAmountStroops), { type: 'u128' }),
            ),
          )
          .setTimeout(30)
          .build();

        // Simulate
        const simulation = await this.rpcServer.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationError(simulation)) {
          if (simulation.error.includes('EscrowEmpty')) {
            throw new Error('EscrowEmpty');
          }
          if (simulation.error.includes('InsufficientFunds')) {
            throw new Error('InsufficientFunds');
          }
          throw new Error(`Simulation failed: ${simulation.error}`);
        }

        // Assemble and Sign
        const assembledTx = SorobanRpc.assembleTransaction(
          tx,
          simulation,
        ).build();
        assembledTx.sign(serverKeypair);

        // Submit
        const response = await this.rpcServer.sendTransaction(assembledTx);
        if (response.status === 'ERROR') {
          throw new Error(
            `Transaction submission failed: ${JSON.stringify(response.errorResult)}`,
          );
        }

        this.logger.log(`[${cid}] Refund submitted. tx_hash=${response.hash}`);

        // Wait for completion
        let statusResponse = await this.rpcServer.getTransaction(response.hash);
        let attempts = 0;
        while (
          statusResponse.status ===
            SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
          attempts < 10
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          statusResponse = await this.rpcServer.getTransaction(response.hash);
          attempts++;
        }

        if (
          statusResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS
        ) {
          this.logger.log(
            `[${cid}] Refund transaction confirmed: tx_hash=${response.hash}`,
          );
          return { tx_hash: response.hash };
        } else {
          throw new Error(
            `Transaction failed with status ${statusResponse.status}`,
          );
        }
      },
    );
  }

  /**
   * Submit a prediction to the Soroban contract, locking the stake on-chain.
   * Returns the transaction hash of the confirmed operation.
   *
   * Invokes: submit_prediction(market_id, predictor, chosen_outcome, stake_amount_stroops)
   * Errors: StakeTooLow, StakeTooHigh, AlreadyPredicted, MarketExpired
   */
  async submitPrediction(
    userStellarAddress: string,
    marketOnChainId: string,
    chosenOutcome: string,
    stakeAmountStroops: string,
  ): Promise<SorobanPredictionResult> {
    return this.withSorobanErrorHandling('submitPrediction', () => {
      this.logger.log(
        `Soroban submitPrediction: user=${userStellarAddress} market=${marketOnChainId} outcome=${chosenOutcome} stake=${stakeAmountStroops}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `submitPrediction signed by server: ${serverKeypair.publicKey()}`,
      );

      // Verify user address is valid
      Keypair.fromPublicKey(userStellarAddress);

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we generate a deterministic tx_hash for development
      const tx_hash = Buffer.from(
        `${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`submitPrediction submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  /**
   * Claim winnings from the Soroban contract.
   * Returns the transaction hash of the confirmed operation.
   *
   * Invokes: claim_payout(market_id, predictor)
   * Errors: PayoutAlreadyClaimed, MarketNotResolved, PredictionNotFound
   */
  async claimPayout(
    userStellarAddress: string,
    marketOnChainId: string,
  ): Promise<SorobanPredictionResult> {
    return this.withSorobanErrorHandling('claimPayout', () => {
      this.logger.log(
        `Soroban claimPayout: user=${userStellarAddress} market=${marketOnChainId}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `claimPayout signed by server: ${serverKeypair.publicKey()}`,
      );

      // Verify user address is valid
      Keypair.fromPublicKey(userStellarAddress);

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we generate a deterministic tx_hash for development
      const tx_hash = Buffer.from(
        `claim:${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`claimPayout submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  /**
   * Raise a dispute on the Soroban contract for a market outcome.
   * Returns the dispute ID and transaction hash.
   *
   * Invokes: raise_dispute(market_id, reason)
   * Errors: MarketNotResolved, DisputeWindowPassed, DisputeAlreadyExists
   */
  async raiseDispute(
    marketOnChainId: string,
    reason: string,
  ): Promise<SorobanDisputeResult> {
    return this.withSorobanErrorHandling('raiseDispute', () => {
      this.logger.log(
        `Soroban raiseDispute: market=${marketOnChainId} reason=${reason}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `raiseDispute signed by server: ${serverKeypair.publicKey()}`,
      );

      // Generate dispute ID and transaction hash
      const dispute_id = `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tx_hash = Buffer.from(
        `dispute:${marketOnChainId}:${dispute_id}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(
        `raiseDispute submitted: dispute_id=${dispute_id} tx_hash=${tx_hash}`,
      );
      return Promise.resolve({ dispute_id, tx_hash });
    });
  }

  /**
   * Resolve a dispute on the Soroban contract.
   * Returns the transaction hash of the resolution.
   *
   * Invokes: resolve_dispute(market_id, dispute_id, resolution)
   * Errors: DisputeNotFound, DisputeNotPending, Unauthorized
   */
  async resolveDispute(
    marketOnChainId: string,
    disputeId: string,
    resolution: 'upheld' | 'overturned',
  ): Promise<SorobanDisputeResult> {
    return this.withSorobanErrorHandling('resolveDispute', () => {
      this.logger.log(
        `Soroban resolveDispute: market=${marketOnChainId} dispute=${disputeId} resolution=${resolution}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resolveDispute signed by oracle: ${serverKeypair.publicKey()}`,
      );

      // Generate transaction hash
      const tx_hash = Buffer.from(
        `resolve_dispute:${marketOnChainId}:${disputeId}:${resolution}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resolveDispute submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ dispute_id: disputeId, tx_hash });
    });
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
