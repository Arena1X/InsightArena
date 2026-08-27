import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Contract,
  Keypair,
  TransactionBuilder,
  Networks,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from '@stellar/stellar-sdk';

export interface ContractEvent {
  eventId: string;
  inviteCode: string;
  creator: string;
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  maxParticipants: number;
  participantCount: number;
  isActive: boolean;
  prizePool?: string;
  rewardDistribution?: number[];
  entryFee?: string;
  category?: string;
  bannerUrl?: string | null;
  isFinalized?: boolean;
}

export interface ContractMatch {
  matchId: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  startTime: number;
  resolved: boolean;
  outcome: string | null;
}

export interface ContractPrediction {
  predictionId?: string;
  prediction_id?: string | number;
  matchId?: string;
  match_id?: string | number;
  eventId?: string;
  event_id?: string | number;
  user?: string;
  predictor?: string;
  chosenOutcome?: string;
  predictedOutcome?: string;
  predicted_outcome?: string;
  predictedAt?: number;
  predicted_at?: number;
  stakeAmount?: string;
  claimed?: boolean;
  isCorrect?: boolean | null;
  is_correct?: boolean | null;
  isWithdrawn?: boolean;
  is_withdrawn?: boolean;
}

export interface ContractEventStatistics {
  eventId: string;
  participantCount: number;
  matchCount: number;
  totalPredictions: number;
  allMatchesResolved: boolean;
  winnersVerified: boolean;
  winnerCount: number;
}

export interface ContractPredictionDistribution {
  teamA: number;
  teamB: number;
  draw: number;
}

export interface ContractParticipant {
  address: string;
  joinedAt: number;
  predictionCount: number;
}

export interface ContractWinner {
  address: string;
  totalStake: string;
  payout: string;
}

export interface ContractLeaderboardEntry {
  rank: number;
  address: string;
  total_predictions: number;
  correct_predictions: number;
  accuracy_percentage: number;
  is_winner: boolean;
  completion_time: string | null;
}

