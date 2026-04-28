import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { PublicPredictionOutcomeFilter } from './dto/list-user-predictions.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'testuser',
    avatar_url: null,
    total_predictions: 10,
    correct_predictions: 7,
    total_staked_stroops: '1000000',
    total_winnings_stroops: '500000',
    reputation_score: 85,
    season_points: 100,
    role: 'user',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findByAddress: jest.fn(),
            findPublicPredictionsByAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicProfile', () => {
    it('should return public user profile', async () => {
      jest.spyOn(service, 'findByAddress').mockResolvedValue(mockUser);

      const result = await controller.getPublicProfile(
        mockUser.stellar_address,
      );

      expect(result).toHaveProperty('username', mockUser.username);
      expect(result).toHaveProperty(
        'stellar_address',
        mockUser.stellar_address,
      );
      expect(result).toHaveProperty(
        'reputation_score',
        mockUser.reputation_score,
      );
      expect(result).toHaveProperty(
        'total_predictions',
        mockUser.total_predictions,
      );
      expect(result).toHaveProperty(
        'correct_predictions',
        mockUser.correct_predictions,
      );
      expect(result).toHaveProperty('created_at', mockUser.created_at);
    });

    it('should not expose internal fields', async () => {
      jest.spyOn(service, 'findByAddress').mockResolvedValue(mockUser);

      const result = await controller.getPublicProfile(
        mockUser.stellar_address,
      );

      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('total_staked_stroops');
      expect(result).not.toHaveProperty('total_winnings_stroops');
      expect(result).not.toHaveProperty('season_points');
      expect(result).not.toHaveProperty('avatar_url');
      expect(result).not.toHaveProperty('updated_at');
    });

    it('should throw NotFoundException when user not found', async () => {
      jest
        .spyOn(service, 'findByAddress')
        .mockRejectedValue(
          new NotFoundException('User with address NONEXISTENT not found'),
        );

      await expect(controller.getPublicProfile('NONEXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPublicPredictions', () => {
    it('should return paginated public predictions for a user', async () => {
      const mockResult = {
        data: [
          {
            id: 'pred-1',
            chosen_outcome: 'YES',
            stake_amount_stroops: '100',
            payout_claimed: false,
            payout_amount_stroops: '0',
            tx_hash: null,
            submitted_at: new Date('2024-01-02'),
            outcome: PublicPredictionOutcomeFilter.Correct,
            market: {
              id: 'market-1',
              title: 'BTC > $100k?',
              end_time: new Date('2024-02-01'),
              resolved_outcome: 'YES',
              is_resolved: true,
              is_cancelled: false,
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      jest
        .spyOn(service, 'findPublicPredictionsByAddress')
        .mockResolvedValue(mockResult);

      const result = await controller.getPublicPredictions(
        mockUser.stellar_address,
        { page: 1, limit: 20 },
      );

      expect(service.findPublicPredictionsByAddress).toHaveBeenCalledWith(
        mockUser.stellar_address,
        { page: 1, limit: 20 },
      );
      expect(result).toEqual(mockResult);
    });
  });
});
