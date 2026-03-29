import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Comment } from '../markets/entities/comment.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { Competition } from '../competitions/entities/competition.entity';
import { Market } from '../markets/entities/market.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Prediction } from '../predictions/entities/prediction.entity';
import { SorobanService } from '../soroban/soroban.service';
import { User } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { ResolveMarketDto } from './dto/resolve-market.dto';

const mockRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('AdminService.adminResolveMarket', () => {
  let service: AdminService;
  let marketsRepo: ReturnType<typeof mockRepo>;
  let predictionsRepo: ReturnType<typeof mockRepo>;
  let sorobanService: jest.Mocked<Pick<SorobanService, 'resolveMarket'>>;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'create'>>;
  let analyticsService: jest.Mocked<Pick<AnalyticsService, 'logActivity'>>;

  const adminId = 'admin-1';

  const makeMarket = (overrides: Partial<Market> = {}): Market =>
    ({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      title: 'Test Market',
      outcome_options: ['YES', 'NO'],
      is_resolved: false,
      is_cancelled: false,
      ...overrides,
    }) as Market;

  const makeDto = (
    overrides: Partial<ResolveMarketDto> = {},
  ): ResolveMarketDto => ({
    resolved_outcome: 'YES',
    ...overrides,
  });

  beforeEach(async () => {
    marketsRepo = mockRepo();
    predictionsRepo = mockRepo();
    sorobanService = { resolveMarket: jest.fn().mockResolvedValue({}) };
    notificationsService = { create: jest.fn().mockResolvedValue({}) };
    analyticsService = { logActivity: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        { provide: getRepositoryToken(Market), useValue: marketsRepo },
        { provide: getRepositoryToken(Comment), useValue: mockRepo() },
        { provide: getRepositoryToken(Prediction), useValue: predictionsRepo },
        { provide: getRepositoryToken(Competition), useValue: mockRepo() },
        { provide: getRepositoryToken(ActivityLog), useValue: mockRepo() },
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: SorobanService, useValue: sorobanService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('throws NotFoundException when market does not exist', async () => {
    marketsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.adminResolveMarket('bad-id', makeDto(), adminId),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when market is already resolved', async () => {
    marketsRepo.findOne.mockResolvedValue(makeMarket({ is_resolved: true }));

    await expect(
      service.adminResolveMarket('market-1', makeDto(), adminId),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when market is cancelled', async () => {
    marketsRepo.findOne.mockResolvedValue(makeMarket({ is_cancelled: true }));

    await expect(
      service.adminResolveMarket('market-1', makeDto(), adminId),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for invalid outcome', async () => {
    marketsRepo.findOne.mockResolvedValue(makeMarket());

    await expect(
      service.adminResolveMarket(
        'market-1',
        makeDto({ resolved_outcome: 'MAYBE' }),
        adminId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadGatewayException when Soroban call fails', async () => {
    marketsRepo.findOne.mockResolvedValue(makeMarket());
    sorobanService.resolveMarket.mockRejectedValue(new Error('Soroban down'));

    await expect(
      service.adminResolveMarket('market-1', makeDto(), adminId),
    ).rejects.toThrow(BadGatewayException);
  });

  it('resolves market, notifies participants, and logs admin action', async () => {
    const market = makeMarket();
    const participant = { id: 'user-2' } as User;
    const prediction = {
      user: participant,
      chosen_outcome: 'YES',
      market,
    } as Prediction;

    marketsRepo.findOne.mockResolvedValue(market);
    marketsRepo.save.mockResolvedValue({
      ...market,
      is_resolved: true,
      resolved_outcome: 'YES',
    });
    predictionsRepo.find.mockResolvedValue([prediction]);

    const result = await service.adminResolveMarket(
      'market-1',
      makeDto(),
      adminId,
    );

    expect(sorobanService.resolveMarket).toHaveBeenCalledWith(
      'on-chain-1',
      'YES',
    );
    expect(marketsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ is_resolved: true, resolved_outcome: 'YES' }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      'user-2',
      expect.any(String),
      'Market Resolved',
      expect.stringContaining('YES'),
      expect.objectContaining({ won: true }),
    );
    expect(analyticsService.logActivity).toHaveBeenCalledWith(
      adminId,
      'MARKET_RESOLVED_BY_ADMIN',
      expect.objectContaining({
        market_id: 'market-1',
        resolved_outcome: 'YES',
      }),
    );
    expect(result.is_resolved).toBe(true);
  });

  it('includes resolution_note in notification metadata when provided', async () => {
    const market = makeMarket();
    const prediction = {
      user: { id: 'user-2' } as User,
      chosen_outcome: 'NO',
      market,
    } as Prediction;

    marketsRepo.findOne.mockResolvedValue(market);
    marketsRepo.save.mockResolvedValue({
      ...market,
      is_resolved: true,
      resolved_outcome: 'YES',
    });
    predictionsRepo.find.mockResolvedValue([prediction]);

    await service.adminResolveMarket(
      'market-1',
      makeDto({ resolution_note: 'Dispute resolved by admin' }),
      adminId,
    );

    expect(notificationsService.create).toHaveBeenCalledWith(
      'user-2',
      expect.any(String),
      'Market Resolved',
      expect.any(String),
      expect.objectContaining({
        resolution_note: 'Dispute resolved by admin',
        won: false,
      }),
    );
  });
});
