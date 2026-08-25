import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import { CreatorEvent } from '../creator-events/entities/creator-event.entity';
import { MatchResultDivergence } from '../matches/entities/match-result-divergence.entity';
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

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  constructor(
    @InjectRepository(CreatorEventMatch)
    private readonly matchRepository: Repository<CreatorEventMatch>,
    @InjectRepository(CreatorEvent)
    private readonly eventRepository: Repository<CreatorEvent>,
    @InjectRepository(MatchResultDivergence)
    private readonly divergenceRepository: Repository<MatchResultDivergence>,
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
}
