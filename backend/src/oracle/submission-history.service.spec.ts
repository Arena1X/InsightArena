import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SubmissionHistoryService } from './submission-history.service';
import {
  OracleSubmission,
  SubmissionStatus,
  SubmissionReviewStatus,
} from './entities/oracle-submission.entity';
import { OracleSubmissionFlag } from './entities/oracle-submission-flag.entity';
import { GetSubmissionsQueryDto } from './dto/submission-history.dto';

describe('SubmissionHistoryService', () => {
  let service: SubmissionHistoryService;
  let submissionRepository: Repository<OracleSubmission>;
  let flagRepository: Repository<OracleSubmissionFlag>;
  let configValues: Record<string, string | number | undefined>;

  const mockSubmission: OracleSubmission = {
    id: 'sub-1',
    match_id: '123',
    team_a: 'Team A',
    team_b: 'Team B',
    winning_team: 'TEAM_A' as any,
    confidence_score: 95,
    data_source: 'https://api.example.com',
    result_timestamp: new Date(),
    metadata: null,
    status: SubmissionStatus.SUBMITTED,
    transaction_hash: 'tx_abc123',
    submitted_at: new Date(),
    error_message: null,
    retry_count: 0,
    submission_time_ms: 150,
    is_anomaly: false,
    anomaly_score: null,
    review_status: SubmissionReviewStatus.NOT_REQUIRED,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date(),
  } as OracleSubmission;

  /** Build `count` history rows for a data source, all with confidence `value`. */
  const historyRows = (
    value: number,
    count: number,
    source = 'https://api.example.com',
  ): OracleSubmission[] =>
    Array.from({ length: count }, (_, i) => ({
      ...mockSubmission,
      id: `hist-${i}`,
      confidence_score: value,
      data_source: source,
    }));

  const buildService = async (
    config: Record<string, string | number | undefined> = {},
  ) => {
    configValues = config;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionHistoryService,
        {
          provide: getRepositoryToken(OracleSubmission),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(OracleSubmissionFlag),
          useClass: Repository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<SubmissionHistoryService>(SubmissionHistoryService);
    submissionRepository = module.get<Repository<OracleSubmission>>(
      getRepositoryToken(OracleSubmission),
    );
    flagRepository = module.get<Repository<OracleSubmissionFlag>>(
      getRepositoryToken(OracleSubmissionFlag),
    );
  };

  beforeEach(async () => {
    await buildService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSubmissions', () => {
    it('should return paginated submissions with statistics', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 20,
      };

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([[mockSubmission], 1]);
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue([mockSubmission]);

      const result = await service.getSubmissions(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('statistics');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 20,
        status: SubmissionStatus.SUBMITTED,
      };

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([[mockSubmission], 1]);
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue([mockSubmission]);

      const result = await service.getSubmissions(query);

      expect(submissionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SubmissionStatus.SUBMITTED,
          }),
        }),
      );
    });

    it('should filter by match ID', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 20,
        matchId: '123',
      };

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([[mockSubmission], 1]);
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue([mockSubmission]);

      const result = await service.getSubmissions(query);

      expect(submissionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            match_id: '123',
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 20,
        dateFrom: '2024-01-01T00:00:00Z',
        dateTo: '2024-12-31T23:59:59Z',
      };

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([[mockSubmission], 1]);
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue([mockSubmission]);

      const result = await service.getSubmissions(query);

      expect(submissionRepository.findAndCount).toHaveBeenCalled();
    });

    it('should calculate statistics correctly', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 20,
      };

      const submissions = [
        { ...mockSubmission, status: SubmissionStatus.SUBMITTED },
        { ...mockSubmission, id: 'sub-2', status: SubmissionStatus.FAILED },
        { ...mockSubmission, id: 'sub-3', status: SubmissionStatus.PENDING },
      ];

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([submissions, 3]);
      jest.spyOn(submissionRepository, 'find').mockResolvedValue(submissions);

      const result = await service.getSubmissions(query);

      expect(result.statistics).toHaveProperty('total_submissions', 3);
      expect(result.statistics).toHaveProperty('successful_submissions', 1);
      expect(result.statistics).toHaveProperty('failed_submissions', 1);
      expect(result.statistics).toHaveProperty('pending_submissions', 1);
      expect(result.statistics).toHaveProperty('success_rate');
      expect(result.statistics).toHaveProperty('average_submission_time_ms');
      expect(result.statistics).toHaveProperty('submissions_by_status');
    });

    it('should limit results to 100 per page', async () => {
      const query: GetSubmissionsQueryDto = {
        page: 1,
        limit: 200, // Request more than max
      };

      jest
        .spyOn(submissionRepository, 'findAndCount')
        .mockResolvedValue([[mockSubmission], 1]);
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue([mockSubmission]);

      const result = await service.getSubmissions(query);

      expect(result.limit).toBe(100);
      expect(submissionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  describe('getSubmissionById', () => {
    it('should return submission by ID', async () => {
      jest
        .spyOn(submissionRepository, 'findOne')
        .mockResolvedValue(mockSubmission);

      const result = await service.getSubmissionById('sub-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('sub-1');
    });

    it('should return null for non-existent submission', async () => {
      jest.spyOn(submissionRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getSubmissionById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── Anomaly detection (#1364) ─────────────────────────────────────────────

  describe('evaluateAnomaly', () => {
    // Baseline of 10 samples at confidence 90 → mean 90, stddev 0. Add a small
    // spread so stddev is a clean 2.0: five 88s and five 92s → mean 90, stddev 2.
    const spreadBaseline = (): OracleSubmission[] => [
      ...historyRows(88, 5),
      ...historyRows(92, 5),
    ];

    it('does not flag a value within the threshold band (normal)', async () => {
      await buildService({ ORACLE_ANOMALY_THRESHOLD: 3 });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());

      // mean 90, stddev 2. Value 93 → z = 1.5, well within threshold 3.
      const result = await service.evaluateAnomaly(
        'https://api.example.com',
        93,
      );

      expect(result.mean).toBe(90);
      expect(result.stddev).toBe(2);
      expect(result.zScore).toBeCloseTo(1.5, 6);
      expect(result.isAnomaly).toBe(false);
      expect(result.reason).toBe('within_threshold');
    });

    it('flags a value deviating beyond the threshold (outlier)', async () => {
      await buildService({ ORACLE_ANOMALY_THRESHOLD: 3 });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());

      // mean 90, stddev 2. Value 20 → z = 35, far beyond threshold 3.
      const result = await service.evaluateAnomaly(
        'https://api.example.com',
        20,
      );

      expect(result.zScore).toBeCloseTo(35, 6);
      expect(result.isAnomaly).toBe(true);
      expect(result.reason).toBe('deviation_exceeds_threshold');
    });

    it('does not flag a value exactly at the threshold (edge)', async () => {
      await buildService({ ORACLE_ANOMALY_THRESHOLD: 3 });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());

      // mean 90, stddev 2, threshold 3 → boundary value = 90 + 3*2 = 96 (z = 3).
      const atThreshold = await service.evaluateAnomaly(
        'https://api.example.com',
        96,
      );
      expect(atThreshold.zScore).toBeCloseTo(3, 6);
      expect(atThreshold.isAnomaly).toBe(false);

      // Just beyond the boundary → flagged.
      const justBeyond = await service.evaluateAnomaly(
        'https://api.example.com',
        96.01,
      );
      expect(justBeyond.zScore).toBeGreaterThan(3);
      expect(justBeyond.isAnomaly).toBe(true);
    });

    it('does not flag when there are too few samples for a baseline', async () => {
      await buildService({
        ORACLE_ANOMALY_THRESHOLD: 3,
        ORACLE_ANOMALY_MIN_SAMPLES: 5,
      });
      // Only 4 prior submissions — below the min-samples floor.
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(historyRows(90, 4));

      const result = await service.evaluateAnomaly(
        'https://api.example.com',
        1,
      );

      expect(result.isAnomaly).toBe(false);
      expect(result.zScore).toBeNull();
      expect(result.reason).toBe('insufficient_samples');
    });

    it('flags a differing value against a zero-variance baseline', async () => {
      await buildService({ ORACLE_ANOMALY_THRESHOLD: 3 });
      // All prior submissions identical → stddev 0.
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(historyRows(90, 8));

      const outlier = await service.evaluateAnomaly(
        'https://api.example.com',
        50,
      );
      expect(outlier.stddev).toBe(0);
      expect(outlier.isAnomaly).toBe(true);
      expect(outlier.reason).toBe('zero_variance_outlier');

      const equal = await service.evaluateAnomaly(
        'https://api.example.com',
        90,
      );
      expect(equal.isAnomaly).toBe(false);
      expect(equal.reason).toBe('within_threshold');
    });

    it('excludes the submission under evaluation from its own baseline', async () => {
      await buildService({ ORACLE_ANOMALY_THRESHOLD: 3 });
      const findSpy = jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());

      await service.evaluateAnomaly('https://api.example.com', 93, 'sub-1');

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            data_source: 'https://api.example.com',
          }),
        }),
      );
    });
  });

  describe('screenSubmission', () => {
    const spreadBaseline = (): OracleSubmission[] => [
      ...historyRows(88, 5),
      ...historyRows(92, 5),
    ];

    it('flags and records an anomaly, holding when hold is enabled', async () => {
      await buildService({
        ORACLE_ANOMALY_THRESHOLD: 3,
        ORACLE_ANOMALY_HOLD: 'true',
      });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());
      const saveSub = jest
        .spyOn(submissionRepository, 'save')
        .mockImplementation((s) => Promise.resolve(s as OracleSubmission));
      const createFlag = jest
        .spyOn(flagRepository, 'create')
        .mockImplementation((f) => f as OracleSubmissionFlag);
      const saveFlag = jest
        .spyOn(flagRepository, 'save')
        .mockImplementation((f) => Promise.resolve(f as OracleSubmissionFlag));

      const submission = {
        ...mockSubmission,
        id: 'sub-outlier',
        confidence_score: 20,
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
      } as OracleSubmission;

      const result = await service.screenSubmission(submission);

      expect(result.flagged).toBe(true);
      expect(result.held).toBe(true);
      expect(submission.is_anomaly).toBe(true);
      expect(submission.review_status).toBe(SubmissionReviewStatus.HELD);
      expect(createFlag).toHaveBeenCalledWith(
        expect.objectContaining({
          submission_id: 'sub-outlier',
          observed_value: 20,
          held: true,
        }),
      );
      expect(saveFlag).toHaveBeenCalled();
      expect(saveSub).toHaveBeenCalled();
    });

    it('flags without holding when hold is disabled', async () => {
      await buildService({
        ORACLE_ANOMALY_THRESHOLD: 3,
        ORACLE_ANOMALY_HOLD: 'false',
      });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());
      jest
        .spyOn(submissionRepository, 'save')
        .mockImplementation((s) => Promise.resolve(s as OracleSubmission));
      jest
        .spyOn(flagRepository, 'create')
        .mockImplementation((f) => f as OracleSubmissionFlag);
      jest
        .spyOn(flagRepository, 'save')
        .mockImplementation((f) => Promise.resolve(f as OracleSubmissionFlag));

      const submission = {
        ...mockSubmission,
        id: 'sub-outlier',
        confidence_score: 20,
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
      } as OracleSubmission;

      const result = await service.screenSubmission(submission);

      expect(result.flagged).toBe(true);
      expect(result.held).toBe(false);
      expect(submission.review_status).toBe(
        SubmissionReviewStatus.NOT_REQUIRED,
      );
    });

    it('does not flag or hold a normal submission', async () => {
      await buildService({
        ORACLE_ANOMALY_THRESHOLD: 3,
        ORACLE_ANOMALY_HOLD: 'true',
      });
      jest
        .spyOn(submissionRepository, 'find')
        .mockResolvedValue(spreadBaseline());
      jest
        .spyOn(submissionRepository, 'save')
        .mockImplementation((s) => Promise.resolve(s as OracleSubmission));
      const saveFlag = jest.spyOn(flagRepository, 'save');

      const submission = {
        ...mockSubmission,
        id: 'sub-normal',
        confidence_score: 91,
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
      } as OracleSubmission;

      const result = await service.screenSubmission(submission);

      expect(result.flagged).toBe(false);
      expect(result.held).toBe(false);
      expect(submission.is_anomaly).toBe(false);
      expect(saveFlag).not.toHaveBeenCalled();
    });
  });

  describe('getFlags', () => {
    const mockFlag: OracleSubmissionFlag = {
      id: 'flag-1',
      submission_id: 'sub-1',
      match_id: '123',
      data_source: 'https://api.example.com',
      observed_value: 20,
      baseline_mean: 90,
      baseline_stddev: 2,
      deviation: 35,
      threshold: 3,
      sample_size: 10,
      held: true,
      reason: 'confidence 20 deviates 35.00σ from baseline mean 90.00',
      created_at: new Date(),
    };

    it('returns paginated flags for admins', async () => {
      jest
        .spyOn(flagRepository, 'findAndCount')
        .mockResolvedValue([[mockFlag], 1]);

      const result = await service.getFlags({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        submission_id: 'sub-1',
        observed_value: 20,
        held: true,
      });
    });

    it('filters flags by data source and held-only', async () => {
      const findAndCount = jest
        .spyOn(flagRepository, 'findAndCount')
        .mockResolvedValue([[mockFlag], 1]);

      await service.getFlags({
        dataSource: 'https://api.example.com',
        heldOnly: true,
      });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            data_source: 'https://api.example.com',
            held: true,
          },
        }),
      );
    });
  });
});
