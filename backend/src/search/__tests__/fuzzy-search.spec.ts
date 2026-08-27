import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SearchController } from '../search.controller';
import { SearchService } from '../search.service';
import { Market } from '../../markets/entities/market.entity';
import { User } from '../../users/entities/user.entity';
import { Competition } from '../../competitions/entities/competition.entity';
import { CreatorEvent } from '../../matches/entities/creator-event.entity';

describe('Fuzzy search endpoint', () => {
  let controller: SearchController;
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        SearchService,
        { provide: getRepositoryToken(Market), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Competition), useValue: {} },
        { provide: getRepositoryToken(CreatorEvent), useValue: {} },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
      ],
    }).compile();

    controller = module.get(SearchController);
    service = module.get(SearchService);
  });

  it('delegates fuzzy search to the service', async () => {
    const mockResult = {
      data: [{ id: '1', type: 'market' as const, title: 'Prediction Market', similarity: 0.45 }],
      total: 1,
      query: 'preidction',
    };
    jest.spyOn(service, 'fuzzySearch').mockResolvedValue(mockResult);

    const result = await controller.fuzzySearch({
      query: 'preidction',
      threshold: 0.1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].similarity).toBe(0.45);
    expect(result.total).toBe(1);
    expect(service.fuzzySearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'preidction' }),
    );
  });

  it('returns empty results for no matches', async () => {
    jest.spyOn(service, 'fuzzySearch').mockResolvedValue({
      data: [],
      total: 0,
      query: 'zzzzzzz',
    });

    const result = await controller.fuzzySearch({
      query: 'zzzzzzz',
      threshold: 0.5,
      limit: 20,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
