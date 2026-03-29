import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import {
  Competition,
  CompetitionVisibility,
} from './entities/competition.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { User } from '../users/entities/user.entity';

describe('CompetitionsController', () => {
  let controller: CompetitionsController;
  let service: CompetitionsService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
  };

  const mockCompetition: Partial<Competition> = {
    id: 'comp-uuid-1',
    title: 'Test Competition',
    description: 'A test competition.',
    start_time: new Date('2026-04-01'),
    end_time: new Date('2026-06-30'),
    prize_pool_stroops: '5000000000',
    visibility: CompetitionVisibility.Public,
    invite_code: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompetitionsController],
      providers: [
        {
          provide: CompetitionsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            list: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CompetitionsController>(CompetitionsController);
    service = module.get<CompetitionsService>(CompetitionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCompetition', () => {
    it('should create and return a competition', async () => {
      const dto: CreateCompetitionDto = {
        title: 'Test Competition',
        description: 'A test competition.',
        start_time: '2026-04-01T00:00:00.000Z',
        end_time: '2026-06-30T23:59:59.000Z',
        prize_pool_stroops: '5000000000',
        visibility: CompetitionVisibility.Public,
      };
      const spy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(mockCompetition as Competition);

      const result = await controller.createCompetition(dto, mockUser as User);

      expect(spy).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(mockCompetition);
    });
  });

  describe('listCompetitions', () => {
    it('should return paginated competitions', async () => {
      const mockResponse = {
        data: [mockCompetition],
        total: 1,
        page: 1,
        limit: 20,
      };

      const spy = jest
        .spyOn(service, 'list')
        .mockResolvedValue(mockResponse as never);

      const result = await controller.listCompetitions({ page: 1, limit: 20 });

      expect(spy).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getCompetition', () => {
    it('should return a competition by id', async () => {
      const spy = jest
        .spyOn(service, 'findById')
        .mockResolvedValue(mockCompetition as Competition);

      const result = await controller.getCompetition('comp-uuid-1');

      expect(spy).toHaveBeenCalledWith('comp-uuid-1');
      expect(result).toEqual(mockCompetition);
    });

    it('should throw NotFoundException when competition not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);

      await expect(controller.getCompetition('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
