import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Repository } from 'typeorm';
import { SearchService } from './search.service';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { Competition } from '../competitions/entities/competition.entity';

/**
 * Integration tests for wildcard escaping in suggestions endpoint.
 * These tests verify that SQL LIKE wildcards (%, _) are properly escaped
 * and match literally rather than as patterns.
 */
describe('SearchService - Wildcard Escaping Integration', () => {
  let service: SearchService;
  let marketRepository: Repository<Market>;
  let userRepository: Repository<User>;
  let competitionRepository: Repository<Competition>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(Market),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Competition),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    marketRepository = module.get(getRepositoryToken(Market));
    userRepository = module.get(getRepositoryToken(User));
    competitionRepository = module.get(getRepositoryToken(Competition));
  });

  describe('getSuggestions - wildcard escaping', () => {
    it('escapes % wildcard in suggestions query', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);

      await service.getSuggestions('100%');

      // Verify that the % wildcard was escaped in the ILIKE query
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ term: '100\\%%' }), // % escaped, then % appended for prefix match
      );
    });

    it('escapes _ wildcard in suggestions query', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);

      await service.getSuggestions('user_name');

      // Verify that the _ wildcard was escaped in the ILIKE query
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ term: 'user\\_name%' }), // _ escaped, then % appended
      );
    });

    it('escapes both % and _ wildcards', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);

      await service.getSuggestions('50%_off');

      // Verify both wildcards were escaped
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ term: '50\\%\\_off%' }),
      );
    });

    it('does not escape non-wildcard characters', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);

      await service.getSuggestions('bitcoin');

      // Verify normal text is passed through unchanged (except for the % prefix wildcard)
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ term: 'bitcoin%' }),
      );
    });
  });

  describe('search - no LIKE wildcard escaping needed', () => {
    it('uses plainto_tsquery which does not need wildcard escaping', async () => {
      // This test documents that the main search() method uses full-text search
      // (plainto_tsquery) which operates on lexemes, not LIKE patterns,
      // so wildcard escaping is not needed there. The query parameter is passed
      // directly to plainto_tsquery.
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(marketRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);
      jest
        .spyOn(competitionRepository, 'createQueryBuilder')
        .mockReturnValue(mockQb as any);

      await service.search({
        query: '100%',
        page: 1,
        limit: 20,
      });

      // Full-text search receives the query as-is because plainto_tsquery
      // handles tokenization and doesn't use pattern matching
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('plainto_tsquery'),
        expect.objectContaining({ query: '100%' }),
      );
    });
  });
});
