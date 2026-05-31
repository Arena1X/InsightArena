import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmissionHistoryService } from './submission-history.service';
import {
  OracleSubmission,
  SubmissionStatus,
} from './entities/oracle-submission.entity';
import { GetSubmissionsQueryDto } from './dto/submission-history.dto';

describe('SubmissionHistoryService', () => {
  let service: SubmissionHistoryService;
  let submissionRepository: Repository<OracleSubmission>;

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
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionHistoryService,
        {
          provide: getRepositoryToken(OracleSubmission),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<SubmissionHistoryService>(SubmissionHistoryService);
    submissionRepository = module.get<Repository<OracleSubmission>>(
      getRepositoryToken(OracleSubmission),
    );
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
});
