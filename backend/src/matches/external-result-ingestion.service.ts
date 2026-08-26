import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, MatchDisputeStatus } from './entities/match.entity';
import {
  ExternalMatchResult,
  ExternalResultStatus,
} from './entities/external-match-result.entity';
import { MatchResultDivergence } from './entities/match-result-divergence.entity';
import { EXTERNAL_RESULT_FEED_CLIENT } from './external-result-feed.client';
import type {
  ExternalResultFeedClient,
  ExternalMatchResultPayload,
} from './external-result-feed.client';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';

@Injectable()
export class ExternalResultIngestionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalResultIngestionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(ExternalMatchResult)
    private readonly resultRepository: Repository<ExternalMatchResult>,
    @InjectRepository(MatchResultDivergence)
    private readonly divergenceRepository: Repository<MatchResultDivergence>,
    @Inject(EXTERNAL_RESULT_FEED_CLIENT)
    private readonly feedClient: ExternalResultFeedClient,
    private readonly notificationGenerator: NotificationGeneratorService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.configService.get<number>(
      'MATCH_RESULTS_POLL_INTERVAL_MS',
      60000,
    );
    if (
      interval > 0 &&
      this.configService.get<string>('MATCH_RESULTS_FEED_URL')
    ) {
      this.timer = setInterval(() => void this.ingest(), interval);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async ingest(): Promise<void> {
    const results = await this.feedClient.fetchResults();
    for (const result of results) await this.processResult(result);
  }

  private async processResult(
    result: ExternalMatchResultPayload,
  ): Promise<void> {
    const match = await this.matchRepository.findOne({
      where: { external_id: result.externalId },
    });
    if (!match) {
      this.logger.warn(`Unmatched external result: ${result.externalId}`);
      return;
    }

    if (
      match.result_submitted &&
      (match.home_score !== result.homeScore ||
        match.away_score !== result.awayScore ||
        match.winning_team !== result.winningTeam)
    ) {
      this.logger.warn(`Conflicting external result: ${result.externalId}`);
      await this.recordDivergence(
        match,
        'match_submitted_result',
        {
          home_score: match.home_score,
          away_score: match.away_score,
          winning_team: match.winning_team,
        },
        result,
      );
      return;
    }

    const queued = await this.resultRepository.findOne({
      where: { match: { id: match.id } },
    });
    if (queued) {
      if (
        queued.home_score !== result.homeScore ||
        queued.away_score !== result.awayScore ||
        queued.winning_team !== result.winningTeam
      ) {
        this.logger.warn(
          `Conflicting queued external result: ${result.externalId}`,
        );
        await this.recordDivergence(
          match,
          'queued_external_result',
          {
            home_score: queued.home_score,
            away_score: queued.away_score,
            winning_team: queued.winning_team,
          },
          result,
        );
      }
      return;
    }

    await this.resultRepository.save(
      this.resultRepository.create({
        match,
        external_id: result.externalId,
        home_score: result.homeScore,
        away_score: result.awayScore,
        winning_team: result.winningTeam,
        status: ExternalResultStatus.PENDING_CONFIRMATION,
      }),
    );
  }

  /**
   * Quarantines a match on two-source disagreement: persists an immutable
   * divergence record, marks the match DISPUTED_SOURCE (so nothing treats
   * it as a settled result), and alerts admins. Never applies either
   * source's value to the match.
   */
  private async recordDivergence(
    match: Match,
    sourceAName: string,
    sourceAValue: Record<string, unknown>,
    result: ExternalMatchResultPayload,
  ): Promise<void> {
    await this.divergenceRepository.save(
      this.divergenceRepository.create({
        match,
        source_a_name: sourceAName,
        source_a_value: sourceAValue,
        source_b_name: 'external_feed',
        source_b_value: {
          home_score: result.homeScore,
          away_score: result.awayScore,
          winning_team: result.winningTeam,
        },
      }),
    );

    match.dispute_status = MatchDisputeStatus.DISPUTED_SOURCE;
    await this.matchRepository.save(match);

    await this.notificationGenerator.notifyOracleDivergence({
      matchId: match.id,
      sourceAName,
      sourceBName: 'external_feed',
    });
  }
}
