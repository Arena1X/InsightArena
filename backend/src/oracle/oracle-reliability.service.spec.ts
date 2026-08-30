import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OracleReliabilityService } from './oracle-reliability.service';
import { OracleSourceReliability } from './entities/oracle-source-reliability.entity';
import { OracleReliabilityHistory } from './entities/oracle-reliability-history.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

describe('OracleReliabilityService', () => {
  let service: OracleReliabilityService;
  let reliabilityRepo: ReturnType<typeof mockRepo>;
  let historyRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    reliabilityRepo = mockRepo();
    historyRepo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleReliabilityService,
        {
          provide: getRepositoryToken(OracleSourceReliability),
          useValue: reliabilityRepo,
        },
        {
          provide: getRepositoryToken(OracleReliabilityHistory),
          useValue: historyRepo,
        },
      ],
    }).compile();

    service = module.get(OracleReliabilityService);
  });

  describe('recordOutcome', () => {
    it('creates a new record on first outcome and persists history', async () => {
      reliabilityRepo.findOne.mockResolvedValue(null);
      const created = {
        data_source: 'src-a',
        total_submissions: 0,
        correct_submissions: 0,
        reliability_score: null,
      };
      reliabilityRepo.create.mockReturnValue(created);
      reliabilityRepo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));
      historyRepo.create.mockImplementation((data: any) => data);
      historyRepo.save.mockImplementation(async (r: any) => r);

      await service.recordOutcome('src-a', 'match-123', true);

      expect(reliabilityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          total_submissions: 1,
          correct_submissions: 1,
          reliability_score: 1,
        }),
      );
      expect(historyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          data_source: 'src-a',
          match_id: 'match-123',
          was_correct: true,
          previous_score: null,
          new_score: 1,
          total_submissions: 1,
          correct_submissions: 1,
        }),
      );
    });

    it('increments totals, recomputes score, and records history on subsequent outcomes', async () => {
      const existing = {
        data_source: 'src-b',
        total_submissions: 4,
        correct_submissions: 3,
        reliability_score: 0.75,
      };
      reliabilityRepo.findOne.mockResolvedValue(existing);
      reliabilityRepo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));
      historyRepo.create.mockImplementation((data: any) => data);
      historyRepo.save.mockImplementation(async (r: any) => r);

      await service.recordOutcome('src-b', 'match-456', false);

      expect(reliabilityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          total_submissions: 5,
          correct_submissions: 3,
          reliability_score: 0.6,
        }),
      );
      expect(historyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          data_source: 'src-b',
          match_id: 'match-456',
          was_correct: false,
          previous_score: 0.75,
          new_score: 0.6,
          total_submissions: 5,
          correct_submissions: 3,
        }),
      );
    });

    it('score is 1.0 when all submissions are correct', async () => {
      const existing = {
        data_source: 'src-c',
        total_submissions: 9,
        correct_submissions: 9,
        reliability_score: 1,
      };
      reliabilityRepo.findOne.mockResolvedValue(existing);
      reliabilityRepo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));
      historyRepo.create.mockImplementation((data: any) => data);
      historyRepo.save.mockImplementation(async (r: any) => r);

      await service.recordOutcome('src-c', 'match-789', true);

      expect(reliabilityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reliability_score: 1 }),
      );
    });
  });

  describe('getScores', () => {
    it('returns all scores ordered by reliability_score desc', async () => {
      const records = [
        {
          data_source: 'a',
          total_submissions: 10,
          correct_submissions: 9,
          reliability_score: 0.9,
          updated_at: new Date(),
        },
        {
          data_source: 'b',
          total_submissions: 5,
          correct_submissions: 2,
          reliability_score: 0.4,
          updated_at: new Date(),
        },
      ];
      reliabilityRepo.find.mockResolvedValue(records);

      const result = await service.getScores();

      expect(result).toHaveLength(2);
      expect(result[0].data_source).toBe('a');
      expect(result[0].reliability_score).toBe(0.9);
    });
  });

  describe('getWeight', () => {
    it('returns reliability_score when record exists', async () => {
      reliabilityRepo.findOne.mockResolvedValue({ reliability_score: 0.8 });
      expect(await service.getWeight('src-a')).toBe(0.8);
    });

    it('returns 1.0 as neutral default when no record exists', async () => {
      reliabilityRepo.findOne.mockResolvedValue(null);
      expect(await service.getWeight('unknown')).toBe(1.0);
    });

    it('applies weight floor of 0.0', async () => {
      reliabilityRepo.findOne.mockResolvedValue({ reliability_score: 0.0 });
      expect(await service.getWeight('src-zero')).toBe(0.0);
    });

    it('clamps weights to [0.0, 1.0]', async () => {
      reliabilityRepo.findOne.mockResolvedValue({ reliability_score: 1.2 }); // Over max
      expect(await service.getWeight('src-over')).toBe(1.0);
    });
  });

  describe('getScoreHistory', () => {
    it('returns reliability score history for a source', async () => {
      const history = [
        {
          data_source: 'src-a',
          match_id: 'match-1',
          was_correct: true,
          new_score: 1.0,
        },
        {
          data_source: 'src-a',
          match_id: 'match-2',
          was_correct: false,
          new_score: 0.5,
        },
      ];
      historyRepo.find.mockResolvedValue(history);

      const result = await service.getScoreHistory('src-a');

      expect(result).toHaveLength(2);
      expect(result[0].new_score).toBe(1.0);
      expect(result[1].new_score).toBe(0.5);
    });
  });

  describe('configuration getters', () => {
    it('getWeightFloor returns configured floor', () => {
      expect(service.getWeightFloor()).toBe(0.0);
    });

    it('getDefaultWeight returns configured default', () => {
      expect(service.getDefaultWeight()).toBe(1.0);
    });
  });
});
