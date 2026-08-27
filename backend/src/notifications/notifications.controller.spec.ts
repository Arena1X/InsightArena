import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    username: 'testuser',
  };

  const mockNotification: Partial<Notification> = {
    id: 1,
    user_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    type: NotificationType.EventCreated,
    title: 'Test',
    message: 'Test message',
    read: false,
    created_at: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            findAllForUser: jest.fn(),
            markAsRead: jest.fn(),
            markAllAsRead: jest.fn().mockResolvedValue({ unreadCount: 0 }),
            markAllAsUnread: jest.fn().mockResolvedValue({ unreadCount: 0 }),
            markMultipleAsRead: jest.fn().mockResolvedValue({ unreadCount: 0 }),
            markMultipleAsUnread: jest
              .fn()
              .mockResolvedValue({ unreadCount: 0 }),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getNotifications', () => {
    it('should return paginated notifications for the user address', async () => {
      const paginated: Awaited<
        ReturnType<NotificationsService['findAllForUser']>
      > = {
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 20,
        unreadCount: 1,
      };
      const spy = jest
        .spyOn(service, 'findAllForUser')
        .mockResolvedValue(paginated);

      const result = await controller.getNotifications(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        mockUser as User,
        1,
        20,
        undefined,
        undefined,
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        1,
        20,
        undefined,
        undefined,
      );
      expect(result).toEqual(paginated);
    });

    it('should return 401 if user tries to access another user notifications', async () => {
      const result = await controller.getNotifications(
        'DIFFERENT_ADDRESS',
        mockUser as User,
        1,
        20,
        undefined,
        undefined,
      );

      expect(result).toEqual({
        success: false,
        message: 'Unauthorized',
        statusCode: 401,
      });
    });

    it('should pass read filter to service', async () => {
      const spy = jest.spyOn(service, 'findAllForUser').mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        unreadCount: 0,
      });

      await controller.getNotifications(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        mockUser as User,
        1,
        20,
        'true',
        undefined,
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        1,
        20,
        true,
        undefined,
      );
    });
  });

  describe('markAsRead', () => {
    it('should call service markAsRead with id and user address', async () => {
      const spy = jest.spyOn(service, 'markAsRead').mockResolvedValue();

      await controller.markAsRead('1', mockUser as User);

      expect(spy).toHaveBeenCalledWith(
        1,
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should return unreadCount from service', async () => {
      const spy = jest
        .spyOn(service, 'markAllAsRead')
        .mockResolvedValue({ unreadCount: 0 });

      const result = await controller.markAllAsRead(mockUser as User);

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
      expect(result).toEqual({ unreadCount: 0 });
    });
  });

  describe('markAllAsUnread', () => {
    it('should call service markAllAsUnread and return unreadCount', async () => {
      const spy = jest
        .spyOn(service, 'markAllAsUnread')
        .mockResolvedValue({ unreadCount: 5 });

      const result = await controller.markAllAsUnread(mockUser as User);

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
      expect(result).toEqual({ unreadCount: 5 });
    });
  });

  describe('markMultipleAsRead', () => {
    it('should call service markMultipleAsRead with ids and return unreadCount', async () => {
      const spy = jest
        .spyOn(service, 'markMultipleAsRead')
        .mockResolvedValue({ unreadCount: 3 });

      const dto = { notificationIds: [1, 2, 3] };
      const result = await controller.markMultipleAsRead(mockUser as User, dto);

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        [1, 2, 3],
      );
      expect(result).toEqual({ unreadCount: 3 });
    });

    it('should handle empty notificationIds array', async () => {
      const spy = jest
        .spyOn(service, 'markMultipleAsRead')
        .mockResolvedValue({ unreadCount: 5 });

      const dto = { notificationIds: [] };
      const result = await controller.markMultipleAsRead(mockUser as User, dto);

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        [],
      );
      expect(result).toEqual({ unreadCount: 5 });
    });
  });

  describe('markMultipleAsUnread', () => {
    it('should call service markMultipleAsUnread with ids and return unreadCount', async () => {
      const spy = jest
        .spyOn(service, 'markMultipleAsUnread')
        .mockResolvedValue({ unreadCount: 7 });

      const dto = { notificationIds: [4, 5] };
      const result = await controller.markMultipleAsUnread(
        mockUser as User,
        dto,
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        [4, 5],
      );
      expect(result).toEqual({ unreadCount: 7 });
    });

    it('should handle empty notificationIds array', async () => {
      const spy = jest
        .spyOn(service, 'markMultipleAsUnread')
        .mockResolvedValue({ unreadCount: 5 });

      const dto = { notificationIds: [] };
      const result = await controller.markMultipleAsUnread(
        mockUser as User,
        dto,
      );

      expect(spy).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        [],
      );
      expect(result).toEqual({ unreadCount: 5 });
    });
  });

  describe('remove', () => {
    it('should call service remove with id and user address', async () => {
      const spy = jest.spyOn(service, 'remove').mockResolvedValue();

      await controller.remove('1', mockUser as User);

      expect(spy).toHaveBeenCalledWith(
        1,
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
    });
  });
});
