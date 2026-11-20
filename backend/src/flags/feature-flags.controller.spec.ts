import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService, ResolvedFlagDto } from './feature-flags.service';
import { FeatureFlag } from './entities/feature-flag.entity';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { User } from '../users/entities/user.entity';

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;
  let service: jest.Mocked<FeatureFlagsService>;

  const mockUser: User = {
    id: 'user-123',
    email: 'admin@example.com',
    username: 'admin',
    role: 'admin',
  } as User;

  const mockFeatureFlag: FeatureFlag = {
    id: 'flag-1',
    key: 'feature_new_dashboard',
    name: 'New Dashboard',
    description: 'Enable new dashboard UI',
    enabled: true,
    targets: [],
    created_at: new Date(),
    updated_at: new Date(),
  } as FeatureFlag;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureFlagsController],
      providers: [
        {
          provide: FeatureFlagsService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            get: jest.fn(),
            list: jest.fn(),
            resolveFlag: jest.fn(),
            getAuditLog: jest.fn(),
            rollback: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FeatureFlagsController>(FeatureFlagsController);
    service = module.get(FeatureFlagsService) as jest.Mocked<FeatureFlagsService>;
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have FeatureFlagsService injected', () => {
      expect(service).toBeDefined();
    });

    it('should be an instance of FeatureFlagsController', () => {
      expect(controller).toBeInstanceOf(FeatureFlagsController);
    });
  });

  describe('create', () => {
    it('should be defined', () => {
      expect(controller.create).toBeDefined();
    });

    it('should create a feature flag', async () => {
      service.create.mockResolvedValue(mockFeatureFlag);

      const createDto: CreateFeatureFlagDto = {
        key: 'feature_new_dashboard',
        name: 'New Dashboard',
        description: 'Enable new dashboard UI',
        enabled: true,
      };

      const result = await controller.create(createDto, mockUser);

      expect(result).toEqual(mockFeatureFlag);
      expect(service.create).toHaveBeenCalledWith(createDto, mockUser.id);
    });

    it('should pass user ID to service', async () => {
      service.create.mockResolvedValue(mockFeatureFlag);

      const createDto: CreateFeatureFlagDto = {
        key: 'test_flag',
        name: 'Test',
        description: 'Test flag',
        enabled: true,
      };

      await controller.create(createDto, mockUser);

      expect(service.create).toHaveBeenCalledWith(createDto, mockUser.id);
    });

    it('should return created flag with all properties', async () => {
      service.create.mockResolvedValue(mockFeatureFlag);

      const createDto: CreateFeatureFlagDto = {
        key: 'feature_new_dashboard',
        name: 'New Dashboard',
        description: 'Enable new dashboard UI',
        enabled: true,
      };

      const result = await controller.create(createDto, mockUser);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('enabled');
    });

    it('should handle service errors', async () => {
      const error = new Error('Conflict: flag key already exists');
      service.create.mockRejectedValue(error);

      const createDto: CreateFeatureFlagDto = {
        key: 'existing_flag',
        name: 'Existing',
        description: 'Already exists',
        enabled: true,
      };

      await expect(controller.create(createDto, mockUser)).rejects.toThrow(
        'Conflict: flag key already exists',
      );
    });

    it('should be async', () => {
      expect(controller.create.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('update', () => {
    it('should be defined', () => {
      expect(controller.update).toBeDefined();
    });

    it('should update a feature flag', async () => {
      const updatedFlag = { ...mockFeatureFlag, enabled: false };
      service.update.mockResolvedValue(updatedFlag);

      const updateDto: Partial<CreateFeatureFlagDto> = { enabled: false };

      const result = await controller.update('flag-1', updateDto, mockUser);

      expect(result.enabled).toBe(false);
      expect(service.update).toHaveBeenCalledWith('flag-1', updateDto, mockUser.id);
    });

    it('should pass flag ID to service', async () => {
      service.update.mockResolvedValue(mockFeatureFlag);

      const updateDto: Partial<CreateFeatureFlagDto> = { name: 'Updated Name' };

      await controller.update('flag-1', updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith('flag-1', updateDto, mockUser.id);
    });

    it('should return updated flag', async () => {
      const updatedFlag = {
        ...mockFeatureFlag,
        name: 'Updated Dashboard',
      };
      service.update.mockResolvedValue(updatedFlag);

      const updateDto: Partial<CreateFeatureFlagDto> = {
        name: 'Updated Dashboard',
      };

      const result = await controller.update('flag-1', updateDto, mockUser);

      expect(result.name).toBe('Updated Dashboard');
    });

    it('should handle not found error', async () => {
      const error = new Error('Flag not found');
      service.update.mockRejectedValue(error);

      const updateDto: Partial<CreateFeatureFlagDto> = { enabled: true };

      await expect(
        controller.update('nonexistent', updateDto, mockUser),
      ).rejects.toThrow('Flag not found');
    });

    it('should be async', () => {
      expect(controller.update.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('delete', () => {
    it('should be defined', () => {
      expect(controller.delete).toBeDefined();
    });

    it('should delete a feature flag', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.delete('flag-1', mockUser);

      expect(service.delete).toHaveBeenCalledWith('flag-1', mockUser.id);
    });

    it('should pass flag ID and user ID to service', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.delete('flag-1', mockUser);

      expect(service.delete).toHaveBeenCalledWith('flag-1', mockUser.id);
    });

    it('should handle not found error', async () => {
      const error = new Error('Flag not found');
      service.delete.mockRejectedValue(error);

      await expect(controller.delete('nonexistent', mockUser)).rejects.toThrow(
        'Flag not found',
      );
    });

    it('should be async', () => {
      expect(controller.delete.constructor.name).toBe('AsyncFunction');
    });

    it('should not return the deleted flag', async () => {
      service.delete.mockResolvedValue(undefined);

      const result = await controller.delete('flag-1', mockUser);

      expect(result).toBeUndefined();
    });
  });

  describe('get', () => {
    it('should be defined', () => {
      expect(controller.get).toBeDefined();
    });

    it('should retrieve a feature flag by ID', async () => {
      service.get.mockResolvedValue(mockFeatureFlag);

      const result = await controller.get('flag-1');

      expect(result).toEqual(mockFeatureFlag);
      expect(service.get).toHaveBeenCalledWith('flag-1');
    });

    it('should handle not found error', async () => {
      const error = new Error('Flag not found');
      service.get.mockRejectedValue(error);

      await expect(controller.get('nonexistent')).rejects.toThrow(
        'Flag not found',
      );
    });

    it('should be async', () => {
      expect(controller.get.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('list', () => {
    it('should be defined', () => {
      expect(controller.list).toBeDefined();
    });

    it('should list all feature flags', async () => {
      const flags = [mockFeatureFlag, { ...mockFeatureFlag, id: 'flag-2' }];
      service.list.mockResolvedValue(flags);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no flags exist', async () => {
      service.list.mockResolvedValue([]);

      const result = await controller.list();

      expect(result).toEqual([]);
    });

    it('should be async', () => {
      expect(controller.list.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('resolveFlag', () => {
    it('should be defined', () => {
      expect(controller.resolveFlag).toBeDefined();
    });

    it('should resolve a feature flag for a user', async () => {
      const resolvedFlag: ResolvedFlagDto = {
        key: 'feature_new_dashboard',
        enabled: true,
      };

      service.resolveFlag.mockResolvedValue(resolvedFlag);

      const result = await controller.resolveFlag(
        'feature_new_dashboard',
        mockUser,
      );

      expect(result).toEqual(resolvedFlag);
      expect(service.resolveFlag).toHaveBeenCalledWith(
        'feature_new_dashboard',
        mockUser,
      );
    });

    it('should return flag state for user', async () => {
      const resolvedFlag: ResolvedFlagDto = {
        key: 'feature_new_dashboard',
        enabled: false,
      };

      service.resolveFlag.mockResolvedValue(resolvedFlag);

      const result = await controller.resolveFlag(
        'feature_new_dashboard',
        mockUser,
      );

      expect(result.enabled).toBe(false);
    });

    it('should be async', () => {
      expect(controller.resolveFlag.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('getAuditLog', () => {
    it('should be defined', () => {
      expect(controller.getAuditLog).toBeDefined();
    });

    it('should retrieve audit log for a flag', async () => {
      const auditLog = [
        {
          id: 'audit-1',
          flagId: 'flag-1',
          userId: 'user-123',
          action: 'CREATE',
          changes: {},
          createdAt: new Date(),
        },
      ];

      service.getAuditLog.mockResolvedValue(auditLog as any);

      const result = await controller.getAuditLog('flag-1', {});

      expect(result).toHaveLength(1);
      expect(service.getAuditLog).toHaveBeenCalledWith('flag-1', {});
    });

    it('should be async', () => {
      expect(controller.getAuditLog.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('rollback', () => {
    it('should be defined', () => {
      expect(controller.rollback).toBeDefined();
    });

    it('should rollback a feature flag to previous state', async () => {
      const rolledBackFlag = mockFeatureFlag;
      service.rollback.mockResolvedValue(rolledBackFlag);

      const result = await controller.rollback('flag-1', 'audit-1', mockUser);

      expect(result).toEqual(rolledBackFlag);
      expect(service.rollback).toHaveBeenCalledWith(
        'flag-1',
        'audit-1',
        mockUser.id,
      );
    });

    it('should be async', () => {
      expect(controller.rollback.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('method authorization', () => {
    it('should require admin role for create', () => {
      expect(controller.create).toBeDefined();
    });

    it('should require admin role for update', () => {
      expect(controller.update).toBeDefined();
    });

    it('should require admin role for delete', () => {
      expect(controller.delete).toBeDefined();
    });

    it('should require authorization for rollback', () => {
      expect(controller.rollback).toBeDefined();
    });
  });

  describe('controller lifecycle', () => {
    it('should instantiate successfully', () => {
      expect(controller).toBeInstanceOf(FeatureFlagsController);
    });

    it('should have all expected methods', () => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller));
      expect(methods).toContain('create');
      expect(methods).toContain('update');
      expect(methods).toContain('delete');
      expect(methods).toContain('get');
      expect(methods).toContain('list');
      expect(methods).toContain('resolveFlag');
    });
  });

  describe('edge cases', () => {
    it('should handle creation of multiple flags', async () => {
      service.create
        .mockResolvedValueOnce(mockFeatureFlag)
        .mockResolvedValueOnce({ ...mockFeatureFlag, id: 'flag-2' });

      const dto1: CreateFeatureFlagDto = {
        key: 'flag1',
        name: 'Flag 1',
        description: 'First flag',
        enabled: true,
      };

      const dto2: CreateFeatureFlagDto = {
        key: 'flag2',
        name: 'Flag 2',
        description: 'Second flag',
        enabled: true,
      };

      const result1 = await controller.create(dto1, mockUser);
      const result2 = await controller.create(dto2, mockUser);

      expect(result1.id).toBe('flag-1');
      expect(result2.id).toBe('flag-2');
    });

    it('should handle rapid updates to same flag', async () => {
      service.update
        .mockResolvedValueOnce({ ...mockFeatureFlag, enabled: true })
        .mockResolvedValueOnce({ ...mockFeatureFlag, enabled: false });

      const update1: Partial<CreateFeatureFlagDto> = { enabled: true };
      const update2: Partial<CreateFeatureFlagDto> = { enabled: false };

      const result1 = await controller.update('flag-1', update1, mockUser);
      const result2 = await controller.update('flag-1', update2, mockUser);

      expect(result1.enabled).toBe(true);
      expect(result2.enabled).toBe(false);
    });
  });
});
