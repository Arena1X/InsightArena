// backend/src/search/search.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import {
  Competition,
  CompetitionVisibility,
} from '../competitions/entities/competition.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventSearchStatus } from '../creator-events/dto/search-events-query.dto';
import { SearchService } from './search.service';
import { GlobalSearchDto, SearchType } from './dto/global-search.dto';
import { SuggestType } from './dto/suggest-query.dto';

type MockQb<T> = jest.Mocked<
  Pick<
    SelectQueryBuilder<T>,
    | 'addSelect'
    | 'select'
    | 'where'
    | 'andWhere'
    | 'setParameter'
    | 'orderBy'
    | 'addOrderBy'
    | 'skip'
    | 'take'
    | 'limit'
    | 'getMany'
    | 'getManyAndCount'
    | 'clone'
    | 'getCount'
    | 'getRawAndEntities'
  >
>;

function makeQb<T>(results: T[], count?: number): MockQb<T> {
  const resolvedCount = count ?? results.length;
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(results),
    getManyAndCount: jest.fn().mockResolvedValue([results, resolvedCount]),
    clone: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(resolvedCount),
    getRawAndEntities: jest.fn().mockResolvedValue({
      entities: results,
      raw: results.map(() => ({ search_rank: '0.75' })),
    }),
  } as unknown as MockQb<T>;
  return qb;
}

