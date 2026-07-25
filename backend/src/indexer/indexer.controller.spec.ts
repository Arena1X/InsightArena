import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { IndexerController } from './indexer.controller';
import { IndexerService } from './indexer.service';
import { ReconciliationService } from './reconciliation.service';
import { ReorgEvent } from './entities/reorg-event.entity';

describe('IndexerController', () => {
  let controller: IndexerController;
  let reconciliationService: jest.Mocked<
    Pick<ReconciliationService, 'getReorgEvents'>
  >;

  beforeEach(async () => {
    reconciliationService = {
      getReorgEvents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndexerController],
      providers: [
        {
          provide: IndexerService,
          useValue: {
            reindex: jest.fn(),
            getEventsPaginated: jest.fn(),
            getMetrics: jest.fn(),
            retryFailedEvents: jest.fn(),
          },
        },
        {
          provide: ReconciliationService,
          useValue: reconciliationService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<IndexerController>(IndexerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getReorgs', () => {
    it('returns reorg events for the given contract and limit', async () => {
      const events = [{ id: 'r1' }] as ReorgEvent[];
      reconciliationService.getReorgEvents.mockResolvedValue(events);

      const result = await controller.getReorgs('CTEST', 10);

      expect(reconciliationService.getReorgEvents).toHaveBeenCalledWith(
        'CTEST',
        10,
      );
      expect(result).toBe(events);
    });

    it('passes undefined contract id and default limit when omitted', async () => {
      reconciliationService.getReorgEvents.mockResolvedValue([]);

      await controller.getReorgs();

      expect(reconciliationService.getReorgEvents).toHaveBeenCalledWith(
        undefined,
        50,
      );
    });
  });
});
