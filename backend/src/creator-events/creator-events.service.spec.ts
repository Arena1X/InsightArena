import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ContractService } from '../contract/contract.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventLeaderboardEntry } from '../matches/entities/creator-event-leaderboard-entry.entity';
import { CreatorEventsService } from './creator-events.service';
import { CreatorEventSearchStatus } from './dto/search-events-query.dto';

type MockSearchQueryBuilder = jest.Mocked<
  Pick<
    SelectQueryBuilder<CreatorEvent>,
    | 'addSelect'
    | 'where'
    | 'andWhere'
    | 'setParameter'
    | 'clone'
    | 'orderBy'
    | 'addOrderBy'
    | 'skip'
    | 'take'
    | 'getRawAndEntities'
  >
> & {
  getCount: jest.Mock;
};

describe('CreatorEventsService searchEvents', () => {
  let service: CreatorEventsService;
  let creatorEventRepository: jest.Mocked<
    Pick<Repository<CreatorEvent>, 'createQueryBuilder'>
  >;
  let queryBuilder: MockSearchQueryBuilder;
  let countQueryBuilder: { getCount: jest.Mock };

  const makeEvent = (overrides: Partial<CreatorEvent> = {}): CreatorEvent =>
    ({
      id: 'event-1',
      on_chain_event_id: 101,
      creator_address: '0xCreatorAddress',
      title: 'Champions League Final',
      description: 'Predict the Champions League winner',
      creation_fee_paid: '100',
      on_chain_created_at: new Date('2026-05-01T00:00:00.000Z'),
      is_active: true,
      is_cancelled: false,
      invite_code: null,
      max_participants: 500,
      participant_count: 42,
      match_count: 3,
      matches: [],
      created_at: new Date('2026-05-01T00:00:00.000Z'),
      ...overrides,
    }) as CreatorEvent;

  beforeEach(async () => {
    countQueryBuilder = {
      getCount: jest.fn().mockResolvedValue(1),
    };

    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue(countQueryBuilder),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: [makeEvent()],
        raw: [{ search_rank: '0.98' }],
      }),
      getCount: jest.fn(),
    };

    creatorEventRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        {
          provide: ContractService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: creatorEventRepository,
        },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CreatorEventsService>(CreatorEventsService);
  });

  it('returns ranked full-text search results with highlights', async () => {
    const result = await service.searchEvents({
      q: 'champions',
      page: 1,
      limit: 20,
      status: CreatorEventSearchStatus.All,
    });

    expect(creatorEventRepository.createQueryBuilder).toHaveBeenCalledWith(
      'creatorEvent',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('ts_rank_cd'),
      'search_rank',
    );
    expect(queryBuilder.where).toHaveBeenCalled();
    expect(queryBuilder.setParameter).toHaveBeenCalledWith(
      'searchTerm',
      'champions',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('search_rank', 'DESC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'creatorEvent.participant_count',
      'DESC',
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'event-1',
          rank: 0.98,
          highlights: expect.objectContaining({
            title: '<mark>Champions</mark> League Final',
            description: 'Predict the <mark>Champions</mark> League winner',
          }),
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      query: 'champions',
    });
  });

  it('applies status and creator filters', async () => {
    await service.searchEvents({
      q: 'league',
      page: 2,
      limit: 10,
      status: CreatorEventSearchStatus.Active,
      creator: '0xCreatorAddress',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'creatorEvent.is_active = :isActive',
      { isActive: true },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'creatorEvent.is_cancelled = :isCancelled',
      { isCancelled: false },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(creatorEvent.creator_address) = LOWER(:creator)',
      { creator: '0xCreatorAddress' },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
  });

  it('supports cancelled and inactive status filters', async () => {
    await service.searchEvents({
      q: 'league',
      status: CreatorEventSearchStatus.Cancelled,
      page: 1,
      limit: 20,
    });
    await service.searchEvents({
      q: 'league',
      status: CreatorEventSearchStatus.Inactive,
      page: 1,
      limit: 20,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'creatorEvent.is_cancelled = :isCancelled',
      { isCancelled: true },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'creatorEvent.is_active = :isActive',
      { isActive: false },
    );
  });

  it('returns an empty page for blank queries without touching the database', async () => {
    const result = await service.searchEvents({
      q: '   ',
      page: 1,
      limit: 20,
      status: CreatorEventSearchStatus.All,
    });

    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      query: '',
    });
    expect(creatorEventRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
