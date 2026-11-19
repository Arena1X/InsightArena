import { Test, TestingModule } from '@nestjs/testing';
import { OracleController } from './oracle.controller';
import { OracleService } from './oracle.service';
import { WebhookService } from './webhook.service';
import { SubmissionHistoryService } from './submission-history.service';
import { OracleReliabilityService } from './oracle-reliability.service';
import {
  ListPendingMatchesQueryDto,
  PaginatedPendingMatchesResponse,
  OracleStatsResponse,
} from './dto/list-pending-matches-query.dto';
import {
  WebhookMatchResultDto,
  WebhookResponseDto,
} from './dto/webhook-match-result.dto';
import {
  GetSubmissionsQueryDto,
  PaginatedSubmissionsResponse,
} from './dto/submission-history.dto';
import {
  GetFlagsQueryDto,
  PaginatedFlagsResponse,
  ReviewSubmissionDto,
  ReviewResultResponse,
} from './dto/anomaly-detection.dto';
import {
  ListDivergencesQueryDto,
  PaginatedDivergencesResponse,
} from './dto/list-divergences.dto';
import { MatchConsensusResponse } from './dto/match-consensus.dto';

describe('OracleController', () => {
  let controller: OracleController;
  let oracleService: OracleService;
  let webhookService: WebhookService;
  let submissionHistoryService: SubmissionHistoryService;
  let reliabilityService: OracleReliabilityService;

  const mockOracleService = {
    getPendingMatches: jest.fn(),
    getStats: jest.fn(),
    getMatchConsensus: jest.fn(),
    getDivergences: jest.fn(),
  };

  const mockWebhookService = {
    processMatchResult: jest.fn(),
    reviewSubmission: jest.fn(),
  };

  const mockSubmissionHistoryService = {
    getSubmissions: jest.fn(),
    getFlags: jest.fn(),
  };

  const mockReliabilityService = {
    getScores: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OracleController],
      providers: [
        { provide: OracleService, useValue: mockOracleService },
        { provide: WebhookService, useValue: mockWebhookService },
        {
          provide: SubmissionHistoryService,
          useValue: mockSubmissionHistoryService,
        },
        { provide: OracleReliabilityService, useValue: mockReliabilityService },
      ],
    }).compile();

    controller = module.get<OracleController>(OracleController);
    oracleService = module.get<OracleService>(OracleService);
    webhookService = module.get<WebhookService>(WebhookService);
    submissionHistoryService = module.get<SubmissionHistoryService>(
      SubmissionHistoryService,
    );
    reliabilityService = module.get<OracleReliabilityService>(
      OracleReliabilityService,
    );

    jest.clearAllMocks();
  });

  describe('getPendingMatches', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should return paginated pending matches', async () => {
      const query: ListPendingMatchesQueryDto = { page: 1, limit: 10 };
      const response: PaginatedPendingMatchesResponse = {
        data: [
          {
            id: 'match1',
            event_id: 'event1',
            team_a: 'Team A',
            team_b: 'Team B',
            category: 'sports',
            match_date: new Date(),
            submission_status: 'pending',
          },
        ],
        total: 1,
      };

      mockOracleService.getPendingMatches.mockResolvedValue(response);

      const result = await controller.getPendingMatches(query);

      expect(result).toEqual(response);
      expect(oracleService.getPendingMatches).toHaveBeenCalledWith(query);
    });

    it('should pass query parameters to service', async () => {
      const query: ListPendingMatchesQueryDto = { page: 2, limit: 20 };
      mockOracleService.getPendingMatches.mockResolvedValue({
        data: [],
        total: 0,
      });

      await controller.getPendingMatches(query);

      expect(oracleService.getPendingMatches).toHaveBeenCalledWith(query);
    });
  });

  describe('submitMatchResult', () => {
    it('should process match result via webhook', async () => {
      const dto: WebhookMatchResultDto = {
        match_id: 'match1',
        result: 'team_a_wins',
        source: 'sports_oracle',
        event_id: 'event1',
      };
      const response: WebhookResponseDto = {
        message: 'Match result received',
        accepted: true,
      };

      mockWebhookService.processMatchResult.mockResolvedValue(response);

      const result = await controller.submitMatchResult(dto);

      expect(result).toEqual(response);
      expect(webhookService.processMatchResult).toHaveBeenCalledWith(dto);
    });
  });

  describe('getStats', () => {
    it('should return oracle statistics', async () => {
      const stats: OracleStatsResponse = {
        pending: 10,
        resolved: 50,
        overdue: 2,
      };

      mockOracleService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(result).toEqual(stats);
      expect(oracleService.getStats).toHaveBeenCalled();
    });
  });

  describe('getSubmissions', () => {
    it('should return submission history', async () => {
      const query: GetSubmissionsQueryDto = { page: 1 };
      const response: PaginatedSubmissionsResponse = {
        data: [
          {
            id: 'sub1',
            match_id: 'match1',
            result: 'team_a_wins',
            source: 'oracle1',
            submitted_at: new Date(),
            status: 'accepted',
          },
        ],
        total: 1,
      };

      mockSubmissionHistoryService.getSubmissions.mockResolvedValue(response);

      const result = await controller.getSubmissions(query);

      expect(result).toEqual(response);
      expect(submissionHistoryService.getSubmissions).toHaveBeenCalledWith(
        query,
      );
    });
  });

  describe('getFlags', () => {
    it('should return anomaly flags for review', async () => {
      const query: GetFlagsQueryDto = { page: 1 };
      const response: PaginatedFlagsResponse = {
        data: [
          {
            id: 'flag1',
            submission_id: 'sub1',
            flag_type: 'deviation_exceeds_threshold',
            flagged_at: new Date(),
            status: 'pending_review',
          },
        ],
        total: 1,
      };

      mockSubmissionHistoryService.getFlags.mockResolvedValue(response);

      const result = await controller.getFlags(query);

      expect(result).toEqual(response);
      expect(submissionHistoryService.getFlags).toHaveBeenCalledWith(query);
    });
  });

  describe('getSourceReliability', () => {
    it('should return reliability scores for all sources', async () => {
      const scores = [
        { source: 'oracle1', reliability_score: 0.95 },
        { source: 'oracle2', reliability_score: 0.87 },
      ];

      mockReliabilityService.getScores.mockResolvedValue(scores);

      const result = await controller.getSourceReliability();

      expect(result).toEqual(scores);
      expect(reliabilityService.getScores).toHaveBeenCalled();
    });
  });

  describe('getMatchConsensus', () => {
    it('should evaluate consensus for a match', async () => {
      const matchId = 'match123';
      const response: MatchConsensusResponse = {
        match_id: matchId,
        consensus_reached: true,
        winning_result: 'team_a_wins',
        submission_count: 3,
        anomaly_count: 1,
      };

      mockOracleService.getMatchConsensus.mockResolvedValue(response);

      const result = await controller.getMatchConsensus(matchId);

      expect(result).toEqual(response);
      expect(oracleService.getMatchConsensus).toHaveBeenCalledWith(matchId);
    });

    it('should handle matches without consensus', async () => {
      const matchId = 'match456';
      const response: MatchConsensusResponse = {
        match_id: matchId,
        consensus_reached: false,
        winning_result: null,
        submission_count: 2,
        anomaly_count: 0,
      };

      mockOracleService.getMatchConsensus.mockResolvedValue(response);

      const result = await controller.getMatchConsensus(matchId);

      expect(result).toEqual(response);
      expect(oracleService.getMatchConsensus).toHaveBeenCalledWith(matchId);
    });
  });

  describe('getDivergences', () => {
    it('should return list of unresolved divergences', async () => {
      const query: ListDivergencesQueryDto = { page: 1 };
      const response: PaginatedDivergencesResponse = {
        data: [
          {
            id: 'div1',
            match_id: 'match1',
            source1: 'oracle1',
            result1: 'team_a_wins',
            source2: 'oracle2',
            result2: 'team_b_wins',
            created_at: new Date(),
            status: 'unresolved',
          },
        ],
        total: 1,
      };

      mockOracleService.getDivergences.mockResolvedValue(response);

      const result = await controller.getDivergences(query);

      expect(result).toEqual(response);
      expect(oracleService.getDivergences).toHaveBeenCalledWith(query);
    });
  });

  describe('reviewSubmission', () => {
    it('should approve a submission', async () => {
      const id = 'sub1';
      const dto: ReviewSubmissionDto = {
        decision: 'approve',
        reason: 'Submission is valid',
      };
      const response: ReviewResultResponse = {
        id,
        decision: 'approved',
        reviewed_at: new Date(),
      };

      mockWebhookService.reviewSubmission.mockResolvedValue(response);

      const result = await controller.reviewSubmission(id, dto);

      expect(result).toEqual(response);
      expect(webhookService.reviewSubmission).toHaveBeenCalledWith(id, dto);
    });

    it('should reject a submission', async () => {
      const id = 'sub2';
      const dto: ReviewSubmissionDto = {
        decision: 'reject',
        reason: 'Invalid data',
      };
      const response: ReviewResultResponse = {
        id,
        decision: 'rejected',
        reviewed_at: new Date(),
      };

      mockWebhookService.reviewSubmission.mockResolvedValue(response);

      const result = await controller.reviewSubmission(id, dto);

      expect(result).toEqual(response);
      expect(webhookService.reviewSubmission).toHaveBeenCalledWith(id, dto);
    });
  });
});
