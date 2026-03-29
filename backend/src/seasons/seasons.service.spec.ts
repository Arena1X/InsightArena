import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { SeasonsService } from './seasons.service';
import { Season } from './entities/season.entity';
import { SorobanService } from '../soroban/soroban.service';
import { CreateSeasonDto } from './dto/create-season.dto';

describe('SeasonsService', () => {
  let service: SeasonsService;
  let seasonsRepository: jest.Mocked<
    Pick<
      Repository<Season>,
      'find' | 'exist' | 'create' | 'save' | 'remove' | 'createQueryBuilder'
    >
  >;
  let sorobanService: { createSeason: jest.Mock };

  beforeEach(async () => {
    seasonsRepository = {
      find: jest.fn(),
      exist: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    sorobanService = {
      createSeason: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        { provide: getRepositoryToken(Season), useValue: seasonsRepository },
        { provide: SorobanService, useValue: sorobanService },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn().mockResolvedValue(undefined),
              startTransaction: jest.fn().mockResolvedValue(undefined),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
                update: jest.fn(),
              },
              commitTransaction: jest.fn().mockResolvedValue(undefined),
              rollbackTransaction: jest.fn().mockResolvedValue(undefined),
              release: jest.fn().mockResolvedValue(undefined),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SeasonsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllPaginated', () => {
    it('returns data with top_winner for finalized seasons', async () => {
      const winner = {
        id: 'user-winner',
        username: 'top1',
        stellar_address: 'GABCDEF123456789012345678901234',
      };
      const s1: Season = {
        id: 's1',
        season_number: 3,
        name: 'Season 3',
        starts_at: new Date('2025-01-01'),
        ends_at: new Date('2025-12-31'),
        reward_pool_stroops: '100',
        is_active: false,
        is_finalized: true,
        top_winner: winner as Season['top_winner'],
        on_chain_season_id: null,
        soroban_tx_hash: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const getManyAndCount = jest.fn().mockResolvedValue([[s1], 15]);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount,
      } as never);

      const result = await service.findAllPaginated({ page: 1, limit: 5 });

      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].top_winner).toEqual({
        user_id: 'user-winner',
        username: 'top1',
        stellar_address: 'GABCDEF123456789012345678901234',
      });
      expect(seasonsRepository.createQueryBuilder).toHaveBeenCalledWith(
        'season',
      );
    });

    it('hides top_winner when season is not finalized', async () => {
      const winner = {
        id: 'user-winner',
        username: 'x',
        stellar_address: 'GX',
      };
      const s1: Season = {
        id: 's1',
        season_number: 1,
        name: 'Season 1',
        starts_at: new Date(),
        ends_at: new Date(),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        top_winner: winner as Season['top_winner'],
        on_chain_season_id: null,
        soroban_tx_hash: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[s1], 1]),
      } as never);

      const result = await service.findAllPaginated({ page: 1, limit: 20 });
      expect(result.data[0].top_winner).toBeNull();
    });

    it('caps limit at 50', async () => {
      const take = jest.fn().mockReturnThis();
      const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take,
        getManyAndCount,
      } as never);

      await service.findAllPaginated({ page: 1, limit: 999 });

      expect(take).toHaveBeenCalledWith(50);
    });
  });

  describe('findActive', () => {
    it('returns the season when one matches the current time window', async () => {
      const active: Season = {
        id: 'a1',
        season_number: 1,
        name: 'Season 1',
        starts_at: new Date('2020-01-01'),
        ends_at: new Date('2099-01-01'),
        reward_pool_stroops: '1',
        is_active: true,
        is_finalized: false,
        top_winner: null,
        on_chain_season_id: null,
        soroban_tx_hash: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(active),
      } as never);

      const result = await service.findActive();

      expect(result).toEqual(active);
    });

    it('throws NotFoundException when no season matches', async () => {
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.findActive()).rejects.toEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            'marked active and whose start and end times include the current moment',
          ) as unknown as string,
        }),
      );
    });
  });

  describe('create', () => {
    const dto: CreateSeasonDto = {
      season_number: 2,
      start_time: '2030-01-01T00:00:00.000Z',
      end_time: '2030-06-01T00:00:00.000Z',
      reward_pool_stroops: '1000000',
    };

    const savedSeason: Season = {
      id: 'season-uuid',
      season_number: 2,
      name: 'Season 2',
      starts_at: new Date(dto.start_time),
      ends_at: new Date(dto.end_time),
      reward_pool_stroops: dto.reward_pool_stroops,
      is_active: false,
      is_finalized: false,
      top_winner: null,
      on_chain_season_id: null,
      soroban_tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      seasonsRepository.exist.mockResolvedValue(false);
      seasonsRepository.create.mockImplementation((x) => x as Season);
      seasonsRepository.save.mockResolvedValue(savedSeason);
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      } as never);
    });

    it('persists season without Soroban by default', async () => {
      const result = await service.create(dto);

      expect(seasonsRepository.exist).toHaveBeenCalledWith({
        where: { season_number: 2 },
      });
      expect(seasonsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          season_number: 2,
          name: 'Season 2',
          reward_pool_stroops: '1000000',
          is_active: false,
          is_finalized: false,
        }),
      );
      expect(seasonsRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(savedSeason);
      expect(sorobanService.createSeason).not.toHaveBeenCalled();
    });

    it('throws when season_number exists', async () => {
      seasonsRepository.exist.mockResolvedValue(true);

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(seasonsRepository.save).not.toHaveBeenCalled();
    });

    it('throws when an active season overlaps the range', async () => {
      seasonsRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      } as never);

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(seasonsRepository.save).not.toHaveBeenCalled();
    });

    it('calls Soroban when sync_soroban is true', async () => {
      sorobanService.createSeason.mockResolvedValue({
        on_chain_season_id: 42,
        tx_hash: 'abc',
      });

      const withSync = { ...dto, sync_soroban: true };
      const afterChain = {
        ...savedSeason,
        on_chain_season_id: 42,
        soroban_tx_hash: 'abc',
      };
      seasonsRepository.save
        .mockResolvedValueOnce(savedSeason)
        .mockResolvedValueOnce(afterChain);

      const result = await service.create(withSync);

      expect(sorobanService.createSeason).toHaveBeenCalledWith(
        Math.floor(new Date(dto.start_time).getTime() / 1000),
        Math.floor(new Date(dto.end_time).getTime() / 1000),
        dto.reward_pool_stroops,
      );
      expect(seasonsRepository.save).toHaveBeenCalledTimes(2);
      expect(result.on_chain_season_id).toBe(42);
    });

    it('removes season when Soroban fails after save', async () => {
      sorobanService.createSeason.mockRejectedValue(new Error('rpc down'));
      seasonsRepository.save.mockResolvedValue(savedSeason);

      await expect(
        service.create({ ...dto, sync_soroban: true }),
      ).rejects.toThrow('rpc down');

      expect(seasonsRepository.remove).toHaveBeenCalledWith(savedSeason);
    });
  });
});
