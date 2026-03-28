import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SorobanListener } from './soroban.listener';
import { SorobanService, SorobanRpcEvent } from './soroban.service';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { SystemState } from './entities/system-state.entity';

describe('SorobanListener', () => {
  let listener: SorobanListener;
  let sorobanService: jest.Mocked<SorobanService>;

  const marketRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const predictionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const userRepository = {
    findOne: jest.fn(),
  };

  const systemStateRepository = {
    findOne: jest.fn(),
    upsert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanListener,
        {
          provide: SorobanService,
          useValue: {
            getEvents: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: marketRepository,
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: predictionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(SystemState),
          useValue: systemStateRepository,
        },
      ],
    }).compile();

    listener = module.get<SorobanListener>(SorobanListener);
    sorobanService = module.get(SorobanService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('persists latest ledger even when no events are returned', async () => {
    const getEventsSpy = jest.spyOn(sorobanService, 'getEvents');

    systemStateRepository.findOne.mockResolvedValue({
      key: 'soroban:last_processed_ledger',
      value: '100',
    });
    sorobanService.getEvents.mockResolvedValue({
      events: [],
      latestLedger: 120,
    });

    await listener.pollEvents();

    expect(getEventsSpy).toHaveBeenCalledWith(101);
    expect(systemStateRepository.upsert).toHaveBeenCalledWith(
      { key: 'soroban:last_processed_ledger', value: '120' },
      ['key'],
    );
  });

  it('handles MarketResolved and updates market record', async () => {
    const market = {
      id: 'market-db-id',
      on_chain_market_id: 'market-1',
      is_resolved: false,
      resolved_outcome: null,
    } as unknown as Market;

    const events: SorobanRpcEvent[] = [
      {
        id: 'evt-1',
        ledger: 201,
        topic: ['mkt', 'reslvd'],
        value: {
          market_id: 'market-1',
          resolved_outcome: 'YES',
        },
      },
    ];

    systemStateRepository.findOne.mockResolvedValue(null);
    sorobanService.getEvents.mockResolvedValue({ events, latestLedger: 201 });
    marketRepository.findOne.mockResolvedValue(market);
    marketRepository.save.mockResolvedValue(market);

    await listener.pollEvents();

    expect(marketRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        is_resolved: true,
        resolved_outcome: 'YES',
      }),
    );
    expect(systemStateRepository.upsert).toHaveBeenCalledWith(
      { key: 'soroban:last_processed_ledger', value: '201' },
      ['key'],
    );
  });

  it('handles PayoutClaimed and updates prediction record', async () => {
    const market = {
      id: 'market-db-id',
      on_chain_market_id: 'market-2',
    } as unknown as Market;

    const user = {
      id: 'user-1',
      stellar_address: 'GABC123',
    } as User;

    const prediction = {
      payout_claimed: false,
      payout_amount_stroops: '0',
    } as Prediction;

    const events: SorobanRpcEvent[] = [
      {
        id: 'evt-2',
        ledger: 301,
        topic: ['pred', 'payclmd'],
        value: {
          market_id: 'market-2',
          predictor: 'GABC123',
          payout_amount_stroops: '5000000',
        },
      },
    ];

    systemStateRepository.findOne.mockResolvedValue(null);
    sorobanService.getEvents.mockResolvedValue({ events, latestLedger: 301 });
    marketRepository.findOne.mockResolvedValue(market);
    userRepository.findOne.mockResolvedValue(user);
    predictionRepository.findOne.mockResolvedValue(prediction);

    await listener.pollEvents();

    expect(predictionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payout_claimed: true,
        payout_amount_stroops: '5000000',
      }),
    );
    expect(systemStateRepository.upsert).toHaveBeenCalledWith(
      { key: 'soroban:last_processed_ledger', value: '301' },
      ['key'],
    );
  });
});
