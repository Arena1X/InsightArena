import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
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
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
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
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
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

describe('CreatorEventsService getPayoutByAddress', () => {
  let service: CreatorEventsService;
  let creatorEventPayoutRepository: { findOne: jest.Mock };

  const makeLeaderboardEntry = (
    overrides: Partial<CreatorEventLeaderboardEntry> = {},
  ): CreatorEventLeaderboardEntry => ({
    id: 'leaderboard-entry-1',
    event_id: 'event-1',
    user_address: '0xParticipant',
    rank: 5,
    total_predictions: 3,
    correct_predictions: 1,
    accuracy_percentage: 33.33,
    is_winner: false,
    completion_time: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  });

  const makePayout = (
    overrides: Partial<CreatorEventPayout> = {},
  ): CreatorEventPayout => ({
    id: 'payout-1',
    event_id: 'event-1',
    user_address: '0xParticipant',
    payout_amount_stroops: '0',
    is_claimed: false,
    leaderboard_entry_id: 'leaderboard-entry-1',
    leaderboard_entry: makeLeaderboardEntry(),
    created_at: new Date('2026-05-02T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    creatorEventPayoutRepository = {
      findOne: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: {} },
        {
          provide: SearchService,
          useValue: { searchCreatorEvents: jest.fn() },
        },
        { provide: getRepositoryToken(CreatorEvent), useValue: {} },
        { provide: getRepositoryToken(Match), useValue: {} },
        { provide: getRepositoryToken(MatchPrediction), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CreatorEventPayout),
          useValue: creatorEventPayoutRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CreatorEventsService);
  });

  it('returns a zero-amount payout for a participant who received no prize, not a not-found', async () => {
    creatorEventPayoutRepository.findOne.mockResolvedValue(
      makePayout({ payout_amount_stroops: '0' }),
    );

    const result = await service.getPayoutByAddress('event-1', '0xParticipant');

    expect(result).toEqual(
      expect.objectContaining({
        user_address: '0xParticipant',
        payout_amount_stroops: '0',
        is_winner: false,
      }),
    );
  });

  it('throws a distinct NotFoundException for an address that never joined the event', async () => {
    creatorEventPayoutRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getPayoutByAddress('event-1', '0xNeverJoined'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns the correct nonzero amount for a confirmed winner', async () => {
    creatorEventPayoutRepository.findOne.mockResolvedValue(
      makePayout({
        user_address: '0xWinner',
        payout_amount_stroops: '50000000',
        leaderboard_entry: makeLeaderboardEntry({
          user_address: '0xWinner',
          rank: 1,
          is_winner: true,
        }),
      }),
    );

    const result = await service.getPayoutByAddress('event-1', '0xWinner');

    expect(result).toEqual(
      expect.objectContaining({
        user_address: '0xWinner',
        payout_amount_stroops: '50000000',
        rank: 1,
        is_winner: true,
      }),
    );
  });
});

