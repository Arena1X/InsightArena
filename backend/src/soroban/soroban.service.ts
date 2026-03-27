import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateMarketParams {
  title: string;
  description: string;
  endTime: number;
  feeStroops: string;
}

export interface SubmitPredictionParams {
  userAddress: string;
  marketId: string;
  outcome: string;
  amount: string;
}

export interface ResolveMarketParams {
  marketId: string;
  outcome: string;
}

export interface ClaimPayoutParams {
  marketId: string;
  predictorAddress: string;
}

export interface CancelMarketParams {
  marketId: string;
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
  private readonly rpcServer: StellarSdk.rpc.Server;
  private readonly contractId: string;
  private readonly serverKeypair: StellarSdk.Keypair;
  private readonly networkPassphrase: string;

  constructor(private configService: ConfigService) {
    const networkUrl =
      this.configService.get<string>('STELLAR_NETWORK') === 'mainnet'
        ? 'https://soroban-rpc.stellar.org'
        : 'https://soroban-testnet.stellar.org';

    this.networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK') === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET;

    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL') || networkUrl;
    this.rpcServer = new StellarSdk.rpc.Server(rpcUrl);
    
    this.contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID') || '';
    const secret = this.configService.get<string>('SERVER_SECRET_KEY');
    
    // In scenarios where it's not set (like tests), keep it undefined.
    if (secret) {
      this.serverKeypair = StellarSdk.Keypair.fromSecret(secret);
    } else {
      // Mock keypair if missing (only for build to succeed without crashing instantly)
      this.serverKeypair = StellarSdk.Keypair.random();
    }
  }

  private handleError(error: any): never {
    this.logger.error('Soroban invocation failed', error);
    const msg = error?.message || String(error);

    if (msg.includes('XDR') || msg.includes('decode') || msg.includes('Decode')) {
      throw new HttpException(`Soroban XDR Decode Error: ${msg}`, HttpStatus.BAD_REQUEST);
    }
    if (msg.includes('simulate') || msg.includes('Simulation')) {
      throw new HttpException(`Soroban Simulation Failed: ${msg}`, HttpStatus.BAD_REQUEST);
    }

    throw new HttpException(`Soroban Contract Error: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generic contract execution helper
   */
  private async executeContractFunction(methodName: string, args: StellarSdk.xdr.ScVal[] = []): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
    try {
      const account = await this.rpcServer.getAccount(this.serverKeypair.publicKey());
      const contract = new StellarSdk.Contract(this.contractId);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: '1000',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call(methodName, ...args))
        .setTimeout(30)
        .build();

      const preparedTx = await this.rpcServer.prepareTransaction(tx);
      preparedTx.sign(this.serverKeypair);

      const response = await this.rpcServer.sendTransaction(preparedTx);
      if (response.status === 'ERROR') {
        throw new Error(`Simulation failed or error from RPC: ${JSON.stringify(response)}`);
      }
      return response;
    } catch (e) {
      return this.handleError(e);
    }
  }

  async createMarket(params: CreateMarketParams): Promise<{ market_id: string }> {
    this.logger.log(`createMarket: ${JSON.stringify(params)}`);
    try {
      const args = [
        StellarSdk.nativeToScVal(params.title, { type: 'string' }),
        StellarSdk.nativeToScVal(params.description, { type: 'string' }),
        StellarSdk.nativeToScVal(params.endTime, { type: 'u64' }),
        StellarSdk.nativeToScVal(params.feeStroops, { type: 'i128' }),
      ];
      const response = await this.executeContractFunction('create_market', args);
      // For a real implementation, you'd poll `getTransaction` to wait for SUCCESS and decode the `returnValue`
      // Here we assume the tx_hash represents our process and return a placeholder or parsed val.
      return { market_id: `market-${response.hash}` };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async submitPrediction(params: SubmitPredictionParams): Promise<{ tx_hash: string }> {
    this.logger.log(`submitPrediction: ${JSON.stringify(params)}`);
    try {
      const args = [
        StellarSdk.nativeToScVal(params.userAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(params.marketId, { type: 'string' }),
        StellarSdk.nativeToScVal(params.outcome, { type: 'string' }),
        StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
      ];
      const response = await this.executeContractFunction('submit_prediction', args);
      return { tx_hash: response.hash };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveMarket(marketId: string, outcome: string): Promise<void> {
    this.logger.log(`resolveMarket: ${marketId} outcome=${outcome}`);
    try {
      const args = [
        StellarSdk.nativeToScVal(marketId, { type: 'string' }),
        StellarSdk.nativeToScVal(outcome, { type: 'string' }),
      ];
      await this.executeContractFunction('resolve_market', args);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async claimPayout(marketId: string, predictorAddress: string): Promise<{ amount: string }> {
    this.logger.log(`claimPayout: ${marketId} predictor=${predictorAddress}`);
    try {
      const args = [
        StellarSdk.nativeToScVal(marketId, { type: 'string' }),
        StellarSdk.nativeToScVal(predictorAddress, { type: 'address' }),
      ];
      // In a real implementation you decode the transaction result from getTransaction.
      await this.executeContractFunction('claim_payout', args);
      return { amount: '0' }; // Placeholder amount, normally decoded from XDR response
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelMarket(marketId: string): Promise<void> {
    this.logger.log(`cancelMarket: ${marketId}`);
    try {
      const args = [
        StellarSdk.nativeToScVal(marketId, { type: 'string' }),
      ];
      await this.executeContractFunction('cancel_market', args);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getEvents(fromLedger: number): Promise<SorobanEventsResponse> {
    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL');
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');

    if (!rpcUrl || !contractId) {
      this.logger.warn(
        'SOROBAN_RPC_URL or SOROBAN_CONTRACT_ID is not configured; skipping event poll',
      );
      return { events: [], latestLedger: fromLedger };
    }

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'insightarena-events',
        method: 'getEvents',
        params: {
          startLedger: fromLedger,
          filters: [{ type: 'contract', contractIds: [contractId] }],
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

