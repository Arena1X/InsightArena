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
  Transaction,
} from '@stellar/stellar-sdk';
import { withRetry } from '../common/retry.util';

/**
 * Errors we classify as "definitive rejections" — the network/contract has
 * conclusively refused the transaction, so resubmitting would just fail
 * again (or, worse, double-submit). Everything else (network blips, RPC
 * timeouts, 5xx/429 responses) is treated as transient and retried.
 */
const PERMANENT_ERROR_PATTERNS = [
  /EscrowEmpty/,
  /InsufficientFunds/,
  /Simulation failed/,
  /txMalformed/,
  /txBadAuth/,
  /txInsufficientBalance/,
  /txBadSeq/,
];

export function isTransientSorobanError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  if (PERMANENT_ERROR_PATTERNS.some((pattern) => pattern.test(error.message))) {
    return false;
  }

  // Network-layer failures (fetch/TypeError, abort/timeout, errno codes).
  if (error instanceof TypeError) return true;
  if (error.name === 'AbortError') return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    if (
      typeof code === 'string' &&
      [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EPIPE',
        'EHOSTUNREACH',
        'EAI_AGAIN',
      ].includes(code)
    ) {
      return true;
    }
  }

  const httpMatch = /HTTP (\d{3})/.exec(error.message);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    return status === 429 || (status >= 500 && status <= 599);
  }

  // "Transaction submission failed: ..." from a non-definitive RPC error
  // result (e.g. txTooLate, txInternalError) is treated as transient.
  return /Transaction submission failed/.test(error.message);
}

export class SorobanTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SorobanTransientError';
  }
}

export class SorobanPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SorobanPermanentError';
  }
}

export interface SorobanPredictionResult {
  tx_hash: string;
  payout_amount_stroops?: string;
  realized_price?: string;
  shares_received?: string;
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

export interface SorobanFinalizeEventResult {
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

  async getCreationFee(): Promise<string> {
    return this.withSorobanErrorHandling('getCreationFee', () => {
      return Promise.resolve('10000000'); // Default 0.01 XLM
    });
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

      const tx_hash = Buffer.from(`cancel:${marketOnChainId}:${Date.now()}`)
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

        // Submit (retries transient RPC errors with backoff; definitive
        // rejections surface immediately)
        const response = await this.sendTransactionWithRetry(
          assembledTx,
          `refundCompetitionParticipant[${cid}]`,
        );

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

      // Calculate realized price and shares (stub implementation)
      // In production, these values come from the contract execution result
      const stakeAmount = BigInt(stakeAmountStroops);
      const sharesReceived = (stakeAmount * 100n) / 50n; // 2x leverage simulation
      const realizedPrice =
        stakeAmount > 0n ? (stakeAmount * 1000000n) / sharesReceived : 0n;

      this.logger.log(
        `submitPrediction submitted: tx_hash=${tx_hash} realized_price=${realizedPrice.toString()} shares=${sharesReceived.toString()}`,
      );
      return Promise.resolve({
        tx_hash,
        realized_price: realizedPrice.toString(),
        shares_received: sharesReceived.toString(),
      });
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

      // Calculate payout amount (in real implementation, this would come from contract)
      // For stub: simulate a 1.5x return on stake
      const payout_amount_stroops = '15000000'; // 1.5 XLM in stroops

      this.logger.log(
        `claimPayout submitted: tx_hash=${tx_hash} payout=${payout_amount_stroops}`,
      );
      return Promise.resolve({ tx_hash, payout_amount_stroops });
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

  /**
   * Finalize an event on the Soroban contract.
   * Permissionless operation that can be called once event.has_ended() is true
   * and all matches have results.
   *
   * Invokes: finalize_event(event_id)
   * Errors: EventNotEnded, MatchesNotResolved, EventAlreadyFinalized
   */
  async finalizeEvent(
    onChainEventId: number,
  ): Promise<SorobanFinalizeEventResult> {
    return this.withSorobanErrorHandling('finalizeEvent', async () => {
      this.logger.log(`Soroban finalizeEvent: event_id=${onChainEventId}`);

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `finalizeEvent signed by server: ${serverKeypair.publicKey()}`,
      );

      // Get server account for transaction
      const serverAccount = await this.rpcServer.getAccount(
        serverKeypair.publicKey(),
      );

      const contract = new Contract(this.contractId);

      // Build the invocation
      const tx = new TransactionBuilder(serverAccount, {
        fee: '10000',
        networkPassphrase:
          this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
      })
        .addOperation(
          contract.call(
            'finalize_event',
            nativeToScVal(BigInt(onChainEventId), { type: 'u64' }),
          ),
        )
        .setTimeout(30)
        .build();

      // Simulate
      const simulation = await this.rpcServer.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Assemble and Sign
      const assembledTx = SorobanRpc.assembleTransaction(
        tx,
        simulation,
      ).build();
      assembledTx.sign(serverKeypair);

      // Submit (retries transient RPC errors with backoff; definitive
      // rejections surface immediately)
      const response = await this.sendTransactionWithRetry(
        assembledTx,
        'finalizeEvent',
      );

      this.logger.log(`finalizeEvent submitted: tx_hash=${response.hash}`);

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
          `finalizeEvent transaction confirmed: tx_hash=${response.hash}`,
        );
        return { tx_hash: response.hash };
      } else {
        throw new Error(
          `Transaction failed with status ${statusResponse.status}`,
        );
      }
    });
  }

  async pauseMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('pauseMarket', () => {
      this.logger.log(`Soroban pauseMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `pauseMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(`pause:${marketOnChainId}:${Date.now()}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`pauseMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  async resumeMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('resumeMarket', () => {
      this.logger.log(`Soroban resumeMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resumeMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(`resume:${marketOnChainId}:${Date.now()}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resumeMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
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

  /**
   * Submits an already-assembled and signed transaction, retrying on
   * transient RPC errors (network blips, timeouts, 5xx/429) with backoff.
   * Definitive rejections (bad auth, malformed tx, insufficient balance,
   * simulation failure) are surfaced immediately without retrying, since
   * retrying those would just fail again — or double-submit.
   */
  private async sendTransactionWithRetry(
    tx: Transaction,
    operation: string,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    return withRetry(
      async () => {
        const response = await this.rpcServer.sendTransaction(tx);
        if (response.status === 'ERROR') {
          const message = `Transaction submission failed: ${JSON.stringify(response.errorResult)}`;
          throw isTransientSorobanError(new Error(message))
            ? new SorobanTransientError(message)
            : new SorobanPermanentError(message);
        }
        return response;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        isTransient: isTransientSorobanError,
        onRetry: (error, attempt, delayMs) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `${operation}: sendTransaction attempt ${attempt + 1} failed transiently (${message}), retrying in ${delayMs}ms`,
          );
        },
      },
    );
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
