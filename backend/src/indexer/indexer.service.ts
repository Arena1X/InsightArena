import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { IndexerMetricsDto } from './dto/indexer-metrics.dto';
import { Match, WinningTeam } from '../matches/entities/match.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import {
  MatchPrediction,
  PredictedOutcome,
} from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { BroadcasterService } from '../websocket/broadcaster.service';

const CHECKPOINT_LEDGER_KEY = 'indexer:last_processed_ledger';
const CHECKPOINT_LEDGER_KEY_LATEST = 'indexer:latest_contract_ledger';
const MAX_RETRIES = 5;
const DLQ_THRESHOLD = 5;
const BATCH_SIZE = 100;
const DEFAULT_CREATOR_EVENT_CATEGORY = 'general';
// Matches MAX_EVENT_DURATION_SECONDS in contracts/creator-event-manager.
const DEFAULT_EVENT_DURATION_SECONDS = 7_776_000;

@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger = new Logger(IndexerService.name);
  private isRunning = false;
  private startTime: number = Date.now();
  private eventsProcessed = 0;
  private lastProcessedAt = Date.now();
  private processingRate = 0;
  private eventTimestamps: number[] = [];

  constructor(
    private readonly configService: ConfigService,

    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,

    @InjectRepository(FeeHistory)
    private readonly feeHistoryRepository: Repository<FeeHistory>,

    @InjectRepository(IndexerCheckpoint)
    private readonly checkpointRepository: Repository<IndexerCheckpoint>,

    @InjectRepository(CreatorEvent)
    private readonly creatorEventRepository: Repository<CreatorEvent>,

    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,

    @InjectRepository(MatchPrediction)
    private readonly matchPredictionRepository: Repository<MatchPrediction>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly notificationGeneratorService: NotificationGeneratorService,
    private readonly broadcasterService: BroadcasterService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCheckpoints();
  }

  private async ensureCheckpoints(): Promise<void> {
    const existing = await this.checkpointRepository.findOne({
      where: { key: CHECKPOINT_LEDGER_KEY },
    });
    if (!existing) {
      await this.checkpointRepository.save({
        key: CHECKPOINT_LEDGER_KEY,
        value: 0,
        meta: null,
      });
    }
    const existingLatest = await this.checkpointRepository.findOne({
      where: { key: CHECKPOINT_LEDGER_KEY_LATEST },
    });
    if (!existingLatest) {
      await this.checkpointRepository.save({
        key: CHECKPOINT_LEDGER_KEY_LATEST,
        value: 0,
        meta: null,
      });
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollContractEvents(): Promise<void> {
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');
    if (!contractId || contractId === 'your-contract-id-here') {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Indexer poll skipped: previous poll still running');
      return;
    }

    this.isRunning = true;
    const batchStart = Date.now();

    try {
      const lastLedger = await this.getLastProcessedLedger();
      const fromLedger = Math.max(lastLedger + 1, 1);

      const { events, latestLedger } =
        await this.fetchEventsFromContract(fromLedger);

      if (latestLedger > lastLedger) {
        await this.saveCheckpoint(CHECKPOINT_LEDGER_KEY_LATEST, latestLedger);
      }

      if (events.length === 0) {
        if (latestLedger > lastLedger) {
          await this.saveCheckpoint(CHECKPOINT_LEDGER_KEY, latestLedger);
        }
        return;
      }

      let maxProcessedLedger = lastLedger;
      const sorted = [...events].sort(
        (a, b) => a.ledger - b.ledger || a.log_index - b.log_index,
      );

      for (const rawEvent of sorted) {
        try {
          await this.storeAndProcessEvent(rawEvent);
          this.eventsProcessed++;
          this.recordProcessedEvent();
          if (rawEvent.ledger > maxProcessedLedger) {
            maxProcessedLedger = rawEvent.ledger;
          }
        } catch (err) {
          this.logger.error(
            `Failed to process event at ledger ${rawEvent.ledger}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      }

      await this.saveCheckpoint(
        CHECKPOINT_LEDGER_KEY,
        Math.max(maxProcessedLedger, latestLedger),
      );

      const elapsed = Date.now() - batchStart;
      this.processingRate =
        elapsed > 0
          ? Math.round((events.length / elapsed) * 1000 * 100) / 100
          : 0;
      this.lastProcessedAt = Date.now();
    } catch (error) {
      this.logger.error('Indexer poll failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async fetchEventsFromContract(fromLedger: number): Promise<{
    events: Array<{
      id: string;
      ledger: number;
      log_index: number;
      event_type: string;
      data: Record<string, unknown>;
      tx_hash: string | null;
    }>;
    latestLedger: number;
  }> {
    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL');
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');

    if (!rpcUrl || !contractId) {
      return { events: [], latestLedger: fromLedger };
    }

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-indexer',
          method: 'getEvents',
          params: {
            startLedger: fromLedger,
            filters: [{ type: 'contract', contractIds: [contractId] }],
            xdrFormat: 'json',
            limit: BATCH_SIZE,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Soroban RPC error: HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        error?: { message?: string };
        result?: {
          events?: unknown[];
          latestLedger?: number;
        };
      };

      if (body.error) {
        throw new Error(body.error.message ?? 'Unknown Soroban RPC error');
      }

      const rawEvents = body.result?.events ?? [];
      const latestLedger =
        typeof body.result?.latestLedger === 'number'
          ? body.result.latestLedger
          : fromLedger;

      const parsed = rawEvents
        .map((raw: unknown, index: number) => this.parseRawEvent(raw, index))
        .filter((e) => e !== null);

      return { events: parsed, latestLedger };
    } catch (error) {
      this.logger.error('Failed to fetch events from contract', error);
      return { events: [], latestLedger: fromLedger };
    }
  }

  private parseRawEvent(
    raw: unknown,
    index: number,
  ): {
    id: string;
    ledger: number;
    log_index: number;
    event_type: string;
    data: Record<string, unknown>;
    tx_hash: string | null;
  } | null {
    if (!raw || typeof raw !== 'object') return null;

    const record = raw as Record<string, unknown>;
    const ledger = this.toNumber(record.ledger);
    if (ledger === null) return null;

    const id =
      typeof record.id === 'string'
        ? record.id
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    const topic = this.readTopic(record.topic ?? record.topics);
    const value =
      record.value && typeof record.value === 'object'
        ? (record.value as Record<string, unknown>)
        : ((record.data as Record<string, unknown>) ?? {});

    const eventType = this.detectEventType(topic, value);
    if (!eventType) return null;

    const txHash =
      typeof record.tx_hash === 'string'
        ? record.tx_hash
        : typeof record.id === 'string'
          ? record.id
          : null;

    const data = this.extractEventData(eventType, value);

    return {
      id,
      ledger,
      log_index: this.toNumber(record.log_index) ?? index,
      event_type: eventType,
      data,
      tx_hash: txHash,
    };
  }

  private readTopic(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        const unwrapped = this.unwrapIndexerValue(item);
        if (typeof unwrapped === 'string') return unwrapped;
        return null;
      })
      .filter((item): item is string => item !== null);
  }

  private detectEventType(
    topic: string[],
    value: Record<string, unknown>,
  ): string | null {
    const lowerTopics = topic.map((t) => t.toLowerCase());

    const explicitTypeCandidate = this.unwrapIndexerValue(
      value.event ?? value.event_type,
    );
    const explicitType =
      typeof explicitTypeCandidate === 'string' ? explicitTypeCandidate : null;

    if (explicitType) return explicitType;

    const topicStr = lowerTopics.join('.');
    const hasTopicPair = (domain: string, action: string): boolean =>
      lowerTopics.some(
        (topic, index) => topic === domain && lowerTopics[index + 1] === action,
      );

    if (topicStr.includes('eventcreated') || hasTopicPair('event', 'created'))
      return 'EventCreated';
    if (topicStr.includes('matchadded') || hasTopicPair('match', 'created'))
      return 'MatchAdded';
    if (topicStr.includes('userjoined') || hasTopicPair('event', 'joined'))
      return 'UserJoinedEvent';
    if (
      topicStr.includes('predictionsubmitted') ||
      hasTopicPair('prediction', 'submitted')
    )
      return 'PredictionSubmitted';
    if (
      topicStr.includes('matchresultsubmitted') ||
      topicStr.includes('reslvd') ||
      hasTopicPair('match', 'result_submitted')
    )
      return 'MatchResultSubmitted';
    if (
      topicStr.includes('winnersverified') ||
      hasTopicPair('event', 'winners_verified')
    )
      return 'WinnersVerified';
    if (
      topicStr.includes('eventcancelled') ||
      hasTopicPair('event', 'cancelled')
    )
      return 'EventCancelled';
    if (topicStr.includes('feeupdated')) return 'FeeUpdated';
    if (topicStr.includes('addressverified')) return 'AddressVerified';
    if (topicStr.includes('addressunverified')) return 'AddressUnverified';
    if (topicStr.includes('payclmd') || topicStr.includes('payoutclaimed'))
      return 'PayoutClaimed';
    if (
      topicStr.includes('submitd') ||
      topicStr.includes('predictionsubmitted')
    )
      return 'PredictionSubmitted';

    return null;
  }

  private extractEventData(
    eventType: string,
    rawValue: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = { ...rawValue };

    switch (eventType) {
      case 'EventCreated': {
        const eventCreated = this.readEventCreatedPayload(rawValue);

        return {
          event_id: this.readBigInt(eventCreated, 'event_id'),
          creator: this.readStr(eventCreated, 'creator'),
          title: this.readStr(eventCreated, 'title'),
          description: this.readStr(eventCreated, 'description'),
          creation_fee_paid: this.readBigInt(eventCreated, 'creation_fee_paid'),
          created_at: this.readNum(eventCreated, 'created_at'),
          start_time: this.readNum(eventCreated, 'start_time'),
          end_time: this.readNum(eventCreated, 'end_time'),
          invite_code: this.readStr(eventCreated, 'invite_code'),
          max_participants: this.readNum(eventCreated, 'max_participants'),
          prize_pool: this.readUnsignedBigInt(eventCreated, 'prize_pool'),
          reward_distribution: this.readNumberArray(
            eventCreated,
            'reward_distribution',
          ),
          entry_fee: this.readUnsignedBigInt(eventCreated, 'entry_fee'),
          category: this.normalizeCategory(
            this.readStr(eventCreated, 'category'),
          ),
          banner_url: this.normalizeNullableString(
            this.readStr(eventCreated, 'banner_url'),
            2048,
          ),
          is_finalized: this.readBool(eventCreated, 'is_finalized') ?? false,
        };
      }
      case 'MatchAdded':
        return {
          match_id: this.readBigInt(base, 'match_id'),
          event_id: this.readBigInt(base, 'event_id'),
          team_a: this.readStr(base, 'team_a'),
          team_b: this.readStr(base, 'team_b'),
          match_time: this.readNum(base, 'match_time'),
          points_multiplier: this.readNum(base, 'points_multiplier'),
        };
      case 'UserJoinedEvent':
        return {
          user_address: this.readStr(base, 'user_address'),
          event_id: this.readBigInt(base, 'event_id'),
          joined_at: this.readNum(base, 'joined_at'),
        };
      case 'PredictionSubmitted':
        return {
          prediction_id: this.readBigInt(base, 'prediction_id'),
          match_id: this.readBigInt(base, 'match_id'),
          event_id: this.readBigInt(base, 'event_id'),
          predictor: this.readStr(base, 'predictor'),
          predicted_outcome: this.readStr(base, 'predicted_outcome'),
          predicted_at: this.readNum(base, 'predicted_at'),
        };
      case 'MatchResultSubmitted':
        return {
          match_id: this.readBigInt(base, 'match_id'),
          event_id: this.readBigInt(base, 'event_id'),
          winning_team: this.readNum(base, 'winning_team'),
          submitted_by: this.readStr(base, 'submitted_by'),
          submitted_at: this.readNum(base, 'submitted_at'),
          home_score: this.readNum(base, 'home_score'),
          away_score: this.readNum(base, 'away_score'),
        };
      case 'WinnersVerified':
        return {
          event_id: this.readBigInt(base, 'event_id'),
          verified_at: this.readNum(base, 'verified_at'),
          winners: Array.isArray(base.winners) ? base.winners : [],
        };
      case 'EventCancelled':
        return {
          event_id: this.readBigInt(base, 'event_id'),
          cancelled_at: this.readNum(base, 'cancelled_at'),
        };
      case 'FeeUpdated':
        return {
          old_fee: this.readBigInt(base, 'old_fee'),
          new_fee: this.readBigInt(base, 'new_fee'),
          updated_by: this.readStr(base, 'updated_by'),
          updated_at: this.readNum(base, 'updated_at'),
        };
      case 'AddressVerified':
        return {
          address: this.readStr(base, 'address'),
          verified_at: this.readNum(base, 'verified_at'),
        };
      case 'AddressUnverified':
        return {
          address: this.readStr(base, 'address'),
          unverified_at: this.readNum(base, 'unverified_at'),
        };
      default:
        return base;
    }
  }

  private async storeAndProcessEvent(rawEvent: {
    id: string;
    ledger: number;
    log_index: number;
    event_type: string;
    data: Record<string, unknown>;
    tx_hash: string | null;
  }): Promise<void> {
    const existing = await this.contractEventRepository.findOne({
      where: { ledger: rawEvent.ledger, log_index: rawEvent.log_index },
    });
    if (existing) {
      if (existing.status === ContractEventStatus.PROCESSED) return;
    }

    let contractEvent: ContractEvent;
    if (existing) {
      contractEvent = existing;
      contractEvent.data = rawEvent.data;
      contractEvent.tx_hash = rawEvent.tx_hash;
    } else {
      contractEvent = this.contractEventRepository.create({
        ledger: rawEvent.ledger,
        log_index: rawEvent.log_index,
        event_type: rawEvent.event_type,
        data: rawEvent.data,
        tx_hash: rawEvent.tx_hash,
        status: ContractEventStatus.PENDING,
        retry_count: 0,
      });
    }

    await this.contractEventRepository.save(contractEvent);

    try {
      await this.processEventByType(rawEvent.event_type, rawEvent.data);
      contractEvent.status = ContractEventStatus.PROCESSED;
      contractEvent.processed_at = new Date();
      await this.contractEventRepository.save(contractEvent);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown processing error';
      contractEvent.retry_count += 1;

      if (contractEvent.retry_count >= DLQ_THRESHOLD) {
        contractEvent.status = ContractEventStatus.DLQ;
        this.logger.warn(
          `Event ${rawEvent.event_type} (ledger=${rawEvent.ledger}) moved to DLQ after ${contractEvent.retry_count} retries`,
        );
      } else {
        contractEvent.status = ContractEventStatus.FAILED;
      }

      contractEvent.error_message = message;
      await this.contractEventRepository.save(contractEvent);
    }
  }

  private async processEventByType(
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    switch (eventType) {
      case 'EventCreated':
        await this.handleEventCreated(data);
        break;
      case 'MatchAdded':
        await this.handleMatchAdded(data);
        break;
      case 'UserJoinedEvent':
        await this.handleUserJoinedEvent(data);
        break;
      case 'PredictionSubmitted':
        await this.handlePredictionSubmitted(data);
        break;
      case 'MatchResultSubmitted':
        await this.handleMatchResultSubmitted(data);
        break;
      case 'WinnersVerified':
        void this.handleWinnersVerified(data);
        break;
      case 'EventCancelled':
        await this.handleEventCancelled(data);
        break;
      case 'FeeUpdated':
        await this.handleFeeUpdated(data);
        break;
      case 'AddressVerified':
        await this.handleAddressVerified(data);
        break;
      case 'AddressUnverified':
        await this.handleAddressUnverified(data);
        break;
      default:
        this.logger.debug(`No handler for event type: ${eventType}`);
    }
  }

  private async handleEventCreated(
    data: Record<string, unknown>,
  ): Promise<void> {
    const onChainEventId = Number(data.event_id);
    if (!onChainEventId) {
      this.logger.warn('EventCreated skipped: missing event_id');
      return;
    }

    const existing = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: onChainEventId },
    });
    if (existing) return;

    const createdAt = this.readUnixTimestamp(data, 'created_at') ?? new Date();
    const startTime = this.readUnixTimestamp(data, 'start_time') ?? createdAt;
    const parsedEndTime = this.readUnixTimestamp(data, 'end_time');
    const endTime =
      parsedEndTime && parsedEndTime.getTime() > startTime.getTime()
        ? parsedEndTime
        : new Date(startTime.getTime() + DEFAULT_EVENT_DURATION_SECONDS * 1000);

    const creatorEvent = this.creatorEventRepository.create({
      on_chain_event_id: onChainEventId,
      creator_address: this.readStr(data, 'creator'),
      title: this.readStr(data, 'title') || `Event ${onChainEventId}`,
      description: this.readStr(data, 'description'),
      creation_fee_paid: this.readUnsignedBigInt(data, 'creation_fee_paid'),
      on_chain_created_at: createdAt,
      start_time: startTime,
      end_time: endTime,
      prize_pool: this.readUnsignedBigInt(data, 'prize_pool'),
      reward_distribution: this.readNumberArray(data, 'reward_distribution'),
      entry_fee: this.readUnsignedBigInt(data, 'entry_fee'),
      category: this.normalizeCategory(this.readStr(data, 'category')),
      banner_url: this.normalizeNullableString(
        this.readStr(data, 'banner_url'),
        2048,
      ),
      is_finalized: this.readBool(data, 'is_finalized') ?? false,
      is_active: true,
      is_cancelled: false,
      invite_code: this.readStr(data, 'invite_code') || null,
      max_participants: this.readNum(data, 'max_participants') ?? 0,
      participant_count: 0,
      match_count: 0,
    });

    await this.creatorEventRepository.save(creatorEvent);
    this.logger.log(`Indexed EventCreated: event_id=${onChainEventId}`);

    // Trigger notification
    await this.notificationGeneratorService.handleEventCreated(data);
    this.broadcasterService.broadcastEventCreated(data);
  }

  private async handleMatchAdded(data: Record<string, unknown>): Promise<void> {
    const onChainMatchId = Number(data.match_id);
    const onChainEventId = Number(data.event_id);
    if (!onChainMatchId || !onChainEventId) {
      this.logger.warn('MatchAdded skipped: missing match_id or event_id');
      return;
    }

    const existing = await this.matchRepository.findOne({
      where: { on_chain_match_id: onChainMatchId },
    });
    if (existing) return;

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: onChainEventId },
    });
    if (!event) {
      this.logger.warn(`MatchAdded skipped: event ${onChainEventId} not found`);
      return;
    }

    let pointsMultiplier =
      data.points_multiplier !== undefined ? Number(data.points_multiplier) : 1;
    if (pointsMultiplier < 1 || pointsMultiplier > 3 || isNaN(pointsMultiplier)) {
      pointsMultiplier = 1;
    }

    const match = this.matchRepository.create({
      on_chain_match_id: onChainMatchId,
      event,
      team_a: this.readStr(data, 'team_a') || 'Team A',
      team_b: this.readStr(data, 'team_b') || 'Team B',
      match_time: data.match_time
        ? new Date(Number(data.match_time) * 1000)
        : new Date(),
      points_multiplier: pointsMultiplier,
      result_submitted: false,
      winning_team: null,
      submitted_by: null,
      submitted_at: null,
      home_score: null,
      away_score: null,
    });

    await this.matchRepository.save(match);

    event.match_count += 1;
    await this.creatorEventRepository.save(event);
    this.logger.log(
      `Indexed MatchAdded: match_id=${onChainMatchId} event_id=${onChainEventId}`,
    );

    // Trigger notification
    await this.notificationGeneratorService.handleMatchAdded(data);
    this.broadcasterService.broadcastMatchAdded(data);
  }

  private async handleUserJoinedEvent(
    data: Record<string, unknown>,
  ): Promise<void> {
    const onChainEventId = Number(data.event_id);
    const userAddress = this.readStr(data, 'user_address');
    if (!onChainEventId || !userAddress) {
      this.logger.warn('UserJoinedEvent skipped: missing data');
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: onChainEventId },
    });
    if (!event) {
      this.logger.warn(
        `UserJoinedEvent skipped: event ${onChainEventId} not found`,
      );
      return;
    }

    event.participant_count += 1;
    await this.creatorEventRepository.save(event);

    // Trigger notification
    await this.notificationGeneratorService.handleUserJoinedEvent(data);
    this.broadcasterService.broadcastUserJoined(data);
  }

  private async handlePredictionSubmitted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const matchId = Number(data.match_id);
    const predictorAddress = this.readStr(data, 'predictor');
    const predictedOutcome = this.readStr(data, 'predicted_outcome');

    if (!matchId || !predictorAddress || !predictedOutcome) {
      this.logger.warn('PredictionSubmitted skipped: missing data');
      return;
    }

    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: matchId },
      relations: ['event'],
    });
    if (!match) {
      this.logger.warn(
        `PredictionSubmitted skipped: match ${matchId} not found`,
      );
      return;
    }

    const user = await this.userRepository.findOne({
      where: { stellar_address: predictorAddress },
    });
    if (!user) {
      this.logger.warn(
        `PredictionSubmitted skipped: unknown user ${predictorAddress}`,
      );
      return;
    }

    const normalizedOutcome = predictedOutcome.toUpperCase();
    if (
      ![PredictedOutcome.TEAM_A, PredictedOutcome.TEAM_B, PredictedOutcome.DRAW]
        .map((o) => o.toString())
        .includes(normalizedOutcome)
    ) {
      this.logger.warn(
        `PredictionSubmitted skipped: invalid outcome ${predictedOutcome}`,
      );
      return;
    }

    const existing = await this.matchPredictionRepository.findOne({
      where: {
        match: { id: match.id },
        user: { id: user.id },
      },
    });
    if (existing) return;

    const prediction = this.matchPredictionRepository.create({
      match,
      user,
      predicted_outcome: normalizedOutcome as PredictedOutcome,
      is_correct: null,
    });

    await this.matchPredictionRepository.save(prediction);
    this.logger.log(
      `Indexed PredictionSubmitted: match=${matchId} user=${predictorAddress}`,
    );

    // Trigger notification
    await this.notificationGeneratorService.handlePredictionSubmitted(data);
    this.broadcasterService.broadcastPredictionSubmitted(data);
  }

  private async handleMatchResultSubmitted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const matchId = Number(data.match_id);
    if (!matchId) {
      this.logger.warn('MatchResultSubmitted skipped: missing match_id');
      return;
    }

    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: matchId },
    });
    if (!match) {
      this.logger.warn(
        `MatchResultSubmitted skipped: match ${matchId} not found`,
      );
      return;
    }

    if (match.result_submitted) return;

    const winningTeamNum = Number(data.winning_team);
    const winningTeamMap: Record<number, WinningTeam> = {
      0: WinningTeam.TEAM_A,
      1: WinningTeam.TEAM_B,
      2: WinningTeam.DRAW,
    };
    const winningTeam = winningTeamMap[winningTeamNum] ?? null;

    if (!winningTeam) {
      this.logger.warn(
        `MatchResultSubmitted skipped: invalid winning_team ${winningTeamNum}`,
      );
      return;
    }

    match.result_submitted = true;
    match.winning_team = winningTeam;
    match.submitted_by = this.readStr(data, 'submitted_by');
    match.submitted_at = data.submitted_at
      ? new Date(Number(data.submitted_at) * 1000)
      : new Date();
    match.home_score =
      data.home_score !== undefined ? Number(data.home_score) : null;
    match.away_score =
      data.away_score !== undefined ? Number(data.away_score) : null;

    await this.matchRepository.save(match);

    await this.gradePredictions(match.id, winningTeam);
    this.logger.log(
      `Indexed MatchResultSubmitted: match=${matchId} winner=${winningTeam}`,
    );

    // Trigger notification
    await this.notificationGeneratorService.handleMatchResultSubmitted(data);
    this.broadcasterService.broadcastMatchResolved(data);
  }

  private async gradePredictions(
    matchId: string,
    winningTeam: WinningTeam,
  ): Promise<void> {
    const predictions = await this.matchPredictionRepository.find({
      where: { match: { id: matchId } },
    });

    for (const prediction of predictions) {
      prediction.is_correct =
        String(prediction.predicted_outcome) === String(winningTeam);
    }

    if (predictions.length > 0) {
      await this.matchPredictionRepository.save(predictions);
    }
  }

  private async handleWinnersVerified(
    data: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `WinnersVerified event received for event_id=${String(data.event_id)}`,
    );

    // Trigger notification
    await this.notificationGeneratorService.handleWinnersVerified(data);
    this.broadcasterService.broadcastWinnersVerified(data);
  }

  private async handleEventCancelled(
    data: Record<string, unknown>,
  ): Promise<void> {
    const onChainEventId = Number(data.event_id);
    if (!onChainEventId) {
      this.logger.warn('EventCancelled skipped: missing event_id');
      return;
    }

    const event = await this.creatorEventRepository.findOne({
      where: { on_chain_event_id: onChainEventId },
    });
    if (!event) {
      this.logger.warn(
        `EventCancelled skipped: event ${onChainEventId} not found`,
      );
      return;
    }

    event.is_active = false;
    event.is_cancelled = true;
    await this.creatorEventRepository.save(event);
    this.logger.log(`Indexed EventCancelled: event_id=${onChainEventId}`);

    // Trigger notification
    await this.notificationGeneratorService.handleEventCancelled(data);
    this.broadcasterService.broadcastEventCancelled(data);
  }

  private async handleFeeUpdated(data: Record<string, unknown>): Promise<void> {
    const oldFee = this.readStr(data, 'old_fee') || '0';
    const newFee = this.readStr(data, 'new_fee') || '0';
    const updatedBy = this.readStr(data, 'updated_by');

    const feeHistory = this.feeHistoryRepository.create({
      old_fee_stroops: oldFee,
      new_fee_stroops: newFee,
      updated_by: updatedBy || null,
      ledger: null,
      tx_hash: null,
    });

    await this.feeHistoryRepository.save(feeHistory);
    this.logger.log(`Indexed FeeUpdated: old=${oldFee} new=${newFee}`);
  }

  private async handleAddressVerified(
    data: Record<string, unknown>,
  ): Promise<void> {
    const address = this.readStr(data, 'address');
    if (!address) return;

    const user = await this.userRepository.findOne({
      where: { stellar_address: address },
    });
    if (user) {
      user.reputation_score = (user.reputation_score ?? 0) + 1;
      await this.userRepository.save(user);
    }
    this.logger.log(`Indexed AddressVerified: address=${address}`);
  }

  private async handleAddressUnverified(
    data: Record<string, unknown>,
  ): Promise<void> {
    const address = this.readStr(data, 'address');
    if (!address) return;

    const user = await this.userRepository.findOne({
      where: { stellar_address: address },
    });
    if (user && (user.reputation_score ?? 0) > 0) {
      user.reputation_score = Math.max(0, (user.reputation_score ?? 1) - 1);
      await this.userRepository.save(user);
    }
    this.logger.log(`Indexed AddressUnverified: address=${address}`);
  }

  async reindex(fromLedger: number): Promise<void> {
    this.logger.log(`Reindex triggered from ledger ${fromLedger}`);
    await this.saveCheckpoint(
      CHECKPOINT_LEDGER_KEY,
      Math.max(0, fromLedger - 1),
    );
  }

  async triggerManualSync(): Promise<void> {
    await this.pollContractEvents();
  }

  getEventsProcessedPerMinute(): number {
    const cutoff = Date.now() - 60_000;
    this.eventTimestamps = this.eventTimestamps.filter((t) => t >= cutoff);
    return this.eventTimestamps.length;
  }

  getLastSuccessfulSyncTimestamp(): Date {
    return new Date(this.lastProcessedAt);
  }

  private recordProcessedEvent(): void {
    this.eventTimestamps.push(Date.now());
    const cutoff = Date.now() - 60_000;
    this.eventTimestamps = this.eventTimestamps.filter((t) => t >= cutoff);
  }

  async getEventsPaginated(cursor?: string, limit = 50) {
    const query = this.contractEventRepository
      .createQueryBuilder('event')
      .orderBy('event.ledger', 'DESC')
      .addOrderBy('event.log_index', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [ledger, logIndex] = decoded.split(':').map(Number);
      if (!isNaN(ledger) && !isNaN(logIndex)) {
        query.andWhere(
          '(event.ledger < :ledger OR (event.ledger = :ledger2 AND event.log_index < :logIndex))',
          { ledger, ledger2: ledger, logIndex },
        );
      }
    }

    const events = await query.getMany();
    const hasMore = events.length > limit;
    if (hasMore) events.pop();

    let nextCursor: string | null = null;
    if (hasMore && events.length > 0) {
      const last = events[events.length - 1];
      nextCursor = Buffer.from(`${last.ledger}:${last.log_index}`).toString(
        'base64',
      );
    }

    return {
      data: events,
      meta: {
        next_cursor: nextCursor,
        has_more: hasMore,
      },
    };
  }

  async getMetrics(): Promise<IndexerMetricsDto> {
    const lastLedger = await this.getLastProcessedLedger();
    const latestLedger = await this.getLatestContractLedger();

    const pendingCount = await this.contractEventRepository.count({
      where: { status: ContractEventStatus.PENDING },
    });
    const failedCount = await this.contractEventRepository.count({
      where: { status: ContractEventStatus.FAILED },
    });
    const dlqCount = await this.contractEventRepository.count({
      where: { status: ContractEventStatus.DLQ },
    });
    const totalProcessed = await this.contractEventRepository.count({
      where: { status: ContractEventStatus.PROCESSED },
    });

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      events_per_second: this.processingRate,
      lag_in_ledgers: Math.max(0, latestLedger - lastLedger),
      total_events_processed: totalProcessed,
      pending_events: pendingCount,
      failed_events: failedCount,
      dlq_events: dlqCount,
      last_processed_ledger: lastLedger,
      latest_contract_ledger: latestLedger,
      is_running: this.isRunning,
      uptime_seconds: uptime,
    };
  }

  async retryFailedEvents(): Promise<number> {
    const failed = await this.contractEventRepository.find({
      where: [
        { status: ContractEventStatus.FAILED },
        { status: ContractEventStatus.DLQ },
      ],
    });

    for (const event of failed) {
      if (event.retry_count >= MAX_RETRIES) continue;
      try {
        await this.processEventByType(event.event_type, event.data);
        event.status = ContractEventStatus.PROCESSED;
        event.processed_at = new Date();
        event.error_message = null;
        await this.contractEventRepository.save(event);
      } catch (err) {
        this.logger.warn(
          `Retry failed for event ${event.id}: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
      }
    }

    return failed.length;
  }

  async cleanupOldEvents(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.contractEventRepository.delete({
      created_at: LessThan(cutoff),
      status: ContractEventStatus.PROCESSED,
    });

    return result.affected ?? 0;
  }

  private async getLastProcessedLedger(): Promise<number> {
    return this.getCheckpointValue(CHECKPOINT_LEDGER_KEY);
  }

  private async getLatestContractLedger(): Promise<number> {
    return this.getCheckpointValue(CHECKPOINT_LEDGER_KEY_LATEST);
  }

  private async getCheckpointValue(key: string): Promise<number> {
    const cp = await this.checkpointRepository.findOne({ where: { key } });
    return cp ? cp.value : 0;
  }

  private async saveCheckpoint(key: string, value: number): Promise<void> {
    await this.checkpointRepository.upsert({ key, value, meta: null }, ['key']);
  }

  private readEventCreatedPayload(rawValue: unknown): Record<string, unknown> {
    const base =
      rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? { ...(rawValue as Record<string, unknown>) }
        : {};
    const positional = this.readPositionalValues(rawValue);

    const readValue = (key: string, positionalIndex: number): unknown => {
      if (base[key] !== undefined) return base[key];
      return positional[positionalIndex];
    };

    if (positional.length > 0 && positional.length <= 3) {
      return {
        ...base,
        event_id: readValue('event_id', 0),
        creator: readValue('creator', 1),
        invite_code: readValue('invite_code', 2),
      };
    }

    if (positional.length > 0 && positional.length <= 8) {
      return {
        ...base,
        event_id: readValue('event_id', 0),
        creator: readValue('creator', 1),
        title: readValue('title', 2),
        description: readValue('description', 3),
        creation_fee_paid: readValue('creation_fee_paid', 4),
        created_at: readValue('created_at', 5),
        invite_code: readValue('invite_code', 6),
        max_participants: readValue('max_participants', 7),
      };
    }

    return {
      ...base,
      event_id: readValue('event_id', 0),
      creator: readValue('creator', 1),
      title: readValue('title', 2),
      description: readValue('description', 3),
      creation_fee_paid: readValue('creation_fee_paid', 4),
      created_at: readValue('created_at', 5),
      start_time: readValue('start_time', 6),
      end_time: readValue('end_time', 7),
      invite_code: readValue('invite_code', 8),
      max_participants: readValue('max_participants', 9),
      prize_pool: readValue('prize_pool', 10),
      reward_distribution: readValue('reward_distribution', 11),
      entry_fee: readValue('entry_fee', 12),
      category: readValue('category', 13),
      banner_url: readValue('banner_url', 14),
      is_finalized: readValue('is_finalized', 15),
    };
  }

  private readPositionalValues(rawValue: unknown): unknown[] {
    const value = this.unwrapIndexerValue(rawValue);
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.vec)) return record.vec;
      if (Array.isArray(record.values)) return record.values;
    }
    return [];
  }

  private readBool(data: Record<string, unknown>, key: string): boolean | null {
    const val = this.unwrapIndexerValue(data[key]);
    if (val === null || val === undefined) return null;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') {
      if (val === 1) return true;
      if (val === 0) return false;
      return null;
    }
    if (typeof val === 'bigint') {
      if (val === 1n) return true;
      if (val === 0n) return false;
      return null;
    }
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return null;
  }

  private readNumberArray(
    data: Record<string, unknown>,
    key: string,
  ): number[] {
    const unwrapped = this.unwrapIndexerValue(data[key]);
    const val =
      unwrapped &&
      typeof unwrapped === 'object' &&
      !Array.isArray(unwrapped) &&
      Array.isArray((unwrapped as Record<string, unknown>).vec)
        ? (unwrapped as Record<string, unknown>).vec
        : unwrapped;

    if (Array.isArray(val)) return this.normalizeNumberArray(val);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) return this.normalizeNumberArray(parsed);
      } catch {
        // Fall through to comma-separated parsing for legacy/manual payloads.
      }

      return this.normalizeNumberArray(trimmed.split(','));
    }

    return [];
  }

  private normalizeNumberArray(values: unknown[]): number[] {
    return values
      .map((item) => this.toNumber(item))
      .filter(
        (item): item is number =>
          item !== null && Number.isSafeInteger(item) && item >= 0,
      );
  }

  private readUnixTimestamp(
    data: Record<string, unknown>,
    key: string,
  ): Date | null {
    const seconds = this.readNum(data, key);
    if (seconds === null || seconds <= 0 || !Number.isSafeInteger(seconds)) {
      return null;
    }

    const milliseconds = seconds * 1000;
    if (!Number.isFinite(milliseconds)) return null;

    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private readUnsignedBigInt(
    data: Record<string, unknown>,
    key: string,
  ): string {
    const normalized = this.readBigInt(data, key);
    return normalized.startsWith('-') ? '0' : normalized;
  }

  private normalizeCategory(category: string): string {
    const normalized = category
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)
      .replace(/^-+|-+$/g, '');

    return normalized || DEFAULT_CREATOR_EVENT_CATEGORY;
  }

  private normalizeNullableString(
    value: string,
    maxLength: number,
  ): string | null {
    const normalized = value.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private readStr(data: Record<string, unknown>, key: string): string {
    const val = this.unwrapIndexerValue(data[key]);
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'bigint' || typeof val === 'symbol') return String(val);
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '';
      }
    }
    return '';
  }

  private readNum(data: Record<string, unknown>, key: string): number | null {
    return this.toNumber(data[key]);
  }

  private readBigInt(data: Record<string, unknown>, key: string): string {
    const val = this.unwrapIndexerValue(data[key]);
    if (val === null || val === undefined || val === '') return '0';

    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'number') {
      if (!Number.isSafeInteger(val)) return '0';
      return BigInt(val).toString();
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return '0';

      try {
        return BigInt(trimmed).toString();
      } catch {
        return '0';
      }
    }

    return '0';
  }

  private toNumber(value: unknown): number | null {
    const val = this.unwrapIndexerValue(value);
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'bigint') {
      const parsed = Number(val);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private unwrapIndexerValue(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    if ('value' in record) return this.unwrapIndexerValue(record.value);

    for (const key of [
      'symbol',
      'sym',
      'string',
      'str',
      'address',
      'u64',
      'i64',
      'u32',
      'i32',
      'u128',
      'i128',
      'bool',
      'boolean',
    ]) {
      if (key in record) return this.unwrapIndexerValue(record[key]);
    }

    return value;
  }
}
