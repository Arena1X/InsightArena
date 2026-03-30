import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockNotification: Partial<Notification> = {
    id: 'notif-uuid-1',
    user_id: 'user-uuid-1',
    type: NotificationType.System,
    title: 'Test',
    message: 'Test message',
    is_read: false,
    created_at: new Date('2024-01-01'),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a notification', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      const result = await service.create(
        'user-uuid-1',
        NotificationType.System,
        'Test',
        'Test message',
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 'user-uuid-1',
        type: NotificationType.System,
        title: 'Test',
        message: 'Test message',
        metadata: undefined,
      });
      expect(result).toEqual(mockNotification);
    });

    it('should pass metadata when provided', async () => {
      const meta = { key: 'value' };
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      await service.create(
        'user-uuid-1',
        NotificationType.System,
        'T',
        'M',
        meta,
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: meta }),
      );
    });
  });

  describe('findAllForUser', () => {
    it('should return paginated notifications for a user', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockNotification], 1]);

      const result = await service.findAllForUser('user-uuid-1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should query unread only when unreadOnly=true', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllForUser('user-uuid-1', 1, 20, true);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-uuid-1', is_read: false },
        }),
      );
    });

    it('should cap limit at 100', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAllForUser('user-uuid-1', 1, 999);

      expect(result.limit).toBe(100);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('markAsRead', () => {
    it('should update notification is_read to true', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.markAsRead('notif-uuid-1', 'user-uuid-1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'notif-uuid-1', user_id: 'user-uuid-1' },
        { is_read: true },
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockRepository.update.mockResolvedValue({ affected: 3 });

      const result = await service.markAllAsRead('user-uuid-1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { user_id: 'user-uuid-1', is_read: false },
        { is_read: true },
      );
      expect(result).toEqual({ updated: 3 });
    });
  });

  describe('remove', () => {
    it('should soft delete notification when found and owned by user', async () => {
      mockRepository.findOne.mockResolvedValue(mockNotification);
      mockRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove('notif-uuid-1', 'user-uuid-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-uuid-1', user_id: 'user-uuid-1' },
      });
      expect(mockRepository.softDelete).toHaveBeenCalledWith('notif-uuid-1');
    });

    it('should throw NotFoundException when notification not found or not owned', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.remove('notif-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
