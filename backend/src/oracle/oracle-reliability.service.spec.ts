import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OracleReliabilityService } from './oracle-reliability.service';
import { OracleSourceReliability } from './entities/oracle-source-reliability.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

describe('OracleReliabilityService', () => {
  let service: OracleReliabilityService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleReliabilityService,
        {
          provide: getRepositoryToken(OracleSourceReliability),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get(OracleReliabilityService);
  });

  describe('recordOutcome', () => {
    it('creates a new record on first outcome', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        data_source: 'src-a',
        total_submissions: 0,
        correct_submissions: 0,
        reliability_score: null,
      };
      repo.create.mockReturnValue(created);
      repo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));

      await service.recordOutcome('src-a', true);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          total_submissions: 1,
          correct_submissions: 1,
          reliability_score: 1,
        }),
      );
    });

    it('increments totals and recomputes score on subsequent outcomes', async () => {
      const existing = {
        data_source: 'src-b',
        total_submissions: 4,
        correct_submissions: 3,
        reliability_score: 0.75,
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));

      await service.recordOutcome('src-b', false);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          total_submissions: 5,
          correct_submissions: 3,
          reliability_score: 0.6,
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
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (r: any) => ({
        ...r,
        updated_at: new Date(),
      }));

      await service.recordOutcome('src-c', true);

      expect(repo.save).toHaveBeenCalledWith(
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
      repo.find.mockResolvedValue(records);

      const result = await service.getScores();

      expect(result).toHaveLength(2);
      expect(result[0].data_source).toBe('a');
      expect(result[0].reliability_score).toBe(0.9);
    });
  });

  describe('getWeight', () => {
    it('returns reliability_score when record exists', async () => {
      repo.findOne.mockResolvedValue({ reliability_score: 0.8 });
      expect(await service.getWeight('src-a')).toBe(0.8);
    });

    it('returns 1.0 as neutral fallback when no record exists', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.getWeight('unknown')).toBe(1.0);
    });
  });
});
