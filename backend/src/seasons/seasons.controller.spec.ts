import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { Season } from './entities/season.entity';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

describe('SeasonsController', () => {
  let controller: SeasonsController;
  let service: SeasonsService;
  let mockSeasonsRepository: any;
  let mockUsersRepository: any;
  let mockNotificationsService: any;
  let mockDataSource: any;

  const mockSeason: Season = {
    id: 'season-123',
    name: 'Winter 2026',
    starts_at: new Date('2026-01-01'),
    ends_at: new Date('2026-03-31'),
    is_active: true,
    is_finalized: false,
    top_winner: null,
    top_winner_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockWinner: User = {
    id: 'user-winner',
    stellar_address: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQSTBE2DDA5V3OTLC',
    username: 'winner_user',
    avatar_url: null,
    total_predictions: 100,
    correct_predictions: 75,
    total_staked_stroops: '1000000000',
    total_winnings_stroops: '500000000',
    reputation_score: 850,
    season_points: 1500,
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockSeasonsRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockUsersRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };

    const mockQueryRunner = {
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
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(Season),
          useValue: mockSeasonsRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    controller = module.get<SeasonsController>(SeasonsController);
    service = module.get<SeasonsService>(SeasonsService);
  });

  describe('findAll', () => {
    it('should return all seasons ordered by start date descending', async () => {
      const mockSeasons = [mockSeason];
      mockSeasonsRepository.find.mockResolvedValue(mockSeasons);

      const result = await controller.findAll();

      expect(result).toEqual(mockSeasons);
      expect(mockSeasonsRepository.find).toHaveBeenCalledWith({
        order: { starts_at: 'DESC' },
      });
    });
  });

  describe('finalizeSeason', () => {
    it('should successfully finalize a season and create winner notification', async () => {
      const queryRunner = mockDataSource.createQueryRunner();
      queryRunner.manager.findOne.mockImplementation((entity, options) => {
        if (entity === Season) {
          return mockSeason;
        }
        if (entity === User) {
          return mockWinner;
        }
      });
      queryRunner.manager.save.mockResolvedValue({
        ...mockSeason,
        is_active: false,
        is_finalized: true,
        top_winner_id: mockWinner.id,
      });
      queryRunner.manager.update.mockResolvedValue({
        affected: 50,
      });
      mockSeasonsRepository.findOne.mockResolvedValue({
        ...mockSeason,
        is_active: false,
        is_finalized: true,
        top_winner: mockWinner,
      });

      const result = await controller.finalizeSeason('season-123');

      expect(result.is_finalized).toBe(true);
      expect(result.is_active).toBe(false);
      expect(result.top_winner).toBe(mockWinner);
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        mockWinner.id,
        'system',
        '🎉 Season Winner!',
        expect.stringContaining('Congratulations'),
        expect.objectContaining({
          season_id: 'season-123',
          season_name: 'Winter 2026',
        }),
      );
    });

    it('should return 404 when season does not exist', async () => {
      const queryRunner = mockDataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValue(null);

      await expect(controller.finalizeSeason('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should return 409 when season is already finalized', async () => {
      const queryRunner = mockDataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValue({
        ...mockSeason,
        is_finalized: true,
      });

      await expect(controller.finalizeSeason('season-123')).rejects.toThrow(
        ConflictException,
      );
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should reset all users season_points to 0 atomically', async () => {
      const queryRunner = mockDataSource.createQueryRunner();
      const seasonToFinalize = { ...mockSeason, is_finalized: false };
      queryRunner.manager.findOne.mockImplementation((entity, options) => {
        if (entity === Season) {
          return seasonToFinalize;
        }
        if (entity === User) {
          return mockWinner;
        }
      });
      queryRunner.manager.save.mockResolvedValue({
        ...seasonToFinalize,
        is_active: false,
        is_finalized: true,
      });
      queryRunner.manager.update.mockResolvedValue({
        affected: 50,
      });
      mockSeasonsRepository.findOne.mockResolvedValue({
        ...seasonToFinalize,
        is_active: false,
        is_finalized: true,
        top_winner: mockWinner,
      });

      await controller.finalizeSeason('season-123');

      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        User,
        {},
        { season_points: 0 },
      );
    });

    it('should handle seasons with no predictions gracefully', async () => {
      const queryRunner = mockDataSource.createQueryRunner();
      const seasonToFinalize = { ...mockSeason, is_finalized: false };
      queryRunner.manager.findOne.mockImplementation((entity, options) => {
        if (entity === Season) {
          return seasonToFinalize;
        }
        if (entity === User) {
          return null; // No users with points
        }
      });
      queryRunner.manager.save.mockResolvedValue({
        ...seasonToFinalize,
        is_active: false,
        is_finalized: true,
      });
      queryRunner.manager.update.mockResolvedValue({
        affected: 0,
      });
      mockSeasonsRepository.findOne.mockResolvedValue({
        ...seasonToFinalize,
        is_active: false,
        is_finalized: true,
        top_winner: null,
      });

      const result = await controller.finalizeSeason('season-123');

      expect(result.is_finalized).toBe(true);
      expect(result.top_winner).toBeNull();
      // Notification should not be created when no winner
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });
  });
});