export interface ContractConfig {
  admin: string;
  aiAgent: string;
  treasury: string;
  celoToken: string;
  creationFee: string;
  paused: boolean;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);
  private readonly contractId: string;
  private readonly network: string;
  private readonly rpcUrl: string;
  private readonly rpcServer: SorobanRpc.Server;
  private readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    this.contractId =
      this.configService.get<string>('SOROBAN_CONTRACT_ID') ?? '';
    this.network =
      this.configService.get<string>('STELLAR_NETWORK') ?? 'testnet';
    this.rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';

    this.networkPassphrase =
      this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    this.rpcServer = new SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
    });

    if (!this.contractId) {
      this.logger.warn('ContractService: SOROBAN_CONTRACT_ID not configured');
    }
  }

  async getEvent(eventId: string): Promise<ContractEvent | null> {
    return this.viewCall('get_event', [
      nativeToScVal(eventId, { type: 'string' }),
    ]);
  }

  async getEventByCode(inviteCode: string): Promise<ContractEvent | null> {
    return this.viewCall('get_event_by_code', [
      nativeToScVal(inviteCode, { type: 'string' }),
    ]);
  }

  async getMatch(matchId: string): Promise<ContractMatch | null> {
    return this.viewCall('get_match', [
      nativeToScVal(matchId, { type: 'string' }),
    ]);
  }

  async getEventMatches(eventId: string): Promise<ContractMatch[]> {
    const result = await this.viewCall<ContractMatch[]>('get_event_matches', [
      nativeToScVal(eventId, { type: 'string' }),
    ]);
    return result ?? [];
  }

  async getPrediction(
    predictionId: string,
  ): Promise<ContractPrediction | null> {
    return this.viewCall('get_prediction', [
      nativeToScVal(predictionId, { type: 'string' }),
    ]);
  }

  async getUserPredictions(
    user: string,
    eventId: string,
  ): Promise<ContractPrediction[]> {
    const result = await this.viewCall<ContractPrediction[]>(
      'get_user_predictions',
      [new Address(user).toScVal(), nativeToScVal(eventId, { type: 'string' })],
    );
    return result ?? [];
  }

  async getEventParticipants(eventId: string): Promise<ContractParticipant[]> {
    const result = await this.viewCall<ContractParticipant[]>(
      'get_event_participants',
      [nativeToScVal(eventId, { type: 'string' })],
    );
    return result ?? [];
  }

  async getEventWinners(eventId: string): Promise<ContractWinner[]> {
    const result = await this.viewCall<ContractWinner[]>('get_event_winners', [
      nativeToScVal(eventId, { type: 'string' }),
    ]);
    return result ?? [];
  }

  async getEventLeaderboard(
    eventId: string,
  ): Promise<ContractLeaderboardEntry[]> {
    const result = await this.viewCall<ContractLeaderboardEntry[]>(
      'get_event_leaderboard',
      [nativeToScVal(eventId, { type: 'string' })],
    );
    if (!result || !Array.isArray(result)) return [];
    return result.map((entry, i) => ({
      rank: entry.rank ?? i + 1,
      address: entry.address,
      total_predictions: Number(entry.total_predictions ?? 0),
      correct_predictions: Number(entry.correct_predictions ?? 0),
      accuracy_percentage: Number(entry.accuracy_percentage ?? 0),
      is_winner: Boolean(entry.is_winner ?? false),
      completion_time: entry.completion_time ?? null,
    }));
  }

  async getConfig(): Promise<ContractConfig | null> {
    return this.viewCall('get_config', []);
  }

  async getCreationFee(): Promise<string> {
    const result = await this.viewCall<string>('get_creation_fee', []);
    return result ?? '0';
  }

  async isVerified(address: string): Promise<boolean> {
    const result = await this.viewCall<boolean>('is_verified', [
      new Address(address).toScVal(),
    ]);
    return result ?? false;
  }

  async getEventStatistics(
    eventId: string,
  ): Promise<ContractEventStatistics | null> {
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId)) {
      return null;
    }

    const result = await this.viewCall<Record<string, unknown>>(
      'get_event_statistics',
      [nativeToScVal(numericId, { type: 'u64' })],
    );

    if (!result) {
      return null;
    }

    const eventIdRaw = result.eventId ?? result.event_id ?? eventId;
    const eventIdString =
      typeof eventIdRaw === 'string'
        ? eventIdRaw
        : typeof eventIdRaw === 'number'
          ? String(eventIdRaw)
          : eventId;

    return {
      eventId: eventIdString,
      participantCount: Number(
        result.participantCount ?? result.participant_count ?? 0,
      ),
      matchCount: Number(result.matchCount ?? result.match_count ?? 0),
      totalPredictions: Number(
        result.totalPredictions ?? result.total_predictions ?? 0,
      ),
      allMatchesResolved: Boolean(
        result.allMatchesResolved ?? result.all_matches_resolved ?? false,
      ),
      winnersVerified: Boolean(
        result.winnersVerified ?? result.winners_verified ?? false,
      ),
      winnerCount: Number(result.winnerCount ?? result.winner_count ?? 0),
    };
  }

  async getPredictionDistribution(
    matchId: string,
  ): Promise<ContractPredictionDistribution> {
    const numericId = Number(matchId);
    if (!Number.isFinite(numericId)) {
      return { teamA: 0, teamB: 0, draw: 0 };
    }

    const result = await this.viewCall<[number, number, number] | number[]>(
      'get_prediction_distribution',
      [nativeToScVal(numericId, { type: 'u64' })],
    );

    if (!result || !Array.isArray(result) || result.length < 3) {
      return { teamA: 0, teamB: 0, draw: 0 };
    }

    return {
      teamA: Number(result[0] ?? 0),
      teamB: Number(result[1] ?? 0),
      draw: Number(result[2] ?? 0),
    };
  }

  private async viewCall<T>(fn: string, args: xdr.ScVal[]): Promise<T | null> {
    if (!this.contractId) {
      this.logger.warn(
        `viewCall(${fn}): contract ID not configured, returning null`,
      );
      return null;
    }

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        this.logger.debug(`viewCall(${fn}) attempt=${attempt + 1}`);

        // Use a throwaway keypair — view calls don't need a real signer
        const keypair = Keypair.random();
        const account = await this.rpcServer
          .getAccount(keypair.publicKey())
          .catch(() => {
            // If account doesn't exist on network, create a minimal source account object
            return new SorobanRpc.Server(this.rpcUrl, {
              allowHttp: this.rpcUrl.startsWith('http://'),
            })
              .getAccount(keypair.publicKey())
              .catch(() => null);
          });

        if (!account) {
          this.logger.warn(
            `viewCall(${fn}): could not load source account, using stub`,
          );
          return null;
        }

        const contract = new Contract(this.contractId);
        const tx = new TransactionBuilder(account, {
          fee: '100',
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(contract.call(fn, ...args))
          .setTimeout(30)
          .build();

        const simulation = await this.rpcServer.simulateTransaction(tx);

        if (SorobanRpc.Api.isSimulationError(simulation)) {
          this.logger.error(
            `viewCall(${fn}) simulation error: ${simulation.error}`,
          );
          return null;
        }

        const successResult =
          simulation as SorobanRpc.Api.SimulateTransactionSuccessResponse;
        if (!successResult.result?.retval) {
          return null;
        }

        return scValToNative(successResult.result.retval) as T;
      } catch (err) {
        attempt++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `viewCall(${fn}) attempt ${attempt} failed: ${message}`,
        );
        if (attempt >= maxAttempts) {
          this.logger.error(`viewCall(${fn}) exhausted retries`);
          return null;
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    return null;
  }
}
