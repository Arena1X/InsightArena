import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookService } from './webhook.service';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import {
  OracleSubmission,
  SubmissionReviewStatus,
  SubmissionStatus,
} from './entities/oracle-submission.entity';
import { ConfigService } from '@nestjs/config';
import { SubmissionHistoryService } from './submission-history.service';
import {
  WebhookMatchResultDto,
  WinningTeam,
} from './dto/webhook-match-result.dto';
import { ReviewDecision } from './dto/anomaly-detection.dto';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('WebhookService', () => {
  let service: WebhookService;

  const mockMatch = {
    id: 'match-1',
    on_chain_match_id: '123',
    team_a: 'Team A',
    team_b: 'Team B',
    match_time: new Date(Date.now() - 3600000),
    result_submitted: false,
    winning_team: null,
    prediction_count: 10,
    created_at: new Date(),
  };

  const mockMatchRepository = {
    findOne: jest.fn().mockResolvedValue(mockMatch),
    save: jest.fn().mockResolvedValue(mockMatch),
  };

  const mockSubmissionRepository = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  // Default screening: nothing flagged, nothing held. Individual tests override.
  const mockSubmissionHistoryService = {
    screenSubmission: jest.fn().mockResolvedValue({
      flagged: false,
      held: false,
      evaluation: {},
    }),
  };

  beforeEach(async () => {
    mockSubmissionHistoryService.screenSubmission.mockResolvedValue({
      flagged: false,
      held: false,
      evaluation: {},
    });
    mockSubmissionRepository.create.mockReturnValue({});
    mockSubmissionRepository.save.mockImplementation((s) => Promise.resolve(s));
    mockMatchRepository.findOne.mockResolvedValue(mockMatch);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(CreatorEventMatch),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(OracleSubmission),
          useValue: mockSubmissionRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WEBHOOK_SECRET') return 'test-secret';
              return null;
            }),
          },
        },
        {
          provide: SubmissionHistoryService,
          useValue: mockSubmissionHistoryService,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMatchResult', () => {
    it('should accept valid match result and return job ID', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.processMatchResult(dto);

      expect(result).toHaveProperty('job_id');
      expect(result.status).toBe('accepted');
      expect(result.message).toBe('Match result queued for submission');
    });

    it('should throw NotFoundException if match does not exist', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '999',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/999',
        timestamp: new Date().toISOString(),
      };

      mockMatchRepository.findOne.mockResolvedValue(null);

      await expect(service.processMatchResult(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if match already resolved', async () => {
      const resolvedMatch = { ...mockMatch, result_submitted: true };
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      mockMatchRepository.findOne.mockResolvedValue(resolvedMatch);

      await expect(service.processMatchResult(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if match has not started', async () => {
      const futureMatch = {
        ...mockMatch,
        match_time: new Date(Date.now() + 7200000),
      };
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      mockMatchRepository.findOne.mockResolvedValue(futureMatch);

      await expect(service.processMatchResult(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should accept match result if match time is within 1 hour buffer', async () => {
      const futureMatch = {
        ...mockMatch,
        match_time: new Date(Date.now() + 1800000),
      };
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      mockMatchRepository.findOne.mockResolvedValue(futureMatch);
      jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.processMatchResult(dto);

      expect(result.status).toBe('accepted');
    });
  });

  describe('retry logic', () => {
    it('should retry failed submissions', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockRejectedValueOnce(new Error('Submission failed'))
        .mockResolvedValue(undefined);

      const result = await service.processMatchResult(dto);

      expect(result.status).toBe('accepted');

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.total).toBeGreaterThan(0);
    });

    it('should remove job after max retries', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockRejectedValue(new Error('Submission failed'));

      await service.processMatchResult(dto);

      const jobId = service.getQueueStatus().jobs[0].id;
      for (let i = 0; i < 4; i++) {
        const job = service.getJobStatus(jobId);
        if (job) {
          await service['submitToOracle'](job);
        }
      }

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.total).toBe(0);
    });
  });

  describe('queue status', () => {
    it('should return queue status', () => {
      const status = service.getQueueStatus();

      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('retrying');
      expect(status).toHaveProperty('jobs');
      expect(Array.isArray(status.jobs)).toBe(true);
    });

    it('should return job status by ID', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 95,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      jest
        .spyOn(service as any, 'submitToOracle')
        .mockImplementation(async () => {
          // Do nothing to keep the job in the queue
        });

      const result = await service.processMatchResult(dto);
      const job = service.getJobStatus(result.job_id);

      expect(job).not.toBeNull();
      expect(job?.matchId).toBe('123');
    });

    it('should return null for non-existent job ID', () => {
      const job = service.getJobStatus('non-existent-job-id');
      expect(job).toBeNull();
    });
  });

  // ── Anomaly hold & review (#1364) ─────────────────────────────────────────

  describe('anomaly screening on intake', () => {
    it('holds a flagged submission instead of submitting it', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 5,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      mockSubmissionRepository.save.mockResolvedValue({
        id: 'sub-held',
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
      });
      mockSubmissionHistoryService.screenSubmission.mockResolvedValue({
        flagged: true,
        held: true,
        evaluation: {},
      });
      const submitSpy = jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.processMatchResult(dto);

      expect(result.status).toBe('held');
      expect(submitSpy).not.toHaveBeenCalled();
      // A held submission is not left in the retry queue.
      expect(service.getJobStatus(result.job_id)).toBeNull();
    });

    it('submits a flagged-but-not-held submission normally', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: '123',
        winning_team: WinningTeam.TEAM_A,
        confidence_score: 5,
        data_source: 'https://api.example.com/match/123',
        timestamp: new Date().toISOString(),
      };

      mockSubmissionRepository.save.mockResolvedValue({ id: 'sub-flag-only' });
      mockSubmissionHistoryService.screenSubmission.mockResolvedValue({
        flagged: true,
        held: false,
        evaluation: {},
      });
      jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.processMatchResult(dto);

      expect(result.status).toBe('accepted');
    });
  });

  describe('reviewSubmission', () => {
    const heldSubmission = {
      id: 'sub-held',
      match_id: '123',
      winning_team: WinningTeam.TEAM_A,
      confidence_score: 5,
      data_source: 'https://api.example.com/match/123',
      result_timestamp: new Date(),
      metadata: null,
      status: SubmissionStatus.PENDING,
      review_status: SubmissionReviewStatus.HELD,
    };

    it('approves a held submission and queues it for on-chain use', async () => {
      mockSubmissionRepository.findOne.mockResolvedValue({ ...heldSubmission });
      const submitSpy = jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.reviewSubmission('sub-held', {
        decision: ReviewDecision.APPROVE,
        reviewer: 'admin-1',
      });

      expect(result.review_status).toBe(SubmissionReviewStatus.APPROVED);
      expect(result.submitted).toBe(true);
      expect(submitSpy).toHaveBeenCalled();
    });

    it('rejects a held submission without submitting it', async () => {
      mockSubmissionRepository.findOne.mockResolvedValue({ ...heldSubmission });
      const submitSpy = jest
        .spyOn(service as any, 'simulateOracleSubmission')
        .mockResolvedValue(undefined);

      const result = await service.reviewSubmission('sub-held', {
        decision: ReviewDecision.REJECT,
        reviewer: 'admin-1',
        note: 'value looks wrong',
      });

      expect(result.review_status).toBe(SubmissionReviewStatus.REJECTED);
      expect(result.submitted).toBe(false);
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown submission', async () => {
      mockSubmissionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reviewSubmission('missing', {
          decision: ReviewDecision.APPROVE,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Conflict when the submission is not held', async () => {
      mockSubmissionRepository.findOne.mockResolvedValue({
        ...heldSubmission,
        review_status: SubmissionReviewStatus.NOT_REQUIRED,
      });

      await expect(
        service.reviewSubmission('sub-held', {
          decision: ReviewDecision.APPROVE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
