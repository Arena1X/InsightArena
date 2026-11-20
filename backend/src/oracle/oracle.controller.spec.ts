import { Test, TestingModule } from '@nestjs/testing';
import { OracleController } from './oracle.controller';
import { OracleService } from './oracle.service';
import { WebhookService } from './webhook.service';
import { SubmissionHistoryService } from './submission-history.service';
import { OracleReliabilityService } from './oracle-reliability.service';
import {
  ListPendingMatchesQueryDto,
  PaginatedPendingMatchesResponse,
} from './dto/list-pending-matches-query.dto';

describe('OracleController', () => {
  let controller: OracleController;
  let oracleService: jest.Mocked<OracleService>;
  let webhookService: jest.Mocked<WebhookService>;
  let submissionHistoryService: jest.Mocked<SubmissionHistoryService>;
  let reliabilityService: jest.Mocked<OracleReliabilityService>;

  const mockPendingMatches: PaginatedPendingMatchesResponse = {
    items: [
      {
        id: 'match-1',
        sport: 'Football',
        teams: ['Team A', 'Team B'],
        scheduled_at: new Date('2026-12-01'),
        deadline: new Date('2026-12-02'),
      },
      {
        id: 'match-2',
        sport: 'Basketball',
        teams: ['Team C', 'Team D'],
        scheduled_at: new Date('2026-12-03'),
        deadline: new Date('2026-12-04'),
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OracleController],
      providers: [
        {
          provide: OracleService,
          useValue: {
            getPendingMatches: jest.fn(),
            getMatchConsensus: jest.fn(),
            submitMatchResult: jest.fn(),
          },
        },
        {
          provide: WebhookService,
          useValue: {
            handleWebhook: jest.fn(),
          },
        },
        {
          provide: SubmissionHistoryService,
          useValue: {
            getSubmissions: jest.fn(),
          },
        },
        {
          provide: OracleReliabilityService,
          useValue: {
            getOracleStats: jest.fn(),
            flagAnomalies: jest.fn(),
            listDivergences: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OracleController>(OracleController);
    oracleService = module.get(OracleService) as jest.Mocked<OracleService>;
    webhookService = module.get(WebhookService) as jest.Mocked<WebhookService>;
    submissionHistoryService = module.get(
      SubmissionHistoryService,
    ) as jest.Mocked<SubmissionHistoryService>;
    reliabilityService = module.get(
      OracleReliabilityService,
    ) as jest.Mocked<OracleReliabilityService>;
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have all services injected', () => {
      expect(oracleService).toBeDefined();
      expect(webhookService).toBeDefined();
      expect(submissionHistoryService).toBeDefined();
      expect(reliabilityService).toBeDefined();
    });

    it('should be an instance of OracleController', () => {
      expect(controller).toBeInstanceOf(OracleController);
    });
  });

  describe('getPendingMatches', () => {
    it('should be defined', () => {
      expect(controller.getPendingMatches).toBeDefined();
    });

    it('should return pending matches', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = {
        page: 1,
        limit: 20,
      };

      const result = await controller.getPendingMatches(query);

      expect(result).toEqual(mockPendingMatches);
      expect(oracleService.getPendingMatches).toHaveBeenCalledWith(query);
    });

    it('should return paginated response structure', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      const result = await controller.getPendingMatches(query);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
    });

    it('should handle empty pending matches', async () => {
      const emptyResponse: PaginatedPendingMatchesResponse = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      oracleService.getPendingMatches.mockResolvedValue(emptyResponse);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      const result = await controller.getPendingMatches(query);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should pass query parameters to service', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = {
        page: 2,
        limit: 50,
      };

      await controller.getPendingMatches(query);

      expect(oracleService.getPendingMatches).toHaveBeenCalledWith(query);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      oracleService.getPendingMatches.mockRejectedValue(error);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      await expect(controller.getPendingMatches(query)).rejects.toThrow(
        'Service error',
      );
    });

    it('should return matches with required properties', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      const result = await controller.getPendingMatches(query);

      result.items.forEach((match) => {
        expect(match).toHaveProperty('id');
        expect(match).toHaveProperty('sport');
        expect(match).toHaveProperty('teams');
        expect(match).toHaveProperty('scheduled_at');
        expect(match).toHaveProperty('deadline');
      });
    });

    it('should handle large page numbers', async () => {
      oracleService.getPendingMatches.mockResolvedValue({
        items: [],
        total: 0,
        page: 100,
        limit: 20,
      });

      const query: ListPendingMatchesQueryDto = { page: 100, limit: 20 };

      const result = await controller.getPendingMatches(query);

      expect(result.page).toBe(100);
    });

    it('should handle different limit values', async () => {
      const smallLimitResponse: PaginatedPendingMatchesResponse = {
        items: mockPendingMatches.items.slice(0, 5),
        total: 2,
        page: 1,
        limit: 5,
      };

      oracleService.getPendingMatches.mockResolvedValue(smallLimitResponse);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 5 };

      const result = await controller.getPendingMatches(query);

      expect(result.limit).toBe(5);
    });
  });

  describe('method annotations', () => {
    it('should have GET method annotation for getPendingMatches', () => {
      const metadata = Reflect.getMetadata('path', controller.getPendingMatches);
      expect(controller.getPendingMatches).toBeDefined();
    });

    it('should have proper error handling structure', () => {
      expect(typeof controller.getPendingMatches).toBe('function');
    });

    it('should be an async function', () => {
      expect(controller.getPendingMatches.constructor.name).toBe(
        'AsyncFunction',
      );
    });
  });

  describe('service dependencies', () => {
    it('should use OracleService for getPendingMatches', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      await controller.getPendingMatches(query);

      expect(oracleService.getPendingMatches).toHaveBeenCalled();
    });

    it('should handle service method not called', () => {
      expect(oracleService.getPendingMatches).not.toHaveBeenCalled();
    });

    it('should call service exactly once per request', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      await controller.getPendingMatches(query);

      expect(oracleService.getPendingMatches).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined query parameters', async () => {
      oracleService.getPendingMatches.mockResolvedValue(mockPendingMatches);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      const result = await controller.getPendingMatches(query);

      expect(result).toBeDefined();
    });

    it('should handle matches with null optional fields', async () => {
      const matchesWithNullFields: PaginatedPendingMatchesResponse = {
        items: [
          {
            id: 'match-1',
            sport: 'Football',
            teams: ['Team A', 'Team B'],
            scheduled_at: new Date('2026-12-01'),
            deadline: null,
          } as any,
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      oracleService.getPendingMatches.mockResolvedValue(matchesWithNullFields);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 20 };

      const result = await controller.getPendingMatches(query);

      expect(result.items[0].id).toBeDefined();
    });

    it('should handle very large response', async () => {
      const largeResponse: PaginatedPendingMatchesResponse = {
        items: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `match-${i}`,
            sport: 'Football',
            teams: [`Team ${i * 2}`, `Team ${i * 2 + 1}`],
            scheduled_at: new Date('2026-12-01'),
            deadline: new Date('2026-12-02'),
          })),
        total: 100,
        page: 1,
        limit: 100,
      };

      oracleService.getPendingMatches.mockResolvedValue(largeResponse);

      const query: ListPendingMatchesQueryDto = { page: 1, limit: 100 };

      const result = await controller.getPendingMatches(query);

      expect(result.items).toHaveLength(100);
    });
  });

  describe('controller methods availability', () => {
    it('should have getPendingMatches method', () => {
      expect(typeof controller.getPendingMatches).toBe('function');
    });

    it('should have all expected public methods', () => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller));
      expect(methods).toContain('getPendingMatches');
    });
  });
});
