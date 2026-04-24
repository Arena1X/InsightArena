import { Test, TestingModule } from '@nestjs/testing';
import { CreateSeasonDto } from './dto/create-season.dto';
import { Season } from './entities/season.entity';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

describe('SeasonsController', () => {
  let controller: SeasonsController;
  let service: SeasonsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        {
          provide: SeasonsService,
          useValue: {
            findAllPaginated: jest.fn(),
            findActive: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            finalizeSeason: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(SeasonsController);
    service = module.get(SeasonsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('returns paginated seasons from the service', async () => {
      const paginated = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      };
      jest.spyOn(service, 'findAllPaginated').mockResolvedValue(paginated);

      const result = await controller.list({ page: 1, limit: 20 });

      expect(service.findAllPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result).toBe(paginated);
    });
  });

  describe('getActive', () => {
    it('returns the active season from the service', async () => {
      const active = {
        id: 'act-1',
        season_number: 1,
        name: 'Season 1',
      } as Season;
      jest.spyOn(service, 'findActive').mockResolvedValue(active);

      const result = await controller.getActive();

      expect(service.findActive).toHaveBeenCalled();
      expect(result).toBe(active);
    });
  });

  describe('getById', () => {
    it('returns season by ID from the service', async () => {
      const season = {
        id: 'season-123',
        season_number: 1,
        name: 'Season 1',
      } as Season;
      jest.spyOn(service, 'findById').mockResolvedValue(season);

      const result = await controller.getById('season-123');

      expect(service.findById).toHaveBeenCalledWith('season-123');
      expect(result).toBe(season);
    });

    it('throws NotFoundException for unknown season ID', async () => {
      jest
        .spyOn(service, 'findById')
        .mockRejectedValue(new Error('Season not found'));

      await expect(controller.getById('unknown-id')).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('delegates to service', async () => {
      const dto: CreateSeasonDto = {
        season_number: 1,
        start_time: '2030-01-01T00:00:00.000Z',
        end_time: '2030-12-31T00:00:00.000Z',
        reward_pool_stroops: '5000000',
      };
      const created = { id: 's1' } as Season;
      jest.spyOn(service, 'create').mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(created);
    });
  });

  describe('finalizeSeason', () => {
    it('delegates to service', async () => {
      const finalized = { id: 's1', is_finalized: true } as Season;
      jest.spyOn(service, 'finalizeSeason').mockResolvedValue(finalized);

      const result = await controller.finalizeSeason('season-123');

      expect(service.finalizeSeason).toHaveBeenCalledWith('season-123');
      expect(result).toBe(finalized);
    });
  });
});