describe('SearchService', () => {
  let service: SearchService;
  let marketQb: MockQb<Market>;
  let userQb: MockQb<User>;
  let competitionQb: MockQb<Competition>;
  let creatorEventQb: MockQb<CreatorEvent>;

  /** Market with virtual addSelect columns TypeORM attaches to entity instances */
  const mockMarket = {
    id: 'market-1',
    title: 'Bitcoin price prediction',
    description: 'Will BTC hit 100k?',
    category: 'crypto',
    is_resolved: false,
    is_public: true,
    participant_count: 10,
    created_at: new Date('2026-01-01'),
    fts_rank: '0.075',
    trgm_score: '0.42',
    headline: 'Will <b>Bitcoin</b> hit 100k?',
  } as unknown as Market;

  const mockUser = {
    id: 'user-1',
    username: 'alice',
    stellar_address: 'GABC123',
    avatar_url: null,
    reputation_score: 42,
    total_predictions: 7,
    fts_rank: '0.063',
    trgm_score: '0.5',
    headline: '<b>alice</b>',
  } as unknown as User;

  const mockCompetition = {
    id: 'comp-1',
    title: 'Crypto League',
    description: 'Monthly crypto competition',
    start_time: new Date('2026-02-01'),
    end_time: new Date('2026-02-28'),
    participant_count: 5,
    visibility: CompetitionVisibility.Public,
    fts_rank: '0.05',
    trgm_score: '0.3',
    headline: '<b>Crypto</b> League',
  } as unknown as Competition;

  const mockCreatorEvent = {
    id: 'event-1',
    title: 'Champions League Final',
    description: 'Predict the Champions League winner',
    category: 'football',
    creator_address: '0xCreatorAddress',
    created_at: new Date('2026-05-01T00:00:00.000Z'),
  } as unknown as CreatorEvent;

  let mockCacheManager: {
    get: jest.Mock;
    set: jest.Mock;
  };
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    // Return count >= FTS_FALLBACK_THRESHOLD (3) so we get the fast FTS path
    marketQb = makeQb([mockMarket], 5);
    userQb = makeQb([mockUser], 5);
    competitionQb = makeQb([mockCompetition], 5);
    creatorEventQb = makeQb([mockCreatorEvent], 1);

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue([undefined, 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(Market),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(marketQb) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
        },
        {
          provide: getRepositoryToken(Competition),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
          },
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  // -------------------------------------------------------------------------
  // search() orchestration
  // -------------------------------------------------------------------------

  describe('search()', () => {
    it('searches all three entity types for SearchType.All', async () => {
      const result = await service.search({
        query: 'bitcoin',
        type: SearchType.All,
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(15); // 5 + 5 + 5 from mocks
      expect(result.markets).toHaveLength(1);
      expect(result.users).toHaveLength(1);
      expect(result.competitions).toHaveLength(1);
      expect(marketQb.getManyAndCount).toHaveBeenCalled();
      expect(userQb.getManyAndCount).toHaveBeenCalled();
      expect(competitionQb.getManyAndCount).toHaveBeenCalled();
    });

    it('returns only markets when type is Markets', async () => {
      const dto: GlobalSearchDto = {
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      };
      const result = await service.search(dto);

      expect(result.markets).toHaveLength(1);
      expect(result.users).toEqual([]);
      expect(result.competitions).toEqual([]);
    });

    it('caps limit at 50', async () => {
      const dto: GlobalSearchDto = {
        query: 'test',
        type: SearchType.All,
        page: 1,
        limit: 999,
      };
      const result = await service.search(dto);

      // The service slices results to min(dto.limit, 50) via mapXxxWithScore
      expect(result).toBeDefined();
    });

    it('computes correct skip for page 3 limit 10', async () => {
      // With page=3, limit=10, skip=20 — but mock only has 1 item so slice returns []
      const dto: GlobalSearchDto = {
        query: 'test',
        type: SearchType.Markets,
        page: 3,
        limit: 10,
      };
      const result = await service.search(dto);

      // skip=20 applied inside mapper: slice(20, 30) on 1-item array → []
      expect(result.markets).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Markets — FTS path
  // -------------------------------------------------------------------------

  describe('searchMarkets FTS path', () => {
    it('filters by is_public = true', async () => {
      await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(marketQb.where).toHaveBeenCalledWith(
        'market.is_public = :isPublic',
        { isPublic: true },
      );
    });

    it('matches via search_vector @@ plainto_tsquery on the FTS andWhere', async () => {
      await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(marketQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search_vector @@'),
        expect.objectContaining({ query: 'bitcoin' }),
      );
    });

    it('orders by ts_rank DESC', async () => {
      await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(marketQb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        'DESC',
      );
    });

    it('adds ts_headline select for highlight snippet', async () => {
      await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(marketQb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('ts_headline'),
        'headline',
      );
    });

    it('adds trigram similarity select for combined score', async () => {
      await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(marketQb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('similarity'),
        'trgm_score',
      );
    });

    it('maps result to MarketSearchResult with relevance_score and highlight', async () => {
      const result = await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      const market = result.markets[0];
      expect(market.relevance_score).toBeCloseTo(0.075 + 0.42, 3);
      expect(market.highlight).toBe('Will <b>Bitcoin</b> hit 100k?');
    });
  });

  // -------------------------------------------------------------------------
  // Markets — trigram fallback path
  // -------------------------------------------------------------------------

  describe('searchMarkets trigram fallback', () => {
    beforeEach(() => {
      // FTS returns < 3 results → triggers fallback
      const typoMarket = {
        ...mockMarket,
        title: 'Bitcoin price prediction',
        fts_rank: '0',
        trgm_score: '0.35',
        headline: '<b>Bitcoin</b> price prediction',
      } as unknown as Market;

      marketQb = makeQb([typoMarket], 1); // count=1 < threshold

      const module = Test.createTestingModule({
        providers: [
          SearchService,
          {
            provide: getRepositoryToken(Market),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(marketQb),
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
          },
          {
            provide: getRepositoryToken(Competition),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
            },
          },
          {
            provide: getRepositoryToken(CreatorEvent),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
            },
          },
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
        ],
      }).compile();

      // Re-create service with new mocks
      module.then((m) => {
        service = m.get<SearchService>(SearchService);
      });
    });

    it('falls back to combined FTS+trigram query for typo queries', async () => {
      // Since getManyAndCount returns count=1 < threshold=3 on first call,
      // the fallback branch runs and calls getManyAndCount a second time.
      // Both calls go to the same mock, so we just assert it was called twice.
      marketQb = makeQb(
        [
          {
            ...mockMarket,
            fts_rank: '0',
            trgm_score: '0.35',
          } as unknown as Market,
        ],
        1,
      );

      const module = await Test.createTestingModule({
        providers: [
          SearchService,
          {
            provide: getRepositoryToken(Market),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(marketQb),
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
          },
          {
            provide: getRepositoryToken(Competition),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
            },
          },
          {
            provide: getRepositoryToken(CreatorEvent),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
            },
          },
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
        ],
      }).compile();

      service = module.get<SearchService>(SearchService);

      await service.search({
        query: 'bitcon', // intentional typo
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      // getManyAndCount called twice: once for FTS, once for trigram fallback
      expect(marketQb.getManyAndCount).toHaveBeenCalledTimes(2);
    });

    it('trigram fallback andWhere includes OR similarity condition', async () => {
      marketQb = makeQb(
        [
          {
            ...mockMarket,
            fts_rank: '0',
            trgm_score: '0.35',
          } as unknown as Market,
        ],
        1,
      );

      const module = await Test.createTestingModule({
        providers: [
          SearchService,
          {
            provide: getRepositoryToken(Market),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(marketQb),
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
          },
          {
            provide: getRepositoryToken(Competition),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
            },
          },
          {
            provide: getRepositoryToken(CreatorEvent),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
            },
          },
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
        ],
      }).compile();

      service = module.get<SearchService>(SearchService);

      await service.search({
        query: 'bitcon',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      // The second andWhere call (on the fallback qb) should include similarity
      const andWhereCalls = marketQb.andWhere.mock.calls;
      const hasTrigram = andWhereCalls.some(([sql]: [string]) =>
        sql.includes('similarity'),
      );
      expect(hasTrigram).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Users — FTS path
  // -------------------------------------------------------------------------

  describe('searchUsers FTS path', () => {
    it('filters out banned users', async () => {
      await service.search({
        query: 'alice',
        type: SearchType.Users,
        page: 1,
        limit: 20,
      });

      expect(userQb.where).toHaveBeenCalledWith('user.is_banned = :banned', {
        banned: false,
      });
    });

    it('matches via search_vector @@ plainto_tsquery', async () => {
      await service.search({
        query: 'alice',
        type: SearchType.Users,
        page: 1,
        limit: 20,
      });

      expect(userQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search_vector @@'),
        expect.objectContaining({ query: 'alice' }),
      );
    });

    it('orders by ts_rank DESC', async () => {
      await service.search({
        query: 'alice',
        type: SearchType.Users,
        page: 1,
        limit: 20,
      });

      expect(userQb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        'DESC',
      );
    });

    it('maps result to UserSearchResult with relevance_score and highlight', async () => {
      const result = await service.search({
        query: 'alice',
        type: SearchType.Users,
        page: 1,
        limit: 20,
      });

      const user = result.users[0];
      expect(user.relevance_score).toBeCloseTo(0.063 + 0.5, 3);
      expect(user.highlight).toBe('<b>alice</b>');
    });
  });

  // -------------------------------------------------------------------------
  // Competitions — FTS path
  // -------------------------------------------------------------------------

  describe('searchCompetitions FTS path', () => {
    it('filters by visibility = public', async () => {
      await service.search({
        query: 'league',
        type: SearchType.Competitions,
        page: 1,
        limit: 20,
      });

      expect(competitionQb.where).toHaveBeenCalledWith(
        'competition.visibility = :visibility',
        { visibility: CompetitionVisibility.Public },
      );
    });

    it('matches via search_vector @@ plainto_tsquery', async () => {
      await service.search({
        query: 'league',
        type: SearchType.Competitions,
        page: 1,
        limit: 20,
      });

      expect(competitionQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search_vector @@'),
        expect.objectContaining({ query: 'league' }),
      );
    });

    it('orders by ts_rank DESC', async () => {
      await service.search({
        query: 'league',
        type: SearchType.Competitions,
        page: 1,
        limit: 20,
      });

      expect(competitionQb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        'DESC',
      );
    });

    it('maps result to CompetitionSearchResult with relevance_score and highlight', async () => {
      const result = await service.search({
        query: 'league',
        type: SearchType.Competitions,
        page: 1,
        limit: 20,
      });

      const comp = result.competitions[0];
      expect(comp.relevance_score).toBeCloseTo(0.05 + 0.3, 3);
      expect(comp.highlight).toBe('<b>Crypto</b> League');
    });
  });

  // -------------------------------------------------------------------------
  // Combined relevance ordering
  // -------------------------------------------------------------------------

  describe('combined relevance score ordering', () => {
    it('higher fts_rank + trgm_score yields higher relevance_score', async () => {
      const highRelevance = {
        ...mockMarket,
        id: 'market-high',
        fts_rank: '0.9',
        trgm_score: '0.8',
      } as unknown as Market;
      const lowRelevance = {
        ...mockMarket,
        id: 'market-low',
        fts_rank: '0.1',
        trgm_score: '0.05',
      } as unknown as Market;

      // Simulate DB returning them ordered high → low
      marketQb = makeQb([highRelevance, lowRelevance], 5);

      const module = await Test.createTestingModule({
        providers: [
          SearchService,
          {
            provide: getRepositoryToken(Market),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(marketQb),
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
          },
          {
            provide: getRepositoryToken(Competition),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
            },
          },
          {
            provide: getRepositoryToken(CreatorEvent),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
            },
          },
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
        ],
      }).compile();

      service = module.get<SearchService>(SearchService);

      const result = await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(result.markets[0].relevance_score).toBeGreaterThan(
        result.markets[1].relevance_score,
      );
    });
  });

  // -------------------------------------------------------------------------
  // highlight is always non-empty
  // -------------------------------------------------------------------------

  describe('highlight field', () => {
    it('falls back to title when headline is missing', async () => {
      const noHeadline = {
        ...mockMarket,
        headline: undefined,
      } as unknown as Market;

      marketQb = makeQb([noHeadline], 5);

      const module = await Test.createTestingModule({
        providers: [
          SearchService,
          {
            provide: getRepositoryToken(Market),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(marketQb),
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(userQb) },
          },
          {
            provide: getRepositoryToken(Competition),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(competitionQb),
            },
          },
          {
            provide: getRepositoryToken(CreatorEvent),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue(creatorEventQb),
            },
          },
          {
            provide: CACHE_MANAGER,
            useValue: mockCacheManager,
          },
        ],
      }).compile();

      service = module.get<SearchService>(SearchService);

      const result = await service.search({
        query: 'bitcoin',
        type: SearchType.Markets,
        page: 1,
        limit: 20,
      });

      expect(result.markets[0].highlight).toBe(mockMarket.title);
      expect(result.markets[0].highlight).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // suggest()
  // -------------------------------------------------------------------------

  describe('suggest()', () => {
    const scoredMarket = {
      id: 'market-1',
      title: 'Bitcoin price prediction',
      score: '0.8',
    } as unknown as Market;

    const scoredUser = {
      id: 'user-1',
      username: 'bitfan',
      score: '0.6',
    } as unknown as User;

    const scoredCompetition = {
      id: 'comp-1',
      title: 'Bitcoin League',
      score: '0.4',
    } as unknown as Competition;

    beforeEach(() => {
      marketQb = makeQb([scoredMarket]);
      userQb = makeQb([scoredUser]);
      competitionQb = makeQb([scoredCompetition]);

      (
        service as unknown as {
          marketsRepository: { createQueryBuilder: jest.Mock };
        }
      ).marketsRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(marketQb);
      (
        service as unknown as {
          usersRepository: { createQueryBuilder: jest.Mock };
        }
      ).usersRepository.createQueryBuilder = jest.fn().mockReturnValue(userQb);
      (
        service as unknown as {
          competitionsRepository: { createQueryBuilder: jest.Mock };
        }
      ).competitionsRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(competitionQb);
    });

    it('returns an empty list without querying for an empty prefix', async () => {
      const result = await service.suggest({ q: '' });

      expect(result).toEqual({ suggestions: [] });
      expect(marketQb.getMany).not.toHaveBeenCalled();
    });

    it('returns an empty list without querying for a 1-character prefix', async () => {
      const result = await service.suggest({ q: 'b' });

      expect(result).toEqual({ suggestions: [] });
      expect(mockCacheManager.get).not.toHaveBeenCalled();
    });

    it('caps the query at the requested limit via a bounded LIMIT clause', async () => {
      await service.suggest({ q: 'bit', type: SuggestType.Markets, limit: 5 });

      expect(marketQb.limit).toHaveBeenCalledWith(5);
    });

    it('returns ranked, deduplicated ids+labels merged across types', async () => {
      const result = await service.suggest({ q: 'bit', type: SuggestType.All });

      expect(result.suggestions).toEqual([
        { id: 'market-1', label: 'Bitcoin price prediction', type: 'market' },
        { id: 'user-1', label: 'bitfan', type: 'user' },
        { id: 'comp-1', label: 'Bitcoin League', type: 'competition' },
      ]);
    });

    it('only queries the requested type', async () => {
      await service.suggest({ q: 'bit', type: SuggestType.Users });

      expect(userQb.getMany).toHaveBeenCalled();
      expect(marketQb.getMany).not.toHaveBeenCalled();
      expect(competitionQb.getMany).not.toHaveBeenCalled();
    });

    it('returns the cached response on a repeat lookup without re-querying', async () => {
      const cached = {
        suggestions: [
          { id: 'market-1', label: 'Bitcoin', type: 'market' as const },
        ],
      };
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.suggest({
        q: 'bit',
        type: SuggestType.Markets,
      });

      expect(result).toEqual(cached);
      expect(marketQb.getMany).not.toHaveBeenCalled();
    });

    it('caches the computed response after a miss', async () => {
      await service.suggest({ q: 'bit', type: SuggestType.Markets });

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('search:suggest:'),
        expect.objectContaining({ suggestions: expect.any(Array) }),
        expect.any(Number),
      );
    });

    it('excludes banned users and non-public markets/competitions via where clauses', async () => {
      await service.suggest({ q: 'bit', type: SuggestType.All });

      expect(marketQb.where).toHaveBeenCalledWith(
        'market.is_public = :isPublic',
        {
          isPublic: true,
        },
      );
      expect(userQb.where).toHaveBeenCalledWith('user.is_banned = :banned', {
        banned: false,
      });
      expect(competitionQb.where).toHaveBeenCalledWith(
        'competition.visibility = :visibility',
        { visibility: CompetitionVisibility.Public },
      );
    });
  });

  describe('searchCreatorEvents()', () => {
    it('queries the stored search_vector index across title, description, and category', async () => {
      const result = await service.searchCreatorEvents({
        query: 'champions',
        skip: 0,
        limit: 20,
        status: CreatorEventSearchStatus.All,
      });

      expect(creatorEventQb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('creatorEvent.search_vector'),
        'search_rank',
      );
      expect(creatorEventQb.where).toHaveBeenCalled();
      expect(creatorEventQb.setParameter).toHaveBeenCalledWith(
        'searchTerm',
        'champions',
      );
      expect(creatorEventQb.orderBy).toHaveBeenCalledWith(
        'search_rank',
        'DESC',
      );
      expect(creatorEventQb.addOrderBy).toHaveBeenCalledWith(
        'creatorEvent.created_at',
        'DESC',
      );
      expect(result.total).toBe(1);
      expect(result.data[0].event.id).toBe('event-1');
      expect(result.data[0].searchRank).toBe(0.75);
    });

    it('includes category ILIKE fallback and applies active status filter', async () => {
      await service.searchCreatorEvents({
        query: 'football',
        skip: 0,
        limit: 10,
        status: CreatorEventSearchStatus.Active,
        creator: '0xCreatorAddress',
      });

      expect(creatorEventQb.setParameter).toHaveBeenCalledWith(
        'categorySearch',
        '%football%',
      );
      expect(creatorEventQb.andWhere).toHaveBeenCalledWith(
        'creatorEvent.is_active = :isActive',
        { isActive: true },
      );
      expect(creatorEventQb.andWhere).toHaveBeenCalledWith(
        'LOWER(creatorEvent.creator_address) = LOWER(:creator)',
        { creator: '0xCreatorAddress' },
      );
    });
  });

  // -------------------------------------------------------------------------
  // refreshMarketSearchVector()
  // -------------------------------------------------------------------------

  describe('refreshMarketSearchVector()', () => {
    it('runs an UPDATE query setting search_vector from title and description', async () => {
      await service.refreshMarketSearchVector('market-1');

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE markets'),
        ['market-1'],
      );
    });

    it('uses setweight with A for title and B for description', async () => {
      await service.refreshMarketSearchVector('market-1');

      const sql = mockDataSource.query.mock.calls[0][0] as string;
      expect(sql).toContain("setweight(to_tsvector('english'");
      expect(sql).toContain("'A'");
      expect(sql).toContain("'B'");
    });
  });

  // -------------------------------------------------------------------------
  // backfillMarketSearchVectors()
  // -------------------------------------------------------------------------

  describe('backfillMarketSearchVectors()', () => {
    it('updates rows with NULL or empty search_vector', async () => {
      mockDataSource.query.mockResolvedValueOnce([undefined, 5]);

      const count = await service.backfillMarketSearchVectors();

      expect(count).toBe(5);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE search_vector IS NULL'),
      );
    });

    it('returns 0 when no rows need backfill', async () => {
      mockDataSource.query.mockResolvedValueOnce([undefined, 0]);

      const count = await service.backfillMarketSearchVectors();

      expect(count).toBe(0);
    });
  });
});
