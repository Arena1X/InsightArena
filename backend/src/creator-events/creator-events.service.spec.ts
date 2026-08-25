import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ContractService } from '../contract/contract.service';
import { SearchService } from '../search/search.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventLeaderboardEntry } from '../matches/entities/creator-event-leaderboard-entry.entity';
import { CreatorEventPayout } from '../matches/entities/creator-event-payout.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';
import { CreatorEventsService } from './creator-events.service';
import { CreatorEventSearchStatus } from './dto/search-events-query.dto';

describe('CreatorEventsService searchEvents', () => {
  let service: CreatorEventsService;
  let searchService: jest.Mocked<Pick<SearchService, 'searchCreatorEvents'>>;

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
      category: 'football',
      matches: [],
      created_at: new Date('2026-05-01T00:00:00.000Z'),
      ...overrides,
    }) as CreatorEvent;

  beforeEach(async () => {
    searchService = {
      searchCreatorEvents: jest.fn().mockResolvedValue({
        data: [{ event: makeEvent(), searchRank: 0.98 }],
        total: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        {
          provide: ContractService,
          useValue: {},
        },
        {
          provide: SearchService,
          useValue: searchService,
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Match),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MatchPrediction),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CreatorEventPayout),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CreatorEventsService>(CreatorEventsService);
  });

  it('returns ranked search results with highlights across indexed fields', async () => {
    const result = await service.searchEvents({
      q: 'champions',
      page: 1,
      limit: 20,
      status: CreatorEventSearchStatus.All,
    });

    expect(searchService.searchCreatorEvents).toHaveBeenCalledWith({
      query: 'champions',
      skip: 0,
      limit: 20,
      status: CreatorEventSearchStatus.All,
      creator: undefined,
    });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'event-1',
          rank: 0.98,
          highlights: expect.objectContaining({
            title: '<mark>Champions</mark> League Final',
            description: 'Predict the <mark>Champions</mark> League winner',
            category: 'football',
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

  it('passes status and creator filters to the search service', async () => {
    await service.searchEvents({
      q: 'league',
      page: 2,
      limit: 10,
      status: CreatorEventSearchStatus.Active,
      creator: '0xCreatorAddress',
    });

    expect(searchService.searchCreatorEvents).toHaveBeenCalledWith({
      query: 'league',
      skip: 10,
      limit: 10,
      status: CreatorEventSearchStatus.Active,
      creator: '0xCreatorAddress',
    });
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
    expect(searchService.searchCreatorEvents).not.toHaveBeenCalled();
  });
});

describe('CreatorEventsService getUpcomingMatches', () => {
  let service: CreatorEventsService;
  let matchRepository: { createQueryBuilder: jest.Mock };
  let creatorEventRepository: { findOne: jest.Mock };

  const futureDate = new Date(Date.now() + 86_400_000); // +1 day
  const pastDate = new Date(Date.now() - 86_400_000); // -1 day

  const mockEvent = { id: 'event-uuid', on_chain_event_id: 42 } as any;

  beforeEach(async () => {
    const matchQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    matchRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(matchQb),
    };
    creatorEventRepository = {
      findOne: jest.fn().mockResolvedValue(mockEvent),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: {} },
        {
          provide: SearchService,
          useValue: { searchCreatorEvents: jest.fn() },
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: creatorEventRepository,
        },
        { provide: getRepositoryToken(Match), useValue: matchRepository },
        { provide: getRepositoryToken(MatchPrediction), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
        { provide: getRepositoryToken(CreatorEventPayout), useValue: {} },
      ],
    }).compile();

    service = module.get(CreatorEventsService);
  });

  it('returns only future unresolved matches ordered by match_time ASC', async () => {
    const upcoming = [
      { id: 'm1', match_time: futureDate, result_submitted: false },
      {
        id: 'm2',
        match_time: new Date(futureDate.getTime() + 3600_000),
        result_submitted: false,
      },
    ] as any[];

    const qb = matchRepository.createQueryBuilder();
    qb.getMany.mockResolvedValue(upcoming);

    const result = await service.getUpcomingMatches('42');

    expect(result).toEqual(upcoming);
    expect(qb.where).toHaveBeenCalledWith('match.event_id = :eventId', {
      eventId: mockEvent.id,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('match.match_time > :now', {
      now: expect.any(Date),
    });
    expect(qb.andWhere).toHaveBeenCalledWith('match.result_submitted = false');
    expect(qb.orderBy).toHaveBeenCalledWith('match.match_time', 'ASC');
  });

  it('returns empty array when no upcoming matches', async () => {
    const qb = matchRepository.createQueryBuilder();
    qb.getMany.mockResolvedValue([]);

    const result = await service.getUpcomingMatches('42');
    expect(result).toEqual([]);
  });

  it('throws NotFoundException when event does not exist', async () => {
    creatorEventRepository.findOne.mockResolvedValue(null);

    await expect(service.getUpcomingMatches('999')).rejects.toThrow(
      NotFoundException,
    );
  });
});
