/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc as SorobanRpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

export interface SorobanPredictionResult {
  tx_hash: string;
}

export interface SorobanCreateMarketResult {
  on_chain_market_id: string;
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
    creator: string,
    creatorFeeBps = 0,
    minStakeStroops = '0',
    maxStakeStroops = '0',
    isPublic = true,
  ): Promise<SorobanCreateMarketResult> {
    return this.withSorobanErrorHandling('createMarket', async () => {
      this.logger.log(
        `Soroban createMarket: title=${title} category=${category} outcomes=${outcomeOptions.length} end=${endTime} resolve=${resolutionTime} creator=${creator}`,
      );

      const end = new Date(endTime);
      const resolution = new Date(resolutionTime);
      if (Number.isNaN(end.getTime()) || Number.isNaN(resolution.getTime())) {
        throw new BadRequestException('Invalid end_time or resolution_time');
      }

      const params = this.buildCreateMarketParamsScVal({
        title,
        description,
        category,
        outcomeOptions,
        endTimeUnix: Math.floor(end.getTime() / 1000),
        resolutionTimeUnix: Math.floor(resolution.getTime() / 1000),
        disputeWindowSeconds: 24 * 60 * 60,
        creatorFeeBps,
        minStakeStroops,
        maxStakeStroops,
        isPublic,
      });

      const creatorAddr = Address.fromString(creator);
      const { txHash, returnValue } = await this.invokeContract(
        'create_market',
        [creatorAddr.toScVal(), params],
      );

      const native = this.scValToNativeSafe(returnValue);
      const on_chain_market_id = this.toStringId(native);

      return { on_chain_market_id, tx_hash: txHash };
    });
  }

  /**
   * Create a season on the Soroban contract (admin flow).
   */
  async createSeason(
    seasonNumber: number,
    startTimeUnix: number,
    endTimeUnix: number,
    rewardPoolStroops: string,
  ): Promise<SorobanCreateSeasonResult> {
    return this.withSorobanErrorHandling('createSeason', async () => {
      this.logger.log(
        `Soroban createSeason: season=${seasonNumber} start=${startTimeUnix} end=${endTimeUnix} pool=${rewardPoolStroops}`,
      );

      const start = Number(startTimeUnix);
      const end = Number(endTimeUnix);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new BadRequestException('Invalid start_time or end_time');
      }

      const active = await this.getActiveSeasonIfAny();
      if (active) {
        const activeStart = this.toNumber(
          active.start_time ?? active.startTime,
        );
        const activeEnd = this.toNumber(active.end_time ?? active.endTime);
        if (
          activeStart !== null &&
          activeEnd !== null &&
          this.rangesOverlap(activeStart, activeEnd, startTimeUnix, endTimeUnix)
        ) {
          throw new ConflictException('SeasonAlreadyActive');
        }
      }

      const keypair = this.getServerKeypair();
      const adminAddr = Address.fromString(keypair.publicKey());

      const { txHash, returnValue } = await this.invokeContract(
        'create_season',
        [
          adminAddr.toScVal(),
          nativeToScVal(BigInt(startTimeUnix), { type: 'u64' }),
          nativeToScVal(BigInt(endTimeUnix), { type: 'u64' }),
          nativeToScVal(BigInt(rewardPoolStroops), { type: 'i128' }),
        ],
        keypair,
      );

      const native = this.scValToNativeSafe(returnValue);
      const on_chain_season_id = Number(this.toNumber(native) ?? 0);
      if (!Number.isFinite(on_chain_season_id) || on_chain_season_id <= 0) {
        throw new Error('Failed to parse on-chain season id');
      }

      return { on_chain_season_id, tx_hash: txHash };
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

  async refundCompetitionParticipant(
    userStellarAddress: string,
    competitionId: string,
    refundAmountStroops: string,
  ): Promise<SorobanRefundResult> {
    return this.withSorobanErrorHandling('refundCompetitionParticipant', () => {
      this.logger.log(
        `Soroban refundCompetitionParticipant: user=${userStellarAddress} competition=${competitionId} amount=${refundAmountStroops}`,
      );

      const tx_hash = Buffer.from(
        `refund:${competitionId}:${userStellarAddress}:${refundAmountStroops}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      return Promise.resolve({ tx_hash });
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
      this.rethrowContractErrorAsHttp(operation, error);
      const message =
        error instanceof Error ? error.message : 'Unknown Soroban error';
      this.logger.error(`Soroban ${operation} failed: ${message}`);
      throw error;
    }
  }

  private getNetworkPassphrase(): string {
    const val = (this.network ?? '').toLowerCase().trim();
    if (val === 'testnet') return Networks.TESTNET;
    if (val === 'mainnet' || val === 'public') return Networks.PUBLIC;
    return this.network;
  }

  private getServerKeypair(): Keypair {
    if (!this.serverSecretKey) {
      throw new Error('SERVER_SECRET_KEY is not configured');
    }
    return Keypair.fromSecret(this.serverSecretKey);
  }

  private async getActiveSeasonIfAny(): Promise<Record<
    string,
    unknown
  > | null> {
    if (!this.contractId) {
      return null;
    }

    const { returnValue } = await this.simulateContract(
      'get_active_season',
      [],
    );
    const native = this.scValToNativeSafe(returnValue);

    if (native instanceof Map) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of native.entries()) {
        obj[String(k)] = v;
      }
      return obj;
    }

    if (!native || typeof native !== 'object') {
      return null;
    }
    return native as Record<string, unknown>;
  }

  private rangesOverlap(
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
  ): boolean {
    return aStart < bEnd && aEnd > bStart;
  }

  private buildCreateMarketParamsScVal(input: {
    title: string;
    description: string;
    category: string;
    outcomeOptions: string[];
    endTimeUnix: number;
    resolutionTimeUnix: number;
    disputeWindowSeconds: number;
    creatorFeeBps: number;
    minStakeStroops: string;
    maxStakeStroops: string;
    isPublic: boolean;
  }): xdr.ScVal {
    const outcomes = xdr.ScVal.scvVec(
      input.outcomeOptions.map((o) =>
        nativeToScVal(String(o), { type: 'symbol' }),
      ),
    );

    const entries: xdr.ScMapEntry[] = [
      new xdr.ScMapEntry({
        key: nativeToScVal('title', { type: 'symbol' }),
        val: nativeToScVal(input.title, { type: 'string' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('description', { type: 'symbol' }),
        val: nativeToScVal(input.description, { type: 'string' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('category', { type: 'symbol' }),
        val: nativeToScVal(input.category, { type: 'symbol' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('outcomes', { type: 'symbol' }),
        val: outcomes,
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('end_time', { type: 'symbol' }),
        val: nativeToScVal(BigInt(input.endTimeUnix), { type: 'u64' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('resolution_time', { type: 'symbol' }),
        val: nativeToScVal(BigInt(input.resolutionTimeUnix), { type: 'u64' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('dispute_window', { type: 'symbol' }),
        val: nativeToScVal(BigInt(input.disputeWindowSeconds), { type: 'u64' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('creator_fee_bps', { type: 'symbol' }),
        val: nativeToScVal(input.creatorFeeBps, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('min_stake', { type: 'symbol' }),
        val: nativeToScVal(BigInt(input.minStakeStroops), { type: 'i128' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('max_stake', { type: 'symbol' }),
        val: nativeToScVal(BigInt(input.maxStakeStroops), { type: 'i128' }),
      }),
      new xdr.ScMapEntry({
        key: nativeToScVal('is_public', { type: 'symbol' }),
        val: nativeToScVal(input.isPublic, { type: 'bool' }),
      }),
    ];

    return xdr.ScVal.scvMap(entries);
  }

  private async simulateContract(
    method: string,
    args: xdr.ScVal[],
    keypair?: Keypair,
  ): Promise<{ returnValue: xdr.ScVal }> {
    const kp = keypair ?? this.getServerKeypair();
    const tx = await this.buildContractTx(kp, method, args);
    const simulation = await (this.rpcServer as any).simulateTransaction(tx);

    if (simulation?.error) {
      throw new Error(
        typeof simulation.error === 'string'
          ? simulation.error
          : JSON.stringify(simulation.error),
      );
    }

    const returnValue: xdr.ScVal | undefined =
      simulation?.result?.retval ?? simulation?.retval;
    if (!returnValue) {
      throw new Error('Soroban simulation missing return value');
    }

    return { returnValue };
  }

  private async invokeContract(
    method: string,
    args: xdr.ScVal[],
    keypair?: Keypair,
  ): Promise<{ txHash: string; returnValue: xdr.ScVal }> {
    const kp = keypair ?? this.getServerKeypair();
    const tx = await this.buildContractTx(kp, method, args);
    const simulation = await (this.rpcServer as any).simulateTransaction(tx);

    if (simulation?.error) {
      throw new Error(
        typeof simulation.error === 'string'
          ? simulation.error
          : JSON.stringify(simulation.error),
      );
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simulation);
    const assembledTx =
      typeof (assembled as any).build === 'function'
        ? (assembled as any).build()
        : assembled;
    assembledTx.sign(kp);

    const send = (await (this.rpcServer as any).sendTransaction(assembledTx)) as {
      hash?: string;
      status?: string;
    };

    const txHash = send.hash ?? '';
    if (!txHash) {
      throw new Error('Soroban RPC sendTransaction did not return tx hash');
    }

    const finalTx = await this.pollForTransaction(txHash);
    const returnValue =
      this.tryExtractReturnValue(finalTx) ??
      simulation?.result?.retval ??
      simulation?.retval;

    if (!returnValue) {
      throw new Error('Soroban transaction missing return value');
    }

    return { txHash, returnValue };
  }

  private async buildContractTx(
    keypair: Keypair,
    method: string,
    args: xdr.ScVal[],
  ): Promise<any> {
    if (!this.contractId) {
      throw new Error('SOROBAN_CONTRACT_ID is not configured');
    }

    const account = await (this.rpcServer as any).getAccount(
      keypair.publicKey(),
    );

    const source =
      account instanceof Account
        ? account
        : new Account(
            account.accountId ?? keypair.publicKey(),
            account.sequence,
          );

    const contract = new Contract(this.contractId);
    const op = contract.call(method, ...(args ?? []));

    return new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.getNetworkPassphrase(),
    })
      .addOperation(op)
      .setTimeout(30)
      .build();
  }

  private async pollForTransaction(txHash: string): Promise<any> {
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await (this.rpcServer as any).getTransaction(txHash);
      const status = String(res?.status ?? '').toUpperCase();
      if (status === 'SUCCESS') return res;
      if (status === 'FAILED') {
        throw new Error(res?.resultXdr ?? 'Soroban transaction failed');
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    throw new Error('Soroban transaction timed out');
  }

  private tryExtractReturnValue(txResponse: any): xdr.ScVal | null {
    const rv = txResponse?.returnValue ?? txResponse?.result?.returnValue;
    if (!rv) return null;
    if (rv instanceof xdr.ScVal) return rv;
    if (typeof rv === 'string') {
      try {
        return xdr.ScVal.fromXDR(rv, 'base64');
      } catch {
        return null;
      }
    }
    return null;
  }

  private scValToNativeSafe(val: xdr.ScVal): unknown {
    try {
      return scValToNative(val);
    } catch {
      return null;
    }
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') {
      const asNum = Number(value);
      return Number.isFinite(asNum) ? asNum : null;
    }
    if (typeof value === 'string') {
      const asNum = Number(value);
      return Number.isFinite(asNum) ? asNum : null;
    }
    return null;
  }

  private toStringId(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    if (typeof value === 'bigint') return value.toString();
    return '';
  }

  private extractContractErrorCode(error: unknown): number | null {
    const msg =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : '';

    // Common patterns: "Error(Contract, #17)", "ContractError(17)"
    const match =
      msg.match(/Contract[^0-9#]*#?(\d{1,4})/) ?? msg.match(/\b#(\d{1,4})\b/);
    if (!match) return null;
    const code = Number(match[1]);
    return Number.isFinite(code) ? code : null;
  }

  private rethrowContractErrorAsHttp(operation: string, error: unknown): void {
    const code = this.extractContractErrorCode(error);
    if (code === null) return;

    // Contract error codes (see contract/src/errors.rs)
    if (code === 17 || code === 18 || code === 102) {
      throw new BadRequestException(`${operation} rejected by contract`, {
        cause: error as any,
      });
    }

    if (code === 101) {
      throw new ServiceUnavailableException('Contract is paused', {
        cause: error as any,
      });
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
