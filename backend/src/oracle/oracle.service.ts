import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import { CreatorEvent } from '../creator-events/entities/creator-event.entity';
import { MatchResultDivergence } from '../matches/entities/match-result-divergence.entity';
import {
  OracleSubmission,
  SubmissionStatus,
  SubmissionReviewStatus,
  WinningTeam,
} from './entities/oracle-submission.entity';
import {
  ConsensusSubmissionSummary,
  MatchConsensusResponse,
} from './dto/match-consensus.dto';
import {
  ListPendingMatchesQueryDto,
  PendingMatchResponse,
  PaginatedPendingMatchesResponse,
  OracleStatsResponse,
} from './dto/list-pending-matches-query.dto';
import {
  ListDivergencesQueryDto,
  PaginatedDivergencesResponse,
} from './dto/list-divergences.dto';
import { OracleReliabilityService } from './oracle-reliability.service';

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  /** Default minimum eligible sources before auto-finalization may proceed. */
  private static readonly DEFAULT_MIN_CONSENSUS_SOURCES = 2;

  constructor(
    @InjectRepository(CreatorEventMatch)
    private readonly matchRepository: Repository<CreatorEventMatch>,
    @InjectRepository(CreatorEvent)
    private readonly eventRepository: Repository<CreatorEvent>,
    @InjectRepository(MatchResultDivergence)
    private readonly divergenceRepository: Repository<MatchResultDivergence>,
    @InjectRepository(OracleSubmission)
    private readonly submissionRepository: Repository<OracleSubmission>,
    private readonly configService: ConfigService,
    private readonly reliabilityService: OracleReliabilityService,
  ) {}

  async getPendingMatches(
    query: ListPendingMatchesQueryDto,
  ): Promise<PaginatedPendingMatchesResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const now = new Date();

    const [matches, total] = await this.matchRepository
      .createQueryBuilder('m')
      .where('m.match_time < :now', { now })
      .andWhere('m.result_submitted = :submitted', { submitted: false })
      .orderBy('m.match_time', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const eventIds = [...new Set(matches.map((m) => m.event_id))];
    const events =
      eventIds.length > 0
        ? ((await this.eventRepository.find({
            where: { id: In(eventIds) },
          })) ?? [])
        : [];
    const eventMap = new Map(events.map((e) => [e.id, e]));

    const data: PendingMatchResponse[] = matches.map((match) => {
      const event = eventMap.get(match.event_id);
      const timeSinceMatchStarted = now.getTime() - match.match_time.getTime();

      return {
        match: {
          id: match.id,
          on_chain_match_id: match.on_chain_match_id,
          team_a: match.team_a,
          team_b: match.team_b,
          match_time: match.match_time.toISOString(),
          result_submitted: match.result_submitted,
          prediction_count: match.prediction_count,
          created_at: match.created_at.toISOString(),
        },
        event: {
          id: event?.id ?? '',
          on_chain_event_id: event?.on_chain_event_id ?? '',
          title: event?.title ?? 'Unknown Event',
          creator_address: event?.creator_address ?? '',
        },
        time_since_match_started_seconds: Math.floor(
          timeSinceMatchStarted / 1000,
        ),
      };
    });

    return { data, total, page, limit };
  }

  async getStats(): Promise<OracleStatsResponse> {
    const now = new Date();
    const overdueThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [pending, resolved, overdue] = await Promise.all([
      this.matchRepository
        .createQueryBuilder('m')
        .where('m.match_time < :now', { now })
        .andWhere('m.result_submitted = :submitted', { submitted: false })
        .andWhere('m.match_time >= :threshold', { threshold: overdueThreshold })
        .getCount(),
      this.matchRepository
        .createQueryBuilder('m')
        .where('m.result_submitted = :submitted', { submitted: true })
        .getCount(),
      this.matchRepository
        .createQueryBuilder('m')
        .where('m.match_time < :threshold', { threshold: overdueThreshold })
        .andWhere('m.result_submitted = :submitted', { submitted: false })
        .getCount(),
    ]);

    return { pending, resolved, overdue };
  }

  async getDivergences(
    query: ListDivergencesQueryDto,
  ): Promise<PaginatedDivergencesResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [divergences, total] = await this.divergenceRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.match', 'match')
      .where('d.resolved = false')
      .orderBy('d.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = divergences.map((d) => ({
      id: d.id,
      match_id: d.match.id,
      source_a_name: d.source_a_name,
      source_a_value: d.source_a_value,
      source_b_name: d.source_b_name,
      source_b_value: d.source_b_value,
      created_at: d.created_at.toISOString(),
    }));

    return { data, total, page, limit };
  }

  // ── Consensus auto-finalization gating (#1611) ───────────────────────────

  /**
   * Evaluate whether a match's oracle submissions can be auto-finalized.
   *
   * Submissions quarantined by anomaly detection — `HELD` pending manual review
   * or `REJECTED` after a review — are excluded from the outcome vote and the
   * confidence median, so an anomalous source cannot shape (or veto) the final
   * result. Admin-`APPROVED` submissions return to the consensus pool.
   *
   * Consensus is weighted by each oracle's historical reliability score (#1765).
   * Each source contributes: weight(source) * vote_weight to its chosen outcome.
   * Outcomes are ranked by total weighted votes; a majority requires strictly
   * more than half of the total eligible weight.
   *
   * Consensus is actionable when at least `ORACLE_CONSENSUS_MIN_SOURCES`
   * eligible sources agree on one outcome by weighted majority.
   */
  async getMatchConsensus(matchId: string): Promise<MatchConsensusResponse> {
    const submissions = await this.submissionRepository.find({
      where: { match_id: matchId },
      order: { created_at: 'ASC' },
    });

    const isQuarantined = (s: OracleSubmission): boolean =>
      s.review_status === SubmissionReviewStatus.HELD ||
      s.review_status === SubmissionReviewStatus.REJECTED;

    const eligible = submissions.filter(
      (s) => !isQuarantined(s) && s.status !== SubmissionStatus.FAILED,
    );
    const quarantined = submissions.filter(isQuarantined);

    // Load reliability weights for each eligible source (#1765)
    const weights: Map<string, number> = new Map();
    for (const s of eligible) {
      const weight = await this.reliabilityService.getWeight(s.data_source);
      weights.set(s.data_source, weight);
    }

    // Accumulate weighted votes by outcome
    const outcomeVotes: Record<string, number> = {
      [WinningTeam.TEAM_A]: 0,
      [WinningTeam.TEAM_B]: 0,
      [WinningTeam.DRAW]: 0,
    };
    let totalWeight = 0;

    for (const s of eligible) {
      if (s.winning_team in outcomeVotes) {
        const weight = weights.get(s.data_source) || 1.0;
        outcomeVotes[s.winning_team] += weight;
        totalWeight += weight;
      }
    }

    let outcome: WinningTeam | null = null;
    let winningWeight = 0;
    for (const [team, weight] of Object.entries(outcomeVotes)) {
      if (weight > winningWeight) {
        outcome = team as WinningTeam;
        winningWeight = weight;
      }
    }
    // A majority requires strictly more than half of total eligible weight;
    // every weight equal qualifies only as a tie otherwise.
    if (outcome && winningWeight <= totalWeight / 2) {
      outcome = null;
    }

    const minimumRequired = this.readNumberConfig(
      'ORACLE_CONSENSUS_MIN_SOURCES',
      OracleService.DEFAULT_MIN_CONSENSUS_SOURCES,
    );

    let reason = 'majority_reached';
    if (eligible.length < minimumRequired) {
      reason = 'insufficient_sources';
    } else if (!outcome) {
      reason = 'vote_tie';
    }

    return {
      match_id: matchId,
      can_auto_finalize:
        reason === 'majority_reached' ? Boolean(outcome) : false,
      outcome,
      eligible_participants: eligible.length,
      minimum_required: minimumRequired,
      outcome_votes: outcomeVotes,
      confidence_median: this.medianConfidence(eligible),
      quarantined_count: quarantined.length,
      quarantined_submissions: quarantined.map((s) => this.toSummary(s)),
      eligible_submissions: eligible.map((s) => this.toSummary(s)),
      reason,
    };
  }

  private medianConfidence(submissions: OracleSubmission[]): number | null {
    const values = submissions
      .map((s) => Number(s.confidence_score))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return null;
    }

    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  }

  private toSummary(s: OracleSubmission): ConsensusSubmissionSummary {
    return {
      id: s.id,
      data_source: s.data_source,
      winning_team: s.winning_team,
      confidence_score: s.confidence_score,
      is_anomaly: s.is_anomaly ?? false,
      review_status: s.review_status,
    };
  }

  /** Read a positive-number config value with a fallback (#1611). */
  private readNumberConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