describe('CreatorEventsService getLeaderboard', () => {
  let service: CreatorEventsService;
  let contractService: { getEventLeaderboard: jest.Mock };
  let creatorEventRepository: { findOne: jest.Mock };
  let leaderboardEntryRepository: { findAndCount: jest.Mock };

  // A fixed, unchanging on-chain leaderboard (#1851's "static leaderboard"
  // scenario): each page request re-fetches this same array from
  // getEventLeaderboard, since that's how the live (non-finalized) path
  // actually works - it has no server-side cursor of its own.
  const STATIC_CONTRACT_LEADERBOARD = Array.from({ length: 25 }, (_, i) => ({
    rank: i + 1,
    address: `G_ADDRESS_${i + 1}`,
    total_predictions: 10,
    correct_predictions: 10 - i,
    accuracy_percentage: 100 - i,
    is_winner: i === 0,
    completion_time: null,
  }));

  beforeEach(async () => {
    contractService = {
      getEventLeaderboard: jest
        .fn()
        .mockResolvedValue(STATIC_CONTRACT_LEADERBOARD),
    };
    creatorEventRepository = {
      // is_finalized: false routes getLeaderboard through the live/contract
      // path rather than the DB-cached path.
      findOne: jest.fn().mockResolvedValue({ is_finalized: false }),
    };
    leaderboardEntryRepository = {
      findAndCount: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: contractService },
        {
          provide: SearchService,
          useValue: { searchCreatorEvents: jest.fn() },
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: creatorEventRepository,
        },
        { provide: getRepositoryToken(Match), useValue: {} },
        { provide: getRepositoryToken(MatchPrediction), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: leaderboardEntryRepository,
        },
        { provide: getRepositoryToken(CreatorEventPayout), useValue: {} },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CreatorEventsService);
  });

  it('does not repeat any entry already returned on page 1 when fetching page 2 of a static leaderboard', async () => {
    const page1 = await service.getLeaderboard('42', { page: 1, limit: 10 });
    const page2 = await service.getLeaderboard('42', { page: 2, limit: 10 });

    const page1Addresses = new Set(page1.data.map((e) => e.user_address));
    const overlap = page2.data.filter((e) =>
      page1Addresses.has(e.user_address),
    );

    expect(overlap).toHaveLength(0);
    expect(page1.data).toHaveLength(10);
    expect(page2.data).toHaveLength(10);
  });

  it('does not skip any entry between consecutive pages of a static leaderboard', async () => {
    const page1 = await service.getLeaderboard('42', { page: 1, limit: 10 });
    const page2 = await service.getLeaderboard('42', { page: 2, limit: 10 });
    const page3 = await service.getLeaderboard('42', { page: 3, limit: 10 });

    const allReturnedRanks = [...page1.data, ...page2.data, ...page3.data].map(
      (e) => e.rank,
    );
    const expectedRanks = STATIC_CONTRACT_LEADERBOARD.map((e) => e.rank);

    expect(allReturnedRanks.sort((a, b) => a - b)).toEqual(expectedRanks);
  });

  it('indicates no further pages are available on the last page', async () => {
    // 25 entries at 10/page: page 3 is the last (21-25), so page >= totalPages.
    const lastPage = await service.getLeaderboard('42', {
      page: 3,
      limit: 10,
    });

    expect(lastPage.data).toHaveLength(5);
    expect(lastPage.page).toBeGreaterThanOrEqual(lastPage.totalPages);

    // A page past the end returns no data and still reports the same total,
    // rather than an ambiguous state indistinguishable from "has more pages".
    const pastLastPage = await service.getLeaderboard('42', {
      page: 4,
      limit: 10,
    });
    expect(pastLastPage.data).toHaveLength(0);
    expect(pastLastPage.total).toBe(25);
    expect(pastLastPage.page).toBeGreaterThan(pastLastPage.totalPages);
  });

  it('returns all entries on the first page when the event has fewer entries than the page size', async () => {
    contractService.getEventLeaderboard.mockResolvedValue(
      STATIC_CONTRACT_LEADERBOARD.slice(0, 3),
    );

    const result = await service.getLeaderboard('42', { page: 1, limit: 10 });

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBeGreaterThanOrEqual(result.totalPages);
  });

  it('paginates finalized events from the DB cache using a stable rank-ordered cursor, not a re-fetched array slice', async () => {
    creatorEventRepository.findOne.mockResolvedValue({ is_finalized: true });
    leaderboardEntryRepository.findAndCount.mockResolvedValue([
      [
        {
          rank: 11,
          user_address: 'G_11',
          total_predictions: 5,
          correct_predictions: 4,
          accuracy_percentage: 80,
          is_winner: false,
          completion_time: null,
        },
      ],
      25,
    ]);

    const result = await service.getLeaderboard('42', { page: 2, limit: 10 });

    expect(leaderboardEntryRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { rank: 'ASC' },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.source).toBe('cache');
    expect(contractService.getEventLeaderboard).not.toHaveBeenCalled();
  });
});

// NOTE: `invalidatePredictionStatsCache` is not currently called from any
// write path in this codebase (verified via a repo-wide grep for its name) -
// there is no prediction/match-result mutation flow that invokes it yet, so
// there is nothing to test for "runs after the write commits" or "a read
// right after invalidation sees fresh data" (#1825's original ask assumed
// this wiring already existed). These tests cover the function's own
// behavior in isolation instead. Wiring it into a mutation flow is a
// separate, deliberate follow-up for whoever owns that flow's design.
describe('CreatorEventsService invalidatePredictionStatsCache', () => {
  let service: CreatorEventsService;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    cacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: ContractService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: getRepositoryToken(CreatorEvent), useValue: {} },
        {
          provide: getRepositoryToken(CreatorEventLeaderboardEntry),
          useValue: {},
        },
        { provide: getRepositoryToken(Match), useValue: {} },
        { provide: getRepositoryToken(MatchPrediction), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(CreatorEventPayout), useValue: {} },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<CreatorEventsService>(CreatorEventsService);
  });

  it('clears the event stats cache key for the given event', async () => {
    await service.invalidatePredictionStatsCache('event-1');

    expect(cacheManager.del).toHaveBeenCalledWith(
      '/creator-events/event-1/stats',
    );
    expect(cacheManager.del).toHaveBeenCalledTimes(1);
  });

  it('also clears the per-user score cache key when an address is given', async () => {
    await service.invalidatePredictionStatsCache('event-1', 'GADDR1');

    expect(cacheManager.del).toHaveBeenCalledWith(
      '/creator-events/event-1/stats',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      '/creator-events/event-1/score/GADDR1',
    );
    expect(cacheManager.del).toHaveBeenCalledTimes(2);
  });

  it('does not throw and settles cleanly when called concurrently for the same event', async () => {
    await expect(
      Promise.all([
        service.invalidatePredictionStatsCache('event-1', 'GADDR1'),
        service.invalidatePredictionStatsCache('event-1', 'GADDR1'),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(cacheManager.del).toHaveBeenCalledTimes(4);
  });
});
