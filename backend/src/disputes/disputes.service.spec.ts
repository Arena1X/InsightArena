import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DisputesService, MAX_TIER } from './disputes.service';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
  DisputeSlaStage,
} from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeVote } from './entities/dispute-vote.entity';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanService } from '../soroban/soroban.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { Repository } from 'typeorm';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { AttachEvidenceDto } from './dto/attach-evidence.dto';

describe('DisputesService', () => {
  let service: DisputesService;
  let disputesRepository: Repository<Dispute>;
  let marketsRepository: Repository<Market>;
  let evidenceRepository: Repository<DisputeEvidence>;
  let votesRepository: Repository<DisputeVote>;
  let usersRepository: Repository<User>;
  let sorobanService: SorobanService;
  let notificationGenerator: jest.Mocked<NotificationGeneratorService>;
  let mockConfigGet: jest.Mock;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  const mockMarketCreator: User = {
    id: 'creator-456',
    email: 'creator@example.com',
    username: 'creatoruser',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  const mockMarket: Market = {
    id: 'market-123',
    on_chain_market_id: 'chain-market-123',
    is_resolved: true,
    resolved_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // resolved 5 days ago
    creator: mockMarketCreator,
  } as Market;

  const mockDispute: Dispute = {
    id: 'dispute-123',
    marketId: 'market-123',
    disputantId: 'user-123',
    reason: 'Test dispute reason',
    status: DisputeStatus.PENDING,
    market: mockMarket,
    disputant: mockUser,
    createdAt: new Date(),
  } as Dispute;

  beforeEach(async () => {
    mockConfigGet = jest.fn().mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DisputeEvidence),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DisputeVote),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((v: DisputeVote) => v),
            save: jest.fn((v: DisputeVote) => Promise.resolve(v)),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            raiseDispute: jest.fn(),
            resolveDispute: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: mockConfigGet,
          },
        },
        {
          provide: NotificationGeneratorService,
          useValue: {
            notifyDisputeSlaApproaching: jest.fn().mockResolvedValue(undefined),
            notifyDisputeSlaBreached: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
    disputesRepository = module.get<Repository<Dispute>>(
      getRepositoryToken(Dispute),
    );
    marketsRepository = module.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
    evidenceRepository = module.get<Repository<DisputeEvidence>>(
      getRepositoryToken(DisputeEvidence),
    );
    votesRepository = module.get<Repository<DisputeVote>>(
      getRepositoryToken(DisputeVote),
    );
    usersRepository = module.get<Repository<User>>(getRepositoryToken(User));
    sorobanService = module.get<SorobanService>(SorobanService);
    notificationGenerator = module.get(NotificationGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDisputeDto: CreateDisputeDto = {
      market_id: 'market-123',
      reason: 'Test dispute reason',
    };

    it('should create a dispute successfully', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(disputesRepository, 'create').mockReturnValue(mockDispute);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(mockDispute);
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);
      jest.spyOn(sorobanService, 'raiseDispute').mockResolvedValue({
        dispute_id: 'chain-dispute-123',
        tx_hash: 'tx-hash-123',
      });

      const result = await service.create(createDisputeDto, mockUser);

      expect(result).toEqual(mockDispute);
      expect(marketsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'market-123' },
      });
      expect(disputesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-123',
          disputantId: 'user-123',
          reason: 'Test dispute reason',
          status: DisputeStatus.PENDING,
          slaStage: DisputeSlaStage.INITIAL_REVIEW,
          slaDeadline: expect.any(Date),
        }),
      );
      expect(sorobanService.raiseDispute).toHaveBeenCalledWith(
        'chain-market-123',
        'Test dispute reason',
      );
    });

    it('should throw NotFoundException if market not found', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if market not resolved', async () => {
      const unresolvedMarket = { ...mockMarket, is_resolved: false };
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(unresolvedMarket);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if dispute window has passed', async () => {
      const oldMarket = {
        ...mockMarket,
        resolved_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // resolved 10 days ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(oldMarket);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should succeed when market was resolved 1 day ago (within 7-day window)', async () => {
      const recentMarket = {
        ...mockMarket,
        resolved_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // resolved 1 day ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(recentMarket);
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(disputesRepository, 'create').mockReturnValue(mockDispute);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(mockDispute);
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);
      jest.spyOn(sorobanService, 'raiseDispute').mockResolvedValue({
        dispute_id: 'chain-dispute-123',
        tx_hash: 'tx-hash-123',
      });

      const result = await service.create(createDisputeDto, mockUser);

      expect(result).toEqual(mockDispute);
    });

    it('should throw BadRequestException when market was resolved 8 days ago', async () => {
      const staleMarket = {
        ...mockMarket,
        resolved_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // resolved 8 days ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(staleMarket);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        new BadRequestException('Dispute window has passed'),
      );
    });

    it('should throw ConflictException if dispute already exists regardless of status', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      };
      jest
        .spyOn(disputesRepository, 'findOne')
        .mockResolvedValue(resolvedDispute);

      await expect(service.create(createDisputeDto, mockUser)).rejects.toThrow(
        ConflictException,
      );

      expect(disputesRepository.findOne).toHaveBeenCalledWith({
        where: { marketId: 'market-123' },
      });
    });
  });

  describe('resolve', () => {
    const resolveDisputeDto: ResolveDisputeDto = {
      resolution: DisputeResolution.UPHELD,
      admin_notes: 'Admin notes',
    };

    const mockAdminUser: User = {
      ...mockUser,
      role: 'admin',
    };

    it('should resolve a dispute successfully', async () => {
      const findOneSpy = jest.spyOn(service, 'findOne');

      // First call returns the pending dispute
      findOneSpy.mockResolvedValueOnce(mockDispute);

      const saveSpy = jest.spyOn(disputesRepository, 'save');
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        resolution: DisputeResolution.UPHELD,
      };
      saveSpy.mockResolvedValue(resolvedDispute);

      // Second call returns the resolved dispute
      findOneSpy.mockResolvedValueOnce(resolvedDispute);

      jest.spyOn(sorobanService, 'resolveDispute').mockResolvedValue({
        dispute_id: 'chain-dispute-123',
        tx_hash: 'tx-hash-456',
      });

      const result = await service.resolve(
        'dispute-123',
        resolveDisputeDto,
        mockAdminUser,
      );

      expect(result.status).toBe(DisputeStatus.RESOLVED);
      expect(result.resolution).toBe(DisputeResolution.UPHELD);
      expect(disputesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DisputeStatus.RESOLVED,
          resolution: DisputeResolution.UPHELD,
          adminNotes: 'Admin notes',
          resolvedById: 'user-123',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('should throw BadRequestException if dispute is not pending', async () => {
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(resolvedDispute);

      await expect(
        service.resolve('dispute-123', resolveDisputeDto, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a dispute with relations', async () => {
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(mockDispute);

      const result = await service.findOne('dispute-123');

      expect(result).toEqual(mockDispute);
      expect(disputesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'dispute-123' },
        relations: ['market', 'disputant', 'resolvedBy'],
      });
    });

    it('should throw NotFoundException if dispute not found', async () => {
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('dispute-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByMarket', () => {
    it('should return disputes for a market', async () => {
      const disputes = [mockDispute];
      jest.spyOn(disputesRepository, 'find').mockResolvedValue(disputes);

      const result = await service.findByMarket('market-123');

      expect(result).toEqual(disputes);
      expect(disputesRepository.find).toHaveBeenCalledWith({
        where: { marketId: 'market-123' },
        relations: ['disputant', 'resolvedBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findMyDisputes', () => {
    it('should return paginated disputes for a user', async () => {
      const disputes = [mockDispute];
      const mockFindAndCount: [Dispute[], number] = [disputes, 1];
      jest
        .spyOn(disputesRepository, 'findAndCount')
        .mockResolvedValue(mockFindAndCount);

      const result = await service.findMyDisputes('user-123', 1, 20);

      expect(result).toEqual({
        disputes,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(disputesRepository.findAndCount).toHaveBeenCalledWith({
        where: { disputantId: 'user-123' },
        relations: ['market', 'resolvedBy'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('findAll', () => {
    const makeDispute = (id: string, createdAt: Date, status = DisputeStatus.PENDING): Dispute =>
      ({ ...mockDispute, id, createdAt, status }) as Dispute;

    /** Builds a chainable queryBuilder mock; `getMany` resolves to `rows`. */
    const mockQueryBuilder = (
      rows: Dispute[],
      countRows: Array<{ status: DisputeStatus; count: string }> = [],
    ) => {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
        getRawMany: jest.fn().mockResolvedValue(countRows),
      };
      return qb;
    };

    it('narrows results when filtering by status', async () => {
      const pending = makeDispute('d1', new Date('2024-01-02T00:00:00Z'));
      const qb = mockQueryBuilder([pending], [
        { status: DisputeStatus.PENDING, count: '1' },
      ]);
      jest.spyOn(disputesRepository, 'createQueryBuilder').mockReturnValue(qb);

      const result = await service.findAll({
        status: DisputeStatus.PENDING,
        limit: 20,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('dispute.status = :status', {
        status: DisputeStatus.PENDING,
      });
      expect(result.disputes).toEqual([pending]);
      expect(result.counts_by_status).toEqual({ pending: 1, resolved: 0 });
    });

    it('paginates stably via cursor, requesting one extra row to detect more pages', async () => {
      const rows = [
        makeDispute('d3', new Date('2024-01-03T00:00:00Z')),
        makeDispute('d2', new Date('2024-01-02T00:00:00Z')),
        makeDispute('d1', new Date('2024-01-01T00:00:00Z')),
      ];
      const qb = mockQueryBuilder(rows);
      jest.spyOn(disputesRepository, 'createQueryBuilder').mockReturnValue(qb);

      const result = await service.findAll({ limit: 2 } as any);

      expect(qb.take).toHaveBeenCalledWith(3);
      expect(result.disputes).toHaveLength(2);
      expect(result.has_more).toBe(true);
      expect(result.next_cursor).toBeTruthy();
    });

    it('applies the decoded cursor as a strict less-than filter on createdAt/id', async () => {
      const rows = [makeDispute('d1', new Date('2024-01-01T00:00:00Z'))];
      const qb = mockQueryBuilder(rows);
      jest.spyOn(disputesRepository, 'createQueryBuilder').mockReturnValue(qb);

      const cursor = Buffer.from(
        '2024-01-02T00:00:00.000Z:d2',
        'utf-8',
      ).toString('base64');

      const result = await service.findAll({ cursor, limit: 20 } as any);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('dispute.createdAt < :cursorCreatedAt'),
        expect.objectContaining({ cursorId: 'd2' }),
      );
      expect(result.disputes).toEqual(rows);
    });

    it('rejects a malformed cursor', async () => {
      await expect(
        service.findAll({ cursor: 'not-valid-base64-cursor!!', limit: 20 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkDisputeWindow', () => {
    it('should return true if dispute window is open', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(true);
    });

    it('should return false if market not found', async () => {
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });

    it('should return false if market not resolved', async () => {
      const unresolvedMarket = { ...mockMarket, is_resolved: false };
      jest
        .spyOn(marketsRepository, 'findOne')
        .mockResolvedValue(unresolvedMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });

    it('should return false if dispute window has passed', async () => {
      const oldMarket = {
        ...mockMarket,
        resolved_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // resolved 10 days ago
      };
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(oldMarket);

      const result = await service.checkDisputeWindow('market-123');

      expect(result).toBe(false);
    });
  });

  describe('attachEvidence', () => {
    // Cloned rather than reusing the shared mockDispute: the 'resolve'
    // describe block above mutates mockDispute.status in place via the
    // service, so relying on the shared reference here is order-dependent.
    const pendingDispute: Dispute = {
      ...mockDispute,
      status: DisputeStatus.PENDING,
    };

    const attachEvidenceDto: AttachEvidenceDto = {
      fileUrl: 'https://storage.example.com/evidence/screenshot.png',
      fileName: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 204800,
    };

    const mockEvidence: DisputeEvidence = {
      id: 'evidence-123',
      disputeId: 'dispute-123',
      uploadedById: 'user-123',
      fileUrl: attachEvidenceDto.fileUrl,
      fileName: attachEvidenceDto.fileName,
      mimeType: attachEvidenceDto.mimeType,
      sizeBytes: attachEvidenceDto.sizeBytes,
      description: null,
      createdAt: new Date(),
    } as DisputeEvidence;

    it('should attach evidence as the disputant', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(pendingDispute);
      jest.spyOn(evidenceRepository, 'create').mockReturnValue(mockEvidence);
      jest.spyOn(evidenceRepository, 'save').mockResolvedValue(mockEvidence);

      const result = await service.attachEvidence(
        'dispute-123',
        attachEvidenceDto,
        mockUser,
      );

      expect(result).toEqual(mockEvidence);
      expect(evidenceRepository.create).toHaveBeenCalledWith({
        disputeId: 'dispute-123',
        uploadedById: 'user-123',
        fileUrl: attachEvidenceDto.fileUrl,
        fileName: attachEvidenceDto.fileName,
        mimeType: attachEvidenceDto.mimeType,
        sizeBytes: attachEvidenceDto.sizeBytes,
        description: null,
      });
    });

    it('should attach evidence as the market creator', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(pendingDispute);
      jest.spyOn(evidenceRepository, 'create').mockReturnValue(mockEvidence);
      jest.spyOn(evidenceRepository, 'save').mockResolvedValue(mockEvidence);

      const result = await service.attachEvidence(
        'dispute-123',
        attachEvidenceDto,
        mockMarketCreator,
      );

      expect(result).toEqual(mockEvidence);
    });

    it('should throw ForbiddenException for a non-participant', async () => {
      const outsider = { ...mockUser, id: 'outsider-789' };
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);

      await expect(
        service.attachEvidence('dispute-123', attachEvidenceDto, outsider),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if the dispute is resolved', async () => {
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(resolvedDispute);

      await expect(
        service.attachEvidence('dispute-123', attachEvidenceDto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a disallowed mime type', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(pendingDispute);
      const dto = {
        ...attachEvidenceDto,
        mimeType: 'application/x-msdownload',
      };

      await expect(
        service.attachEvidence('dispute-123', dto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a file exceeding the size cap', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(pendingDispute);
      const dto = { ...attachEvidenceDto, sizeBytes: 999_999_999 };

      await expect(
        service.attachEvidence('dispute-123', dto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listEvidence', () => {
    const mockEvidenceList: DisputeEvidence[] = [
      {
        id: 'evidence-123',
        disputeId: 'dispute-123',
        uploadedById: 'user-123',
        fileUrl: 'https://storage.example.com/evidence/screenshot.png',
        fileName: 'screenshot.png',
        mimeType: 'image/png',
        sizeBytes: 204800,
        description: null,
        createdAt: new Date(),
      } as DisputeEvidence,
    ];

    it('should list evidence as the disputant', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);
      jest
        .spyOn(evidenceRepository, 'find')
        .mockResolvedValue(mockEvidenceList);

      const result = await service.listEvidence('dispute-123', mockUser);

      expect(result).toEqual(mockEvidenceList);
      expect(evidenceRepository.find).toHaveBeenCalledWith({
        where: { disputeId: 'dispute-123' },
        relations: ['uploadedBy'],
        order: { createdAt: 'ASC' },
      });
    });

    it('should list evidence as the market creator', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);
      jest
        .spyOn(evidenceRepository, 'find')
        .mockResolvedValue(mockEvidenceList);

      const result = await service.listEvidence(
        'dispute-123',
        mockMarketCreator,
      );

      expect(result).toEqual(mockEvidenceList);
    });

    it('should throw ForbiddenException for a non-participant', async () => {
      const outsider = { ...mockUser, id: 'outsider-789' };
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDispute);

      await expect(
        service.listEvidence('dispute-123', outsider),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assignArbiter', () => {
    const mockAdmin: User = {
      id: 'admin-1',
      role: 'admin',
      stellar_address: 'GADMIN',
    } as User;

    it('assigns an admin as the arbiter for a pending dispute', async () => {
      const pendingDispute = { ...mockDispute, status: DisputeStatus.PENDING };
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(pendingDispute)
        .mockResolvedValueOnce({
          ...pendingDispute,
          assignedArbiterId: 'admin-1',
        });
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(mockAdmin);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(pendingDispute);

      const result = await service.assignArbiter(
        'dispute-123',
        'admin-1',
        'requesting-admin',
      );

      expect(disputesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ assignedArbiterId: 'admin-1' }),
      );
      expect(result.assignedArbiterId).toBe('admin-1');
    });

    it('throws BadRequestException when the dispute is not pending', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      });

      await expect(
        service.assignArbiter('dispute-123', 'admin-1', 'requesting-admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the arbiter user does not exist', async () => {
      // Cloned rather than reusing the shared mockDispute: earlier describe
      // blocks (e.g. 'resolve') mutate mockDispute.status in place via the
      // service, so relying on the shared reference here is order-dependent.
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockDispute,
        status: DisputeStatus.PENDING,
      });
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.assignArbiter(
          'dispute-123',
          'missing-user',
          'requesting-admin',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the target user is not admin/moderator', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockDispute,
        status: DisputeStatus.PENDING,
      });
      jest.spyOn(usersRepository, 'findOne').mockResolvedValue({
        ...mockUser,
        role: 'user',
      });

      await expect(
        service.assignArbiter('dispute-123', 'user-123', 'requesting-admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('runSlaCheck', () => {
    const makePendingDispute = (overrides: Partial<Dispute> = {}): Dispute =>
      ({
        id: 'dispute-sla-1',
        marketId: 'market-123',
        status: DisputeStatus.PENDING,
        slaStage: DisputeSlaStage.INITIAL_REVIEW,
        slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        slaBreachedAt: null,
        slaApproachingNotifiedAt: null,
        slaBreachedNotifiedAt: null,
        assignedArbiter: null,
        market: { title: 'Test Market' } as any,
        ...overrides,
      }) as Dispute;

    it('does nothing when DISPUTE_SLA_ENABLED is false', async () => {
      mockConfigGet.mockReturnValue('false');
      const findSpy = jest.spyOn(disputesRepository, 'find');

      const result = await service.runSlaCheck();

      expect(result).toEqual({ approaching: 0, breached: 0, escalated: 0 });
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('notifies once when a dispute enters its approaching window', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h away, default window is 6h
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(dispute);

      const result = await service.runSlaCheck();

      expect(result.approaching).toBe(1);
      expect(dispute.slaApproachingNotifiedAt).toBeInstanceOf(Date);
      expect(
        notificationGenerator.notifyDisputeSlaApproaching,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ disputeId: 'dispute-sla-1' }),
      );
    });

    it('does not re-notify approaching once already notified', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
        slaApproachingNotifiedAt: new Date(),
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);

      const result = await service.runSlaCheck();

      expect(result.approaching).toBe(0);
      expect(
        notificationGenerator.notifyDisputeSlaApproaching,
      ).not.toHaveBeenCalled();
    });

    it('escalates and notifies on first SLA breach', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaDeadline: new Date(Date.now() - 60 * 1000), // just passed
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(dispute);

      const result = await service.runSlaCheck();

      expect(result.breached).toBe(1);
      expect(result.escalated).toBe(1);
      expect(dispute.slaStage).toBe(DisputeSlaStage.ESCALATED);
      expect(dispute.slaBreachedAt).toBeInstanceOf(Date);
      expect(dispute.slaDeadline.getTime()).toBeGreaterThan(Date.now());
      expect(
        notificationGenerator.notifyDisputeSlaBreached,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          disputeId: 'dispute-sla-1',
          escalated: true,
        }),
      );
    });

    it('does not re-escalate an already-escalated dispute still within the re-notification window', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaStage: DisputeSlaStage.ESCALATED,
        slaDeadline: new Date(Date.now() - 60 * 1000),
        slaBreachedAt: new Date(Date.now() - 60 * 1000),
        slaBreachedNotifiedAt: new Date(), // just notified
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);

      const result = await service.runSlaCheck();

      expect(result.breached).toBe(0);
      expect(result.escalated).toBe(0);
      expect(
        notificationGenerator.notifyDisputeSlaBreached,
      ).not.toHaveBeenCalled();
    });

    it('re-notifies a still-breached escalated dispute past the re-escalation interval', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaStage: DisputeSlaStage.ESCALATED,
        slaDeadline: new Date(Date.now() - 60 * 60 * 1000),
        slaBreachedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        slaBreachedNotifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // >24h ago
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(dispute);

      const result = await service.runSlaCheck();

      expect(result.breached).toBe(1);
      expect(result.escalated).toBe(0);
      // Stage does not change again - it's already at the terminal stage.
      expect(dispute.slaStage).toBe(DisputeSlaStage.ESCALATED);
      expect(
        notificationGenerator.notifyDisputeSlaBreached,
      ).toHaveBeenCalledWith(expect.objectContaining({ escalated: false }));
    });

    it('never changes dispute status - SLA tracking is advisory only', async () => {
      mockConfigGet.mockReturnValue(undefined);
      const dispute = makePendingDispute({
        slaDeadline: new Date(Date.now() - 60 * 1000),
      });
      jest.spyOn(disputesRepository, 'find').mockResolvedValue([dispute]);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(dispute);

      await service.runSlaCheck();

      expect(dispute.status).toBe(DisputeStatus.PENDING);
    });
  });

  describe('castVote', () => {
    const makeVoter = (overrides: Partial<User> = {}): User =>
      ({
        id: 'voter-1',
        stellar_address: 'GVOTER1',
        reputation_score: 50,
        ...overrides,
      }) as User;

    const makePendingTierDispute = (
      overrides: Partial<Dispute> = {},
    ): Dispute =>
      ({
        id: 'dispute-vote-1',
        marketId: 'market-123',
        status: DisputeStatus.PENDING,
        tier: 1,
        quorumThreshold: 100,
        resolution: null,
        escalatedFromId: null,
        ...overrides,
      }) as Dispute;

    const makeVote = (
      outcome: DisputeResolution,
      weight: number,
    ): DisputeVote =>
      ({
        outcome,
        weight,
        disputeId: 'dispute-vote-1',
      }) as DisputeVote;

    it('records a reputation-weighted vote and leaves the dispute open below quorum', async () => {
      const dispute = makePendingTierDispute();
      const voter = makeVoter({ reputation_score: 40 });
      jest.spyOn(service, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(votesRepository, 'findOne').mockResolvedValue(null);
      // A single 40-weight vote against a quorum of 100.
      jest
        .spyOn(votesRepository, 'find')
        .mockResolvedValue([makeVote(DisputeResolution.OVERTURNED, 40)]);
      const disputeSaveSpy = jest.spyOn(disputesRepository, 'save');

      await service.castVote(
        'dispute-vote-1',
        { outcome: DisputeResolution.OVERTURNED },
        voter,
      );

      expect(votesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          disputeId: 'dispute-vote-1',
          voterId: 'voter-1',
          voterAddress: 'GVOTER1',
          outcome: DisputeResolution.OVERTURNED,
          weight: 40,
          tier: 1,
        }),
      );
      // Below quorum: the tier is not finalized.
      expect(disputeSaveSpy).not.toHaveBeenCalled();
    });

    it('finalizes to the weighted-majority outcome once quorum is met', async () => {
      const dispute = makePendingTierDispute({ quorumThreshold: 100 });
      const voter = makeVoter({ reputation_score: 60 });
      jest.spyOn(service, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(votesRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(votesRepository, 'find')
        .mockResolvedValue([
          makeVote(DisputeResolution.OVERTURNED, 70),
          makeVote(DisputeResolution.UPHELD, 40),
        ]);
      const disputeSaveSpy = jest
        .spyOn(disputesRepository, 'save')
        .mockImplementation((d) => Promise.resolve(d as Dispute));

      await service.castVote(
        'dispute-vote-1',
        { outcome: DisputeResolution.OVERTURNED },
        voter,
      );

      // Total weight 110 >= 100 quorum, overturned (70) beats upheld (40).
      expect(disputeSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DisputeStatus.RESOLVED,
          resolution: DisputeResolution.OVERTURNED,
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('lets reputation weighting flip the outcome vs 1-address-1-vote', async () => {
      const dispute = makePendingTierDispute({ quorumThreshold: 100 });
      jest.spyOn(service, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(votesRepository, 'findOne').mockResolvedValue(null);
      // Three low-rep addresses uphold (naive count: UPHELD 3 vs OVERTURNED 1)
      // but one high-rep address overturns (weighted: 100 vs 3).
      jest
        .spyOn(votesRepository, 'find')
        .mockResolvedValue([
          makeVote(DisputeResolution.UPHELD, 1),
          makeVote(DisputeResolution.UPHELD, 1),
          makeVote(DisputeResolution.UPHELD, 1),
          makeVote(DisputeResolution.OVERTURNED, 100),
        ]);
      const disputeSaveSpy = jest
        .spyOn(disputesRepository, 'save')
        .mockImplementation((d) => Promise.resolve(d as Dispute));

      await service.castVote(
        'dispute-vote-1',
        { outcome: DisputeResolution.OVERTURNED },
        makeVoter({ reputation_score: 100, stellar_address: 'GWHALE' }),
      );

      expect(disputeSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DisputeStatus.RESOLVED,
          resolution: DisputeResolution.OVERTURNED,
        }),
      );
    });

    it('throws BadRequestException when voting on a non-pending dispute', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(
          makePendingTierDispute({ status: DisputeStatus.RESOLVED }),
        );

      await expect(
        service.castVote(
          'dispute-vote-1',
          { outcome: DisputeResolution.UPHELD },
          makeVoter(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the voter has no wallet address', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(makePendingTierDispute());

      await expect(
        service.castVote(
          'dispute-vote-1',
          { outcome: DisputeResolution.UPHELD },
          makeVoter({ stellar_address: undefined as unknown as string }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a second vote from the same address across tiers', async () => {
      // Tier-2 dispute escalated from a tier-1 dispute; the address already
      // voted at tier 1, so the chain-wide lookup returns an existing vote.
      const tier2 = makePendingTierDispute({
        id: 'dispute-tier2',
        tier: 2,
        escalatedFromId: 'dispute-tier1',
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(tier2);
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue({
        id: 'dispute-tier1',
        escalatedFromId: null,
      } as Dispute);
      jest
        .spyOn(votesRepository, 'findOne')
        .mockResolvedValue({ id: 'existing-vote' } as DisputeVote);

      await expect(
        service.castVote(
          'dispute-tier2',
          { outcome: DisputeResolution.UPHELD },
          makeVoter(),
        ),
      ).rejects.toThrow(ConflictException);

      // The double-vote lookup spans the whole chain (tier 2 + tier 1).
      expect(votesRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ voterAddress: 'GVOTER1' }),
        }),
      );
    });

    it('treats a negative reputation score as zero weight', async () => {
      const dispute = makePendingTierDispute();
      jest.spyOn(service, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(votesRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(votesRepository, 'find').mockResolvedValue([]);

      await service.castVote(
        'dispute-vote-1',
        { outcome: DisputeResolution.UPHELD },
        makeVoter({ reputation_score: -10 }),
      );

      expect(votesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 0 }),
      );
    });
  });

  describe('escalate', () => {
    const makeResolvedTierDispute = (
      overrides: Partial<Dispute> = {},
    ): Dispute =>
      ({
        id: 'dispute-esc-1',
        marketId: 'market-123',
        disputantId: 'user-123',
        reason: 'Escalation reason',
        status: DisputeStatus.RESOLVED,
        resolution: DisputeResolution.UPHELD,
        resolvedAt: new Date(),
        tier: 1,
        quorumThreshold: 100,
        escalatedFromId: null,
        ...overrides,
      }) as Dispute;

    const mockEscalator = { id: 'escalator-1' } as User;

    it('creates a higher-tier dispute within the escalation window', async () => {
      const tier1 = makeResolvedTierDispute();
      const escalated = makeResolvedTierDispute({
        id: 'dispute-esc-2',
        tier: 2,
        status: DisputeStatus.PENDING,
      });
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(tier1)
        .mockResolvedValueOnce(escalated);
      // No existing escalation of this tier.
      jest.spyOn(disputesRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(disputesRepository, 'create')
        .mockImplementation((d) => d as Dispute);
      jest.spyOn(disputesRepository, 'save').mockResolvedValue(escalated);

      const result = await service.escalate('dispute-esc-1', mockEscalator);

      expect(disputesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-123',
          disputantId: 'user-123',
          reason: 'Escalation reason',
          status: DisputeStatus.PENDING,
          tier: 2,
          quorumThreshold: 200, // tier-1 quorum (100) x multiplier (2)
          escalatedFromId: 'dispute-esc-1',
        }),
      );
      expect(result).toEqual(escalated);
    });

    it('throws BadRequestException when the dispute is not resolved', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(
          makeResolvedTierDispute({ status: DisputeStatus.PENDING }),
        );

      await expect(
        service.escalate('dispute-esc-1', mockEscalator),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when escalating past MAX_TIER', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(makeResolvedTierDispute({ tier: MAX_TIER }));

      await expect(
        service.escalate('dispute-esc-1', mockEscalator),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the escalation window has passed', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(
        makeResolvedTierDispute({
          resolvedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        }),
      );

      await expect(
        service.escalate('dispute-esc-1', mockEscalator),
      ).rejects.toThrow(
        new BadRequestException('Escalation window has passed'),
      );
    });

    it('throws ConflictException when the tier was already escalated', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(makeResolvedTierDispute());
      jest
        .spyOn(disputesRepository, 'findOne')
        .mockResolvedValue({ id: 'dispute-esc-2' } as Dispute);

      await expect(
        service.escalate('dispute-esc-1', mockEscalator),
      ).rejects.toThrow(ConflictException);
    });
  });
});
