import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminAuditLog } from '../admin/entities/admin-audit-log.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import {
  FeatureFlagsService,
  FEATURE_FLAG_AUDIT_ACTIONS,
} from './feature-flags.service';

describe('FeatureFlagsService - audit trail', () => {
  let service: FeatureFlagsService;
  let featureFlagsRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let auditRepository: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const buildFlag = (overrides: Partial<FeatureFlag> = {}): FeatureFlag =>
    ({
      id: 'flag-1',
      key: 'new_slip_ui',
      name: 'New Slip UI',
      description: null,
      is_enabled: false,
      targeting_type: null,
      targeting_rules: null,
      rollout_percentage: 0,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as FeatureFlag;

  beforeEach(async () => {
    featureFlagsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    auditRepository = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        {
          provide: getRepositoryToken(FeatureFlag),
          useValue: featureFlagsRepository,
        },
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: auditRepository,
        },
      ],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
  });

  describe('update', () => {
    it('writes a TOGGLED audit entry with actor and is_enabled diff when only the toggle changes', async () => {
      const flag = buildFlag({ is_enabled: false });
      featureFlagsRepository.findOne.mockResolvedValue(flag);
      featureFlagsRepository.save.mockImplementation(async (f) => f);

      await service.update('flag-1', { is_enabled: true }, 'admin-123');

      expect(auditRepository.create).toHaveBeenCalledTimes(1);
      const entry = auditRepository.create.mock.calls[0][0];

      expect(entry.actor_id).toBe('admin-123');
      expect(entry.action).toBe(FEATURE_FLAG_AUDIT_ACTIONS.TOGGLED);
      expect(entry.target_type).toBe('feature_flag');
      expect(entry.target_id).toBe('flag-1');
      expect(entry.metadata).toEqual({
        key: 'new_slip_ui',
        changes: {
          is_enabled: { from: false, to: true },
        },
      });
      expect(auditRepository.save).toHaveBeenCalledWith(entry);
    });

    it('writes an UPDATED audit entry with per-field diffs for non-toggle changes', async () => {
      const flag = buildFlag({
        is_enabled: true,
        name: 'Old Name',
        rollout_percentage: 10,
      });
      featureFlagsRepository.findOne.mockResolvedValue(flag);
      featureFlagsRepository.save.mockImplementation(async (f) => f);

      await service.update(
        'flag-1',
        { name: 'New Name', rollout_percentage: 50, is_enabled: false },
        'admin-123',
      );

      const entry = auditRepository.create.mock.calls[0][0];
      expect(entry.action).toBe(FEATURE_FLAG_AUDIT_ACTIONS.UPDATED);
      expect(entry.metadata.changes).toEqual({
        name: { from: 'Old Name', to: 'New Name' },
        rollout_percentage: { from: 10, to: 50 },
        is_enabled: { from: true, to: false },
      });
    });

    it('records no-op updates without fabricating a diff', async () => {
      const flag = buildFlag({ is_enabled: true });
      featureFlagsRepository.findOne.mockResolvedValue(flag);
      featureFlagsRepository.save.mockImplementation(async (f) => f);

      await service.update('flag-1', { is_enabled: true }, 'admin-123');

      const entry = auditRepository.create.mock.calls[0][0];
      expect(entry.action).toBe(FEATURE_FLAG_AUDIT_ACTIONS.UPDATED);
      expect(entry.metadata.changes).toEqual({});
    });

    it('does not write an audit entry when the flag does not exist', async () => {
      featureFlagsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', { is_enabled: true }, 'admin-123'),
      ).rejects.toThrow(NotFoundException);

      expect(auditRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('writes a CREATED audit entry', async () => {
      featureFlagsRepository.findOne.mockResolvedValue(null);
      featureFlagsRepository.create.mockImplementation((v) => v);
      featureFlagsRepository.save.mockImplementation(async (f) => ({
        ...f,
        id: 'flag-new',
      }));

      await service.create(
        {
          key: 'dark_mode',
          name: 'Dark Mode',
          is_enabled: true,
        } as never,
        'admin-123',
      );

      const entry = auditRepository.create.mock.calls[0][0];
      expect(entry.actor_id).toBe('admin-123');
      expect(entry.action).toBe(FEATURE_FLAG_AUDIT_ACTIONS.CREATED);
      expect(entry.target_id).toBe('flag-new');
      expect(entry.metadata.key).toBe('dark_mode');
      expect(entry.metadata.changes).toEqual({});
    });
  });

  describe('delete', () => {
    it('writes a DELETED audit entry with the removed flag id', async () => {
      const flag = buildFlag({ is_enabled: true });
      featureFlagsRepository.findOne.mockResolvedValue(flag);
      featureFlagsRepository.delete.mockResolvedValue({ affected: 1 } as never);

      await service.delete('flag-1', 'admin-123');

      const entry = auditRepository.create.mock.calls[0][0];
      expect(entry.actor_id).toBe('admin-123');
      expect(entry.action).toBe(FEATURE_FLAG_AUDIT_ACTIONS.DELETED);
      expect(entry.target_id).toBe('flag-1');
      expect(entry.metadata.key).toBe('new_slip_ui');
    });

    it('throws and writes nothing when the flag does not exist', async () => {
      featureFlagsRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('missing', 'admin-123')).rejects.toThrow(
        NotFoundException,
      );
      expect(auditRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getAuditTrail', () => {
    it('queries feature_flag entries filtered by flag id, newest first', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'entry-1' }]),
      };
      auditRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAuditTrail('flag-1', 50);

      expect(result).toEqual([{ id: 'entry-1' }]);
      expect(qb.where).toHaveBeenCalledWith('entry.target_type = :targetType', {
        targetType: 'feature_flag',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('entry.created_at', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(50);
      expect(qb.andWhere).toHaveBeenCalledWith('entry.target_id = :flagId', {
        flagId: 'flag-1',
      });
    });
  });
});
