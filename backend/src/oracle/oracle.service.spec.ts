import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OracleService } from './oracle.service';
import { OracleReliabilityService } from './oracle-reliability.service';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import { CreatorEvent } from '../creator-events/entities/creator-event.entity';
import { MatchResultDivergence } from '../matches/entities/match-result-divergence.entity';
import {
  OracleSubmission,
  SubmissionReviewStatus,
  SubmissionStatus,
  WinningTeam,
} from './entities/oracle-submission.entity';
import { ListPendingMatchesQueryDto } from './dto/list-pending-matches-query.dto';

type MockRepo = jest.Mocked<
  Pick<Repository<any>, 'findOne' | 'createQueryBuilder' | 'find' | 'findByIds'>
>;

function createMockQueryBuilder<T>(
  returnValue: any,
): Partial<SelectQueryBuilder<T>> {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue(returnValue),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  } as unknown as Partial<SelectQueryBuilder<T>>;
}

describe('OracleService', () => {
  let service: OracleService;
  let matchRepo: MockRepo;
  let eventRepo: MockRepo;
  let divergenceRepo: MockRepo;
  let submissionRepo: MockRepo;
  let reliabilityService: jest.Mocked<OracleReliabilityService>;
  let configValues: Record<string, string | number | undefined>;

  const mockEvent = {
    id: 'event-1',
    on_chain_event_id: '1',
    title: 'World Cup Final',
    creator_address: 'GCREATOR',
  } as CreatorEvent;

  const mockMatches = [
    {
      id: 'match-1',
      on_chain_match_id: '101',
      event_id: 'event-1',
      team_a: 'Team Alpha',
      team_b: 'Team Beta',
      match_time: new Date('2026-01-01T08:00:00Z'),
      result_submitted: false,
      prediction_count: 15,
      created_at: new Date('2025-12-25T10:00:00Z'),
    },
    {
      id: 'match-2',
      on_chain_match_id: '102',
      event_id: 'event-1',
      team_a: 'Team Gamma',
      team_b: 'Team Delta',
      match_time: new Date('2026-01-01T09:00:00Z'),
      result_submitted: false,
      prediction_count: 10,
      created_at: new Date('2025-12-25T11:00:00Z'),
    },
  ] as CreatorEventMatch[];

  beforeEach(async () => {
    matchRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    eventRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    divergenceRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    submissionRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    configValues = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        { provide: getRepositoryToken(CreatorEventMatch), useValue: matchRepo },
        { provide: getRepositoryToken(CreatorEvent), useValue: eventRepo },
        {
          provide: getRepositoryToken(MatchResultDivergence),
          useValue: divergenceRepo,
        },
        {
          provide: getRepositoryToken(OracleSubmission),
          useValue: submissionRepo,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: OracleReliabilityService,
          useValue: {
            getWeight: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
    reliabilityService = module.get(
      OracleReliabilityService,
    ) as jest.Mocked<OracleReliabilityService>;
    eventRepo.find.mockResolvedValue([mockEvent]);
  });

  describe('getPendingMatches', () => {
    it('should return only matches that have started and not been resolved', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([mockMatches, 2]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(qb.where).toHaveBeenCalledWith(
        'm.match_time < :now',
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'm.result_submitted = :submitted',
        { submitted: false },
      );
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should exclude future matches and already-submitted matches', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const oneHourLater = new Date(now.getTime() + 3600000);

      const pastUnsubmittedMatch = {
        id: 'match-past-unsubmitted',
        on_chain_match_id: '201',
        event_id: 'event-1',
        team_a: 'Team A',
        team_b: 'Team B',
        match_time: oneHourAgo,
        result_submitted: false,
        prediction_count: 5,
        created_at: new Date(oneHourAgo.getTime() - 86400000),
      } as CreatorEventMatch;

      const pastSubmittedMatch = {
        id: 'match-past-submitted',
        on_chain_match_id: '202',
        event_id: 'event-1',
        team_a: 'Team C',
        team_b: 'Team D',
        match_time: oneHourAgo,
        result_submitted: true,
        prediction_count: 10,
        created_at: new Date(oneHourAgo.getTime() - 86400000),
      } as CreatorEventMatch;

      const futureUnsubmittedMatch = {
        id: 'match-future-unsubmitted',
        on_chain_match_id: '203',
        event_id: 'event-1',
        team_a: 'Team E',
        team_b: 'Team F',
        match_time: oneHourLater,
        result_submitted: false,
        prediction_count: 8,
        created_at: new Date(),
      } as CreatorEventMatch;

      const futureSubmittedMatch = {
        id: 'match-future-submitted',
        on_chain_match_id: '204',
        event_id: 'event-1',
        team_a: 'Team G',
        team_b: 'Team H',
        match_time: oneHourLater,
        result_submitted: true,
        prediction_count: 12,
        created_at: new Date(),
      } as CreatorEventMatch;

      const qb = createMockQueryBuilder<CreatorEvent>([
        [pastUnsubmittedMatch],
        1,
      ]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].match.id).toBe('match-past-unsubmitted');
      expect(result.data[0].match.result_submitted).toBe(false);

      expect(qb.where).toHaveBeenCalledWith(
        'm.match_time < :now',
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'm.result_submitted = :submitted',
        { submitted: false },
      );
    });

    it('should calculate time_since_match_started_seconds correctly and non-negative', async () => {
      const now = new Date();
      const fiftySecondsAgo = new Date(now.getTime() - 50000);

      const recentMatch = {
        id: 'match-recent',
        on_chain_match_id: '205',
        event_id: 'event-1',
        team_a: 'Team I',
        team_b: 'Team J',
        match_time: fiftySecondsAgo,
        result_submitted: false,
        prediction_count: 3,
        created_at: new Date(fiftySecondsAgo.getTime() - 3600000),
      } as CreatorEventMatch;

      const qb = createMockQueryBuilder<CreatorEvent>([[recentMatch], 1]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(result.data).toHaveLength(1);
      const timeSinceStarted = result.data[0].time_since_match_started_seconds;
      expect(timeSinceStarted).toBeGreaterThanOrEqual(0);
      expect(timeSinceStarted).toBeLessThanOrEqual(60);
    });

    it('should return empty array when no pending matches', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([[], 0]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should sort matches by match_time ascending (oldest first)', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([mockMatches, 2]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      await service.getPendingMatches(new ListPendingMatchesQueryDto());

      expect(qb.orderBy).toHaveBeenCalledWith('m.match_time', 'ASC');
    });

    it('should include event details in response', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([mockMatches, 2]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(result.data[0].event.title).toBe('World Cup Final');
      expect(result.data[0].event.creator_address).toBe('GCREATOR');
      expect(result.data[0].match.team_a).toBe('Team Alpha');
      expect(result.data[0].match.team_b).toBe('Team Beta');
    });

    it('should include time_since_match_started_seconds', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([mockMatches, 2]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches(
        new ListPendingMatchesQueryDto(),
      );

      expect(result.data[0].time_since_match_started_seconds).toBeGreaterThan(
        0,
      );
    });

    it('should handle pagination', async () => {
      const qb = createMockQueryBuilder<CreatorEvent>([mockMatches, 2]);
      matchRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<CreatorEvent>,
      );

      const result = await service.getPendingMatches({ page: 1, limit: 5 });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
    });
  });

  describe('getStats', () => {
    function makeCountQb(count: number): Partial<SelectQueryBuilder<any>> {
      return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(count),
      } as unknown as Partial<SelectQueryBuilder<any>>;
    }

    it('should return correct pending, resolved, and overdue counts', async () => {
      const pendingQb = makeCountQb(3);
      const resolvedQb = makeCountQb(10);
      const overdueQb = makeCountQb(2);

      matchRepo.createQueryBuilder
        .mockReturnValueOnce(pendingQb as unknown as SelectQueryBuilder<any>)
        .mockReturnValueOnce(resolvedQb as unknown as SelectQueryBuilder<any>)
        .mockReturnValueOnce(overdueQb as unknown as SelectQueryBuilder<any>);

      const result = await service.getStats();

      expect(result).toEqual({ pending: 3, resolved: 10, overdue: 2 });
    });

    it('should return zeros when no matches exist', async () => {
      const zeroQb = makeCountQb(0);
      matchRepo.createQueryBuilder
        .mockReturnValueOnce(zeroQb as unknown as SelectQueryBuilder<any>)
        .mockReturnValueOnce(
          makeCountQb(0) as unknown as SelectQueryBuilder<any>,
        )
        .mockReturnValueOnce(
          makeCountQb(0) as unknown as SelectQueryBuilder<any>,
        );

      const result = await service.getStats();

      expect(result).toEqual({ pending: 0, resolved: 0, overdue: 0 });
    });

    it('should filter pending matches between now and 24h ago', async () => {
      const pendingQb = makeCountQb(5) as any;
      const resolvedQb = makeCountQb(0) as any;
      const overdueQb = makeCountQb(0) as any;

      matchRepo.createQueryBuilder
        .mockReturnValueOnce(pendingQb)
        .mockReturnValueOnce(resolvedQb)
        .mockReturnValueOnce(overdueQb);

      await service.getStats();

      expect(pendingQb.where).toHaveBeenCalledWith(
        'm.match_time < :now',
        expect.any(Object),
      );
      expect(pendingQb.andWhere).toHaveBeenCalledWith(
        'm.result_submitted = :submitted',
        { submitted: false },
      );
      expect(pendingQb.andWhere).toHaveBeenCalledWith(
        'm.match_time >= :threshold',
        expect.any(Object),
      );
    });

    it('should filter overdue matches as past 24h with no result', async () => {
      const pendingQb = makeCountQb(0) as any;
      const resolvedQb = makeCountQb(0) as any;
      const overdueQb = makeCountQb(4) as any;

      matchRepo.createQueryBuilder
        .mockReturnValueOnce(pendingQb)
        .mockReturnValueOnce(resolvedQb)
        .mockReturnValueOnce(overdueQb);

      await service.getStats();

      expect(overdueQb.where).toHaveBeenCalledWith(
        'm.match_time < :threshold',
        expect.any(Object),
      );
      expect(overdueQb.andWhere).toHaveBeenCalledWith(
        'm.result_submitted = :submitted',
        { submitted: false },
      );
    });

    it('should filter resolved matches by result_submitted = true', async () => {
      const pendingQb = makeCountQb(0) as any;
      const resolvedQb = makeCountQb(7) as any;
      const overdueQb = makeCountQb(0) as any;

      matchRepo.createQueryBuilder
        .mockReturnValueOnce(pendingQb)
        .mockReturnValueOnce(resolvedQb)
        .mockReturnValueOnce(overdueQb);

      await service.getStats();

      expect(resolvedQb.where).toHaveBeenCalledWith(
        'm.result_submitted = :submitted',
        { submitted: true },
      );
    });
  });

  describe('getDivergences', () => {
    it('returns paginated unresolved divergences ordered by most recent', async () => {
      const rows = [
        {
          id: 'div-1',
          match: { id: 'match-1' },
          source_a_name: 'match_submitted_result',
          source_a_value: { home_score: 1 },
          source_b_name: 'external_feed',
          source_b_value: { home_score: 2 },
          created_at: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'div-2',
          match: { id: 'match-2' },
          source_a_name: 'queued_external_result',
          source_a_value: { home_score: 3 },
          source_b_name: 'external_feed',
          source_b_value: { home_score: 4 },
          created_at: new Date('2026-01-02T00:00:00Z'),
        },
      ];
      const qb = createMockQueryBuilder<MatchResultDivergence>([rows, 2]);
      divergenceRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<MatchResultDivergence>,
      );

      const result = await service.getDivergences({ page: 1, limit: 20 });

      expect(qb.where).toHaveBeenCalledWith('d.resolved = false');
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'div-1', match_id: 'match-1' }),
      );
    });

    it('returns an empty page when there are no unresolved divergences', async () => {
      const qb = createMockQueryBuilder<MatchResultDivergence>([[], 0]);
      divergenceRepo.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<MatchResultDivergence>,
      );

      const result = await service.getDivergences({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── Consensus auto-finalization gating (#1611) ──────────────────────────────

  describe('getMatchConsensus', () => {
    let nextId: number;

    const baseSubmission = (): OracleSubmission =>
      ({
        id: '',
        match_id: '123',
        team_a: 'Team A',
        team_b: 'Team B',
        data_source: 'https://api.example.com',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 92,
        result_timestamp: new Date(),
        status: SubmissionStatus.SUBMITTED,
        retry_count: 0,
        is_anomaly: false,
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
        created_at: new Date(),
      }) as OracleSubmission;

    const makeSubmission = (
      overrides: Partial<OracleSubmission> = {},
    ): OracleSubmission => ({
      ...baseSubmission(),
      id: `sub-${++nextId}`,
      ...overrides,
    });

    beforeEach(() => {
      nextId = 0;
    });

    it('excludes quarantined submissions from the auto-finalization consensus', async () => {
      const normalA = makeSubmission({ confidence_score: 95 });
      const normalB = makeSubmission({
        data_source: 'https://alt.example.com',
        confidence_score: 93,
      });
      // An anomaly held for review votes TEAM_B with a deviant score — it must
      // have zero influence on the finalizable outcome.
      const heldOutlier = makeSubmission({
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 12,
        is_anomaly: true,
        review_status: SubmissionReviewStatus.HELD,
      });
      submissionRepo.find.mockResolvedValue([normalA, normalB, heldOutlier]);

      const result = await service.getMatchConsensus('123');

      expect(result.quarantined_count).toBe(1);
      expect(result.quarantined_submissions).toEqual([
        expect.objectContaining({
          id: heldOutlier.id,
          review_status: SubmissionReviewStatus.HELD,
        }),
      ]);
      expect(result.eligible_participants).toBe(2);
      expect(result.outcome_votes[WinningTeam.TEAM_A]).toBe(2);
      expect(result.outcome_votes[WinningTeam.TEAM_B]).toBe(0);
      expect(result.outcome).toBe(WinningTeam.TEAM_A);
      expect(result.confidence_median).toBeCloseTo(94, 6);
      expect(result.can_auto_finalize).toBe(true);
      expect(result.reason).toBe('majority_reached');
    });

    it('blocks auto-finalization when quarantine leaves too few eligible sources', async () => {
      submissionRepo.find.mockResolvedValue([
        makeSubmission({
          is_anomaly: true,
          review_status: SubmissionReviewStatus.HELD,
        }),
      ]);

      const result = await service.getMatchConsensus('123');

      expect(result.can_auto_finalize).toBe(false);
      expect(result.eligible_participants).toBe(0);
      expect(result.minimum_required).toBe(2);
      expect(result.outcome).toBeNull();
      expect(result.reason).toBe('insufficient_sources');
    });

    it('keeps admin-approved anomalies in consensus but excludes rejected ones', async () => {
      const approved = makeSubmission({
        id: 'sub-approved',
        is_anomaly: true,
        review_status: SubmissionReviewStatus.APPROVED,
        confidence_score: 91,
      });
      const rejected = makeSubmission({
        id: 'sub-rejected',
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 5,
        status: SubmissionStatus.FAILED,
        is_anomaly: true,
        review_status: SubmissionReviewStatus.REJECTED,
      });
      const fresh = makeSubmission({ confidence_score: 94 });
      submissionRepo.find.mockResolvedValue([approved, rejected, fresh]);

      const result = await service.getMatchConsensus('123');

      expect(result.quarantined_count).toBe(1);
      expect(result.eligible_submissions.map((s) => s.id)).toEqual([
        approved.id,
        fresh.id,
      ]);
      expect(result.eligible_participants).toBe(2);
      expect(result.outcome).toBe(WinningTeam.TEAM_A);
      expect(result.can_auto_finalize).toBe(true);
    });

    it('reports a tie vote and blocks auto-finalization without a majority', async () => {
      submissionRepo.find.mockResolvedValue([
        makeSubmission({ winning_team: WinningTeam.TEAM_A }),
        makeSubmission({ winning_team: WinningTeam.TEAM_B }),
      ]);

      const result = await service.getMatchConsensus('123');

      expect(result.outcome).toBeNull();
      expect(result.can_auto_finalize).toBe(false);
      expect(result.reason).toBe('vote_tie');
    });

    it('honors a higher configurable minimum source count', async () => {
      configValues['ORACLE_CONSENSUS_MIN_SOURCES'] = '3';
      submissionRepo.find.mockResolvedValue([
        makeSubmission(),
        makeSubmission(),
      ]);

      const result = await service.getMatchConsensus('123');

      // Unanimous majority among two eligible sources, but the configured floor
      // requires three before auto-finalization may proceed.
      expect(result.outcome).toBe(WinningTeam.TEAM_A);
      expect(result.can_auto_finalize).toBe(false);
      expect(result.reason).toBe('insufficient_sources');
    });

    it('weights consensus by oracle reliability scores (#1765)', async () => {
      // High-reliability oracle votes TEAM_A
      const highReliable = makeSubmission({
        id: 'sub-high-reliable',
        data_source: 'oracle-high',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
      });

      // Low-reliability oracle votes TEAM_B
      const lowReliable = makeSubmission({
        id: 'sub-low-reliable',
        data_source: 'oracle-low',
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 85,
      });

      // Fresh oracle (no history) votes TEAM_B
      const newOracle = makeSubmission({
        id: 'sub-new',
        data_source: 'oracle-new',
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 88,
      });

      submissionRepo.find.mockResolvedValue([
        highReliable,
        lowReliable,
        newOracle,
      ]);

      // High-reliability oracle has weight 0.9
      reliabilityService.getWeight.mockImplementation(async (source: string) => {
        if (source === 'oracle-high') return 0.9;
        if (source === 'oracle-low') return 0.2;
        if (source === 'oracle-new') return 1.0; // default neutral weight
        return 1.0;
      });

      const result = await service.getMatchConsensus('match-123');

      // Weighted votes:
      // TEAM_A: 0.9 (high-reliable)
      // TEAM_B: 0.2 (low-reliable) + 1.0 (new) = 1.2
      // Total weight: 2.1
      // TEAM_B wins with 1.2/2.1 > 0.5
      expect(result.outcome).toBe(WinningTeam.TEAM_B);
      expect(result.can_auto_finalize).toBe(true);
      expect(result.eligible_participants).toBe(3);
    });

    it('prevents single high-reliability oracle from unilaterally deciding outcome', async () => {
      // High-reliability oracle votes TEAM_A
      const perfect = makeSubmission({
        id: 'sub-perfect',
        data_source: 'oracle-perfect',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 99,
      });

      // Low-reliability oracle votes TEAM_B
      const unreliable = makeSubmission({
        id: 'sub-unreliable',
        data_source: 'oracle-unreliable',
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 50,
      });

      submissionRepo.find.mockResolvedValue([perfect, unreliable]);

      reliabilityService.getWeight.mockImplementation(async (source: string) => {
        if (source === 'oracle-perfect') return 1.0; // perfect history
        if (source === 'oracle-unreliable') return 0.5; // mediocre
        return 1.0;
      });

      const result = await service.getMatchConsensus('match-456');

      // Weighted votes:
      // TEAM_A: 1.0 (perfect)
      // TEAM_B: 0.5 (unreliable)
      // Total: 1.5
      // TEAM_A wins with 1.0/1.5 = 0.667 > 0.5 ✓
      expect(result.outcome).toBe(WinningTeam.TEAM_A);
      expect(result.can_auto_finalize).toBe(true);
    });

    it('detects tie in weighted consensus when weights split exactly 50/50', async () => {
      const oracleA = makeSubmission({
        id: 'sub-a',
        data_source: 'oracle-a',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 90,
      });

      const oracleB = makeSubmission({
        id: 'sub-b',
        data_source: 'oracle-b',
        winning_team: WinningTeam.TEAM_B,
        confidence_score: 90,
      });

      submissionRepo.find.mockResolvedValue([oracleA, oracleB]);

      reliabilityService.getWeight.mockResolvedValue(1.0); // equal weights

      const result = await service.getMatchConsensus('match-tie');

      // Weighted votes both equal 1.0 each
      // Total = 2.0
      // No winner > 0.5 of total
      expect(result.outcome).toBeNull();
      expect(result.can_auto_finalize).toBe(false);
      expect(result.reason).toBe('vote_tie');
    });
  });
});
