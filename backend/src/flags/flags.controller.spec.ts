import { Test, TestingModule } from '@nestjs/testing';
import { FlagsController } from './flags.controller';
import { FlagsService } from './flags.service';
import { Flag, FlagStatus, FlagReason } from './entities/flag.entity';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';

describe('FlagsController', () => {
  let controller: FlagsController;
  let flagsService: FlagsService;

  const mockFlag: Flag = {
    id: 'flag-1',
    market_id: 'market-1',
    user_id: 'user-1',
    reason: FlagReason.INAPPROPRIATE_CONTENT,
    status: FlagStatus.PENDING,
    description: 'This is inappropriate',
    resolution_action: null,
    admin_notes: null,
    resolved_by: null,
    resolved_by_user: null,
    resolved_at: null,
    created_at: new Date(),
    market: null as any,
    user: null as any,
  };

  const mockUser = { id: 'user-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagsController],
      providers: [
        {
          provide: FlagsService,
          useValue: {
            createFlag: jest.fn(),
            listFlags: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FlagsController>(FlagsController);
    flagsService = module.get<FlagsService>(FlagsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createFlag', () => {
    it('should create a flag', async () => {
      const createFlagDto: CreateFlagDto = {
        market_id: 'market-1',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
        description: 'This is inappropriate',
      };

      const mockRequest = { user: mockUser };

      jest.spyOn(flagsService, 'createFlag').mockResolvedValue(mockFlag);

      const result = await controller.createFlag(
        createFlagDto,
        mockRequest as any,
      );

      expect(flagsService.createFlag).toHaveBeenCalledWith(
        'user-1',
        createFlagDto,
      );
      expect(result).toEqual(mockFlag);
    });
  });

  describe('getMyFlags', () => {
    it('should return user flags', async () => {
      const query: ListFlagsQueryDto = {
        page: '1',
        limit: '10',
      };

      const mockRequest = { user: mockUser };
      const mockResponse = {
        data: [mockFlag],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      jest.spyOn(flagsService, 'listFlags').mockResolvedValue(mockResponse);

      const result = await controller.getMyFlags(mockRequest as any, query);

      expect(flagsService.listFlags).toHaveBeenCalledWith({
        ...query,
        user_id: 'user-1',
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
