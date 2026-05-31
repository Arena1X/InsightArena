import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeleteResult,
  InsertResult,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
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
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { BroadcasterService } from '../websocket/broadcaster.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: ConfigService, useValue: configService },
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
        {
          provide: NotificationGeneratorService,
          useValue: {
            handleEventCreated: jest.fn(),
            handleMatchAdded: jest.fn(),
            handleUserJoinedEvent: jest.fn(),
            handlePredictionSubmitted: jest.fn(),
            handleMatchResultSubmitted: jest.fn(),
            handleWinnersVerified: jest.fn(),
            handleEventCancelled: jest.fn(),
          },
        },
        {
          provide: BroadcasterService,
          useValue: {
            broadcastEventCreated: jest.fn(),
            broadcastMatchAdded: jest.fn(),
            broadcastUserJoined: jest.fn(),
            broadcastPredictionSubmitted: jest.fn(),
            broadcastMatchResolved: jest.fn(),
            broadcastWinnersVerified: jest.fn(),
            broadcastEventCancelled: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  describe('reindex', () => {
    it('should reset checkpoint and trigger reindex', async () => {
      checkpointRepository.upsert.mockResolvedValue({} as InsertResult);

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

  describe('health helpers', () => {
    it('tracks events processed per minute', () => {
      (service as any).recordProcessedEvent();
      (service as any).recordProcessedEvent();

      expect(service.getEventsProcessedPerMinute()).toBe(2);
    });

    it('returns last successful sync timestamp', () => {
      const timestamp = service.getLastSuccessfulSyncTimestamp();
      expect(timestamp).toBeInstanceOf(Date);
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
      creatorEventRepository.create.mockReturnValue({} as CreatorEvent);
      creatorEventRepository.save.mockResolvedValue({} as CreatorEvent);

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
        mockQueryBuilder as unknown as SelectQueryBuilder<ContractEvent>,
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
        mockQueryBuilder as unknown as SelectQueryBuilder<ContractEvent>,
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
      contractEventRepository.delete.mockResolvedValue({
        affected: 10,
      } as DeleteResult);

      const count = await service.cleanupOldEvents(30);

      expect(contractEventRepository.delete).toHaveBeenCalled();
      expect(count).toBe(10);
    });
  });
});
