import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Comment } from '../markets/entities/comment.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { Flag } from '../flags/entities/flag.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { VerifiedAddress } from './entities/verified-address.entity';
import { FeeHistory } from '../indexer/entities/fee-history.entity';
import { MarketsService } from '../markets/markets.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SorobanService } from '../soroban/soroban.service';
import { FlagsService } from '../flags/flags.service';
import { PredictionsService } from '../predictions/predictions.service';

describe('AdminService (Bulk CSV Market Import)', () => {
  let service: AdminService;
  let usersRepo: any;
  let marketsService: any;

  const mockUser = { id: 'user-1' } as User;

  const validRow =
    'Will BTC hit 100k?,Resolves YES if BTC >= 100000 USD,Crypto,Yes;No,2099-12-31T23:59:59.000Z,2100-01-07T23:59:59.000Z,100,10000000,1000000000,true';
  const header =
    'title,description,category,outcome_options,end_time,resolution_time,creator_fee_bps,min_stake_stroops,max_stake_stroops,is_public';

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn().mockResolvedValue(mockUser) };
    marketsService = {
      createMarketRowTransactional: jest
        .fn()
        .mockResolvedValue({ id: 'market-1' }),
    };

    const emptyRepo = {} as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Market), useValue: emptyRepo },
        { provide: getRepositoryToken(Comment), useValue: emptyRepo },
        { provide: getRepositoryToken(Prediction), useValue: emptyRepo },
        { provide: getRepositoryToken(Competition), useValue: emptyRepo },
        {
          provide: getRepositoryToken(CompetitionParticipant),
          useValue: emptyRepo,
        },
        { provide: getRepositoryToken(ActivityLog), useValue: emptyRepo },
        { provide: getRepositoryToken(Flag), useValue: emptyRepo },
        { provide: getRepositoryToken(CreatorEvent), useValue: emptyRepo },
        { provide: getRepositoryToken(VerifiedAddress), useValue: emptyRepo },
        { provide: getRepositoryToken(FeeHistory), useValue: emptyRepo },
        { provide: MarketsService, useValue: marketsService },
        { provide: AnalyticsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: FlagsService, useValue: {} },
        { provide: PredictionsService, useValue: {} },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('throws NotFoundException if the admin user does not exist', async () => {
    usersRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.importMarketsFromCsv(`${header}\n${validRow}`, 'missing-user'),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a market for a valid row and reports the summary', async () => {
    const csv = `${header}\n${validRow}`;
    const result = await service.importMarketsFromCsv(csv, mockUser.id);

    expect(result.total).toBe(1);
    expect(result.created_count).toBe(1);
    expect(result.failed_count).toBe(0);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        row: 2,
        status: 'created',
        market_id: 'market-1',
      }),
    );
    expect(marketsService.createMarketRowTransactional).toHaveBeenCalledTimes(
      1,
    );
  });

  it('reports a validation failure without aborting other valid rows', async () => {
    const invalidRow =
      'Bad,Too short desc but still >10 chars,Crypto,Yes;No,2099-12-31T23:59:59.000Z,2100-01-07T23:59:59.000Z,100,10000000,1000000000,true';
    const csv = `${header}\n${invalidRow}\n${validRow}`;

    const result = await service.importMarketsFromCsv(csv, mockUser.id);

    expect(result.total).toBe(2);
    expect(result.created_count).toBe(1);
    expect(result.failed_count).toBe(1);

    const failed = result.results.find((r) => r.row === 2);
    expect(failed?.status).toBe('failed');
    expect(failed?.errors?.length).toBeGreaterThan(0);

    const created = result.results.find((r) => r.row === 3);
    expect(created?.status).toBe('created');
    expect(created?.market_id).toBe('market-1');

    // Only the valid row reached market creation.
    expect(marketsService.createMarketRowTransactional).toHaveBeenCalledTimes(
      1,
    );
  });

  it('reports a per-row creation failure (e.g. Soroban error) without aborting other rows', async () => {
    marketsService.createMarketRowTransactional
      .mockRejectedValueOnce(new Error('Failed to create market on Soroban'))
      .mockResolvedValueOnce({ id: 'market-2' });

    const csv = `${header}\n${validRow}\n${validRow}`;
    const result = await service.importMarketsFromCsv(csv, mockUser.id);

    expect(result.total).toBe(2);
    expect(result.created_count).toBe(1);
    expect(result.failed_count).toBe(1);

    const failed = result.results.find((r) => r.row === 2);
    expect(failed?.status).toBe('failed');
    expect(failed?.errors).toContain('Failed to create market on Soroban');

    const created = result.results.find((r) => r.row === 3);
    expect(created?.status).toBe('created');
  });

  it('rejects a CSV with only a header row', async () => {
    await expect(
      service.importMarketsFromCsv(header, mockUser.id),
    ).rejects.toThrow(
      'CSV must contain a header row and at least one data row',
    );
  });

  it('reports a column-count mismatch as a row failure', async () => {
    const malformedRow = 'Only,two,columns';
    const csv = `${header}\n${malformedRow}`;
    const result = await service.importMarketsFromCsv(csv, mockUser.id);

    expect(result.failed_count).toBe(1);
    expect(result.results[0].errors?.[0]).toContain('Expected');
  });
});
