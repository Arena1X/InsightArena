import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import {
  GlobalSearchDto,
  GlobalSearchResponseDto,
  SearchType,
} from './dto/global-search.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SuggestQueryDto, SuggestType } from './dto/suggest-query.dto';
import { ValidationPipe, BadRequestException } from '@nestjs/common';

describe('SearchController', () => {
  let controller: SearchController;
  let service: SearchService;
  let validationPipe: ValidationPipe;

  const mockSearchResponse: GlobalSearchResponseDto = {
    markets: [],
    users: [],
    competitions: [],
    total: 0,
    total_markets: 0,
    total_users: 0,
    total_competitions: 0,
    page: 1,
    limit: 20,
  };

  const mockSuggestionsResponse = {
    markets: ['Bitcoin Market'],
    users: ['alice'],
  };

  const mockSuggestResponse = {
    suggestions: [{ id: 'market-1', label: 'Bitcoin Market', type: 'market' }],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: {
            search: jest.fn().mockResolvedValue(mockSearchResponse),
            getSuggestions: jest
              .fn()
              .mockResolvedValue(mockSuggestionsResponse),
            suggest: jest.fn().mockResolvedValue(mockSuggestResponse),
          },
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    service = module.get<SearchService>(SearchService);

    validationPipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  });

  describe('search', () => {
    it('accepts a valid search query', async () => {
      const result = await controller.search({
        query: 'bitcoin',
        type: SearchType.All,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(mockSearchResponse);
      expect(service.search).toHaveBeenCalledWith({
        query: 'bitcoin',
        type: SearchType.All,
        page: 1,
        limit: 20,
      });
    });

    it('validation pipe rejects 1-character query', async () => {
      const dto = { query: 'a', type: SearchType.All, page: 1, limit: 20 };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: GlobalSearchDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects 101-character query', async () => {
      const dto = {
        query: 'a'.repeat(101),
        type: SearchType.All,
        page: 1,
        limit: 20,
      };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: GlobalSearchDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects whitespace-only query', async () => {
      const dto = { query: '   ', type: SearchType.All, page: 1, limit: 20 };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: GlobalSearchDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects empty query', async () => {
      const dto = { query: '', type: SearchType.All, page: 1, limit: 20 };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: GlobalSearchDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSuggestions', () => {
    it('accepts a valid query', async () => {
      const result = await controller.getSuggestions({ query: 'bitcoin' });

      expect(result).toEqual(mockSuggestionsResponse);
      expect(service.getSuggestions).toHaveBeenCalledWith('bitcoin');
    });

    it('validation pipe rejects 1-character query', async () => {
      const dto = { query: 'a' };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: SearchQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects queries with only wildcards', async () => {
      const dto = { query: '%%' };

      // This will still be 2 chars, but we're testing that wildcards don't break validation
      const result = await validationPipe.transform(dto, {
        type: 'query',
        metatype: SearchQueryDto,
      });
      expect(result.query).toBe('%%');
    });
  });

  describe('suggest', () => {
    it('forwards the query to the service', async () => {
      const result = await controller.suggest({
        q: 'bit',
        type: SuggestType.All,
        limit: 10,
      });

      expect(result).toEqual(mockSuggestResponse);
      expect(service.suggest).toHaveBeenCalledWith({
        q: 'bit',
        type: SuggestType.All,
        limit: 10,
      });
    });

    it('validation pipe accepts an empty/missing prefix without throwing', async () => {
      const result = await validationPipe.transform(
        {},
        { type: 'query', metatype: SuggestQueryDto },
      );

      expect(result.q).toBeUndefined();
      expect(result.type).toBe(SuggestType.All);
    });

    it('validation pipe rejects a prefix over 100 characters', async () => {
      const dto = { q: 'a'.repeat(101) };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: SuggestQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects an invalid type', async () => {
      const dto = { q: 'bit', type: 'invalid' };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: SuggestQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validation pipe rejects a limit above the max', async () => {
      const dto = { q: 'bit', limit: 999 };

      await expect(
        validationPipe.transform(dto, {
          type: 'query',
          metatype: SuggestQueryDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
