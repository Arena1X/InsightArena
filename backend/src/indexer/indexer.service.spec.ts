import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexerService } from './indexer.service';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';

describe('IndexerService', () => {
  let service: IndexerService;
  let contractEventRepository: jest.Mocked<
    Pick<
      Repository<ContractEvent>,
      | 'findOne'
      | 'create'
      | 'save'
      | 'count'
      | 'find'
      | 'delete'
      | 'createQueryBuilder'
    >
  >;
  let checkpointRepository: jest.Mocked<
    Pick<Repository<IndexerCheckpoint>, 'findOne' | 'save' | 'upsert'>
  >;
  let creatorEventRepository: jest.Mocked<
    Pick<
      Repository<CreatorEvent>,
      'findOne' | 'create' | 'save' | 'count' | 'createQueryBuilder'
    >
  >;
  let matchRepository: jest.Mocked<
    Pick<Repository<Match>, 'findOne' | 'create' | 'save'>
  >;
  let matchPredictionRepository: jest.Mocked<
    Pick<
      Repository<MatchPrediction>,
      'findOne' | 'create' | 'save' | 'count' | 'find' | 'findAndCount'
    >
  >;
  let feeHistoryRepository: jest.Mocked<
    Pick<Repository<FeeHistory>, 'findOne' | 'create' | 'save' | 'find'>
  >;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne' | 'save'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    contractEventRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    checkpointRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      upsert: jest.fn(),
    };

    creatorEventRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    matchRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    matchPredictionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };

    feeHistoryRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    const cacheInvalidationService = {
      invalidateOnEventCreated: jest.fn(),
      invalidateOnMatchAdded: jest.fn(),
      invalidateOnUserJoinedEvent: jest.fn(),
      invalidateOnPredictionSubmitted: jest.fn(),
      invalidateOnMatchResultSubmitted: jest.fn(),
      invalidateOnWinnersVerified: jest.fn(),
      invalidateOnEventCancelled: jest.fn(),
      invalidateCategoryCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: ConfigService, useValue: configService },
        {
          provide: 'CacheInvalidationService',
          useValue: cacheInvalidationService,
        },
        {
          provide: getRepositoryToken(ContractEvent),
          useValue: contractEventRepository,
        },
        {
          provide: getRepositoryToken(FeeHistory),
          useValue: feeHistoryRepository,
        },
        {
          provide: getRepositoryToken(IndexerCheckpoint),
          useValue: checkpointRepository,
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: creatorEventRepository,
        },
        { provide: getRepositoryToken(Match), useValue: matchRepository },
        {
          provide: getRepositoryToken(MatchPrediction),
          useValue: matchPredictionRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  describe('reindex', () => {
    it('should reset checkpoint and trigger reindex', async () => {
      checkpointRepository.upsert.mockResolvedValue({} as any);

      await service.reindex(100);

      expect(checkpointRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'indexer:last_processed_ledger',
          value: 99,
        }),
        ['key'],
      );
    });
  });

  describe('getMetrics', () => {
    it('should return indexer metrics', async () => {
      checkpointRepository.findOne
        .mockResolvedValueOnce({
          key: 'indexer:last_processed_ledger',
          value: 500,
        } as IndexerCheckpoint)
        .mockResolvedValueOnce({
          key: 'indexer:latest_contract_ledger',
          value: 1000,
        } as IndexerCheckpoint);

      contractEventRepository.count
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(1) // dlq
        .mockResolvedValueOnce(950); // processed

      const metrics = await service.getMetrics();

      expect(metrics.last_processed_ledger).toBe(500);
      expect(metrics.latest_contract_ledger).toBe(1000);
      expect(metrics.lag_in_ledgers).toBe(500);
      expect(metrics.pending_events).toBe(10);
      expect(metrics.failed_events).toBe(2);
      expect(metrics.dlq_events).toBe(1);
      expect(metrics.total_events_processed).toBe(950);
      expect(metrics.is_running).toBe(false);
    });
  });

  describe('retryFailedEvents', () => {
    it('should retry failed events', async () => {
      const failedEvent = {
        id: 'event-1',
        event_type: 'EventCreated',
        data: {
          event_id: '1',
          creator: 'GABC',
          title: 'Test',
          description: 'Desc',
          creation_fee_paid: '1000',
          created_at: Date.now() / 1000,
        },
        retry_count: 1,
        status: ContractEventStatus.FAILED,
      } as ContractEvent;

      contractEventRepository.find.mockResolvedValue([failedEvent]);
      contractEventRepository.save.mockResolvedValue(failedEvent);

      const origCreate = creatorEventRepository.findOne;
      creatorEventRepository.findOne.mockResolvedValue(null);
      creatorEventRepository.create.mockReturnValue({} as any);
      creatorEventRepository.save.mockResolvedValue({} as any);

      const count = await service.retryFailedEvents();

      expect(contractEventRepository.find).toHaveBeenCalled();
      expect(count).toBe(1);
    });
  });

  describe('getEventsPaginated', () => {
    it('should return paginated events', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            ledger: 100,
            log_index: 1,
            event_type: 'EventCreated',
            status: ContractEventStatus.PROCESSED,
          } as ContractEvent,
        ]),
      };

      contractEventRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getEventsPaginated(undefined, 10);

      expect(result.data).toHaveLength(1);
      expect(result.meta.has_more).toBe(false);
      expect(result.meta.next_cursor).toBeNull();
    });

    it('should handle cursor-based pagination', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };

      const events = Array.from({ length: 6 }, (_, i) => ({
        id: `e${i}`,
        ledger: 100 - i,
        log_index: 0,
        event_type: 'EventCreated',
        status: ContractEventStatus.PROCESSED,
      })) as ContractEvent[];

      mockQueryBuilder.getMany.mockResolvedValue(events);
      contractEventRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getEventsPaginated(undefined, 5);

      expect(result.data).toHaveLength(5);
      expect(result.meta.has_more).toBe(true);
      expect(result.meta.next_cursor).toBeTruthy();

      const decoded = Buffer.from(
        result.meta.next_cursor!,
        'base64',
      ).toString();
      expect(decoded).toContain(':');
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete old processed events', async () => {
      contractEventRepository.delete.mockResolvedValue({ affected: 10 } as any);

      const count = await service.cleanupOldEvents(30);

      expect(contractEventRepository.delete).toHaveBeenCalled();
      expect(count).toBe(10);
    });
  });
});
