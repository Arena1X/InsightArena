import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService, isInQuietHours } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import {
  NotificationPreference,
  NotificationChannel,
  NotificationFrequency,
} from './entities/notification-preference.entity';
import {
  NotificationCategoryPreference,
  NotificationCategory,
} from './entities/notification-category-preference.entity';
import { NotificationBroadcasterService } from '../websocket/notification-broadcaster.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeNotification = (
  overrides: Partial<Notification> = {},
): Notification =>
  ({
    id: 1,
    user_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    type: NotificationType.EventCreated,
    title: 'Test',
    message: 'Test message',
    read: false,
    data: null,
    created_at: new Date('2024-01-01'),
    deleted_at: null,
    ...overrides,
  }) as Notification;

const makePreference = (
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference =>
  ({
    id: 'pref-uuid',
    userId: 'user-1',
    channel: NotificationChannel.IN_APP,
    frequency: NotificationFrequency.INSTANT,
    quietHours: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as NotificationPreference;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  findOne: jest.fn(),
};

const mockPreferencesRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockCategoryPreferencesRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockNotificationBroadcaster = {
  broadcastNewNotification: jest.fn(),
  broadcastNotificationRead: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferencesRepo,
        },
        {
          provide: getRepositoryToken(NotificationCategoryPreference),
          useValue: mockCategoryPreferencesRepo,
        },
        {
          provide: NotificationBroadcasterService,
          useValue: mockNotificationBroadcaster,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // isInQuietHours utility
  // -------------------------------------------------------------------------

  describe('isInQuietHours', () => {
    it('returns true when current time is inside a same-day window', () => {
      // 14:00 UTC
      const now = new Date('2024-01-01T14:00:00Z');
      expect(isInQuietHours('10:00-18:00', now)).toBe(true);
    });

    it('returns false when current time is outside a same-day window', () => {
      const now = new Date('2024-01-01T08:00:00Z');
      expect(isInQuietHours('10:00-18:00', now)).toBe(false);
    });

    it('returns true for overnight window (22:00-07:00) when time is 23:00', () => {
      const now = new Date('2024-01-01T23:00:00Z');
      expect(isInQuietHours('22:00-07:00', now)).toBe(true);
    });

    it('returns true for overnight window (22:00-07:00) when time is 03:00', () => {
      const now = new Date('2024-01-02T03:00:00Z');
      expect(isInQuietHours('22:00-07:00', now)).toBe(true);
    });

    it('returns false for overnight window (22:00-07:00) when time is 10:00', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      expect(isInQuietHours('22:00-07:00', now)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // create — legacy path (no userId)
  // -------------------------------------------------------------------------

  describe('create (legacy — no userId)', () => {
    it('saves and broadcasts immediately without preference lookup', async () => {
      const saved = makeNotification();
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);

      const result = await service.create(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        NotificationType.EventCreated,
        'Test',
        'Test message',
      );

      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        expect.objectContaining({ id: saved.id }),
      );
      expect(result).toEqual(saved);
      expect(mockPreferencesRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // create — INSTANT delivery with userId
  // -------------------------------------------------------------------------

  describe('create (INSTANT frequency)', () => {
    it('broadcasts immediately for INSTANT preference', async () => {
      const saved = makeNotification();
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.INSTANT }),
      );

      await service.create(
        'GBRPYHIL',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-1',
      );

      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).toHaveBeenCalledTimes(1);
    });

    it('does NOT enqueue for INSTANT preference', async () => {
      const saved = makeNotification();
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.INSTANT }),
      );

      await service.create(
        'GBRPYHIL',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-1',
      );

      const pending = service.drainPending(
        'GBRPYHIL',
        NotificationFrequency.INSTANT,
      );
      expect(pending).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // create — DAILY delivery with userId
  // -------------------------------------------------------------------------

  describe('create (DAILY frequency)', () => {
    it('enqueues to DAILY bucket instead of broadcasting immediately', async () => {
      const saved = makeNotification({ user_address: 'GDAILY' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.DAILY }),
      );

      await service.create(
        'GDAILY',
        NotificationType.EventCreated,
        'Title',
        'Body',
        undefined,
        'user-daily',
      );

      // No immediate broadcast
      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).not.toHaveBeenCalled();

      // Should be in DAILY bucket
      const pending = service.drainPending(
        'GDAILY',
        NotificationFrequency.DAILY,
      );
      expect(pending).toHaveLength(1);
      expect(pending[0]).toEqual(saved);
    });

    it('DAILY user receives one batched digest after drain — queue is empty after', async () => {
      const notifications = [
        makeNotification({ id: 1, user_address: 'GDAILY' }),
        makeNotification({ id: 2, user_address: 'GDAILY', title: 'Second' }),
        makeNotification({ id: 3, user_address: 'GDAILY', title: 'Third' }),
      ];

      mockNotificationRepo.create
        .mockReturnValueOnce(notifications[0])
        .mockReturnValueOnce(notifications[1])
        .mockReturnValueOnce(notifications[2]);
      mockNotificationRepo.save
        .mockResolvedValueOnce(notifications[0])
        .mockResolvedValueOnce(notifications[1])
        .mockResolvedValueOnce(notifications[2]);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.DAILY }),
      );

      for (let i = 0; i < 3; i++) {
        await service.create(
          'GDAILY',
          NotificationType.EventCreated,
          `Title ${i}`,
          'Body',
          undefined,
          'user-daily',
        );
      }

      // No broadcasts yet
      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).not.toHaveBeenCalled();

      // First drain returns all 3
      const batch = service.drainPending('GDAILY', NotificationFrequency.DAILY);
      expect(batch).toHaveLength(3);

      // Second drain returns nothing (idempotent)
      const secondBatch = service.drainPending(
        'GDAILY',
        NotificationFrequency.DAILY,
      );
      expect(secondBatch).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // create — HOURLY delivery with userId
  // -------------------------------------------------------------------------

  describe('create (HOURLY frequency)', () => {
    it('enqueues to HOURLY bucket and does not broadcast', async () => {
      const saved = makeNotification({ user_address: 'GHOURLY' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.HOURLY }),
      );

      await service.create(
        'GHOURLY',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-hourly',
      );

      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).not.toHaveBeenCalled();

      const pending = service.drainPending(
        'GHOURLY',
        NotificationFrequency.HOURLY,
      );
      expect(pending).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Quiet hours — deferral, not dropping
  // -------------------------------------------------------------------------

  describe('quiet hours deferral', () => {
    it('defers INSTANT notification created during quiet hours to pending bucket', async () => {
      const saved = makeNotification({ user_address: 'GQUIET' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);

      // Quiet hours covers 22:00-07:00 UTC; mock is called at 23:30
      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T23:30:00Z'));

      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({
          frequency: NotificationFrequency.INSTANT,
          quietHours: '22:00-07:00',
        }),
      );

      await service.create(
        'GQUIET',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-quiet',
      );

      // No immediate delivery
      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).not.toHaveBeenCalled();

      // Notification is in the INSTANT bucket (deferred, not dropped)
      const pending = service.drainPending(
        'GQUIET',
        NotificationFrequency.INSTANT,
      );
      expect(pending).toHaveLength(1);
      expect(pending[0]).toEqual(saved);

      jest.useRealTimers();
    });

    it('does NOT defer when current time is outside quiet hours', async () => {
      const saved = makeNotification({ user_address: 'GACTIVE' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);

      // Outside quiet window
      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00Z'));

      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({
          frequency: NotificationFrequency.INSTANT,
          quietHours: '22:00-07:00',
        }),
      );

      await service.create(
        'GACTIVE',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-active',
      );

      // Delivered immediately
      expect(
        mockNotificationBroadcaster.broadcastNewNotification,
      ).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('notifications created during flush (drain) are not lost or double-sent', async () => {
      // Simulate: 2 notifications enqueued, drain called once, no duplicates
      const n1 = makeNotification({ id: 10, user_address: 'GSAFE' });
      const n2 = makeNotification({ id: 11, user_address: 'GSAFE' });

      mockNotificationRepo.create
        .mockReturnValueOnce(n1)
        .mockReturnValueOnce(n2);
      mockNotificationRepo.save
        .mockResolvedValueOnce(n1)
        .mockResolvedValueOnce(n2);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.DAILY }),
      );

      await service.create(
        'GSAFE',
        NotificationType.EventCreated,
        'T1',
        'M',
        undefined,
        'user-safe',
      );
      await service.create(
        'GSAFE',
        NotificationType.EventCreated,
        'T2',
        'M',
        undefined,
        'user-safe',
      );

      const batch1 = service.drainPending('GSAFE', NotificationFrequency.DAILY);
      expect(batch1).toHaveLength(2);

      // Simulate a notification created during flush (after drain)
      const n3 = makeNotification({ id: 12, user_address: 'GSAFE' });
      mockNotificationRepo.create.mockReturnValueOnce(n3);
      mockNotificationRepo.save.mockResolvedValueOnce(n3);

      await service.create(
        'GSAFE',
        NotificationType.EventCreated,
        'T3',
        'M',
        undefined,
        'user-safe',
      );

      const batch2 = service.drainPending('GSAFE', NotificationFrequency.DAILY);
      expect(batch2).toHaveLength(1);
      expect(batch2[0].id).toBe(12);
    });
  });

  // -------------------------------------------------------------------------
  // getPendingUsers
  // -------------------------------------------------------------------------

  describe('getPendingUsers', () => {
    it('returns addresses with pending DAILY notifications', async () => {
      const saved = makeNotification({ user_address: 'GADDRX' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.DAILY }),
      );

      await service.create(
        'GADDRX',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-x',
      );

      const users = service.getPendingUsers(NotificationFrequency.DAILY);
      expect(users).toContain('GADDRX');
    });

    it('does not list HOURLY users under DAILY', async () => {
      const saved = makeNotification({ user_address: 'GHOURLY2' });
      mockNotificationRepo.create.mockReturnValue(saved);
      mockNotificationRepo.save.mockResolvedValue(saved);
      mockPreferencesRepo.findOne.mockResolvedValue(
        makePreference({ frequency: NotificationFrequency.HOURLY }),
      );

      await service.create(
        'GHOURLY2',
        NotificationType.EventCreated,
        'T',
        'M',
        undefined,
        'user-h2',
      );

      const dailyUsers = service.getPendingUsers(NotificationFrequency.DAILY);
      expect(dailyUsers).not.toContain('GHOURLY2');
    });
  });

  // -------------------------------------------------------------------------
  // Preferences CRUD
  // -------------------------------------------------------------------------

  describe('getPreferences', () => {
    it('returns all preferences for a user', async () => {
      const prefs = [makePreference()];
      mockPreferencesRepo.find.mockResolvedValue(prefs);

      const result = await service.getPreferences('user-1');

      expect(mockPreferencesRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual(prefs);
    });
  });

  describe('upsertPreference', () => {
    it('creates a new preference when none exists', async () => {
      mockPreferencesRepo.findOne.mockResolvedValue(null);
      const created = makePreference({
        frequency: NotificationFrequency.DAILY,
      });
      mockPreferencesRepo.create.mockReturnValue(created);
      mockPreferencesRepo.save.mockResolvedValue(created);

      const result = await service.upsertPreference(
        'user-1',
        NotificationChannel.IN_APP,
        NotificationFrequency.DAILY,
      );

      expect(mockPreferencesRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        channel: NotificationChannel.IN_APP,
      });
      expect(mockPreferencesRepo.save).toHaveBeenCalled();
      expect(result.frequency).toBe(NotificationFrequency.DAILY);
    });

    it('updates an existing preference', async () => {
      const existing = makePreference({
        frequency: NotificationFrequency.INSTANT,
      });
      mockPreferencesRepo.findOne.mockResolvedValue(existing);
      mockPreferencesRepo.save.mockImplementation(async (pref) => pref);

      const result = await service.upsertPreference(
        'user-1',
        NotificationChannel.IN_APP,
        NotificationFrequency.HOURLY,
        '22:00-07:00',
      );

      expect(result.frequency).toBe(NotificationFrequency.HOURLY);
      expect(result.quietHours).toBe('22:00-07:00');
    });
  });

  // -------------------------------------------------------------------------
  // Existing functionality (regression)
  // -------------------------------------------------------------------------

  describe('findAllForUser', () => {
    it('returns paginated notifications', async () => {
      const n = makeNotification();
      mockNotificationRepo.findAndCount.mockResolvedValue([[n], 1]);
      mockNotificationRepo.count.mockResolvedValue(0);

      const result = await service.findAllForUser('GBRPYHIL', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.unreadCount).toBe(0);
    });

    it('caps limit at 100', async () => {
      mockNotificationRepo.findAndCount.mockResolvedValue([[], 0]);
      mockNotificationRepo.count.mockResolvedValue(0);

      const result = await service.findAllForUser('GBRPYHIL', 1, 999);

      expect(result.limit).toBe(100);
      expect(mockNotificationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('markAsRead', () => {
    it('updates read flag and broadcasts', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 1 });
      await service.markAsRead(1, 'GBRPYHIL');
      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { id: 1, user_address: 'GBRPYHIL' },
        { read: true },
      );
      expect(
        mockNotificationBroadcaster.broadcastNotificationRead,
      ).toHaveBeenCalledWith('GBRPYHIL', 1);
    });

    it('throws NotFoundException when not found', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      await expect(service.markAsRead(1, 'GDIFFERENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead', () => {
    it('marks all unread as read and returns unread count (zero)', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 3 });
      mockNotificationRepo.count.mockResolvedValue(0);

      const result = await service.markAllAsRead('GBRPYHIL');

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { user_address: 'GBRPYHIL', read: false },
        { read: true },
      );
      expect(result).toEqual({ unreadCount: 0 });
    });

    it('is idempotent — second call still returns zero', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(0);

      const result = await service.markAllAsRead('GBRPYHIL');
      expect(result).toEqual({ unreadCount: 0 });
    });
  });

  describe('markAllAsUnread', () => {
    it('marks all read as unread and returns total count as unread', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 5 });
      mockNotificationRepo.count.mockResolvedValue(5);

      const result = await service.markAllAsUnread('GBRPYHIL');

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { user_address: 'GBRPYHIL', read: true },
        { read: false },
      );
      expect(result).toEqual({ unreadCount: 5 });
    });

    it('is idempotent', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(5);

      const result = await service.markAllAsUnread('GBRPYHIL');
      expect(result).toEqual({ unreadCount: 5 });
    });
  });

  describe('markMultipleAsRead', () => {
    it('marks specified notifications as read and returns updated unread count', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 2 });
      mockNotificationRepo.count.mockResolvedValue(3);

      const result = await service.markMultipleAsRead('GBRPYHIL', [1, 2, 3]);

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { user_address: 'GBRPYHIL', id: expect.any(Object) },
        { read: true },
      );
      expect(result).toEqual({ unreadCount: 3 });
    });

    it('handles empty array gracefully (no-op)', async () => {
      mockNotificationRepo.count.mockResolvedValue(5);

      const result = await service.markMultipleAsRead('GBRPYHIL', []);

      expect(mockNotificationRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({ unreadCount: 5 });
    });

    it('is idempotent — marking already-read notifications changes nothing', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(2);

      const result = await service.markMultipleAsRead('GBRPYHIL', [1, 2]);
      expect(result).toEqual({ unreadCount: 2 });
    });

    it('scopes to the authenticated user only', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(0);

      // Even if IDs exist for another user, they won't match
      await service.markMultipleAsRead('GBRPYHIL', [99, 100]);

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        {
          user_address: 'GBRPYHIL',
          id: expect.any(Object),
        },
        { read: true },
      );
    });
  });

  describe('markMultipleAsUnread', () => {
    it('marks specified notifications as unread and returns updated unread count', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 2 });
      mockNotificationRepo.count.mockResolvedValue(7);

      const result = await service.markMultipleAsUnread('GBRPYHIL', [4, 5]);

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { user_address: 'GBRPYHIL', id: expect.any(Object) },
        { read: false },
      );
      expect(result).toEqual({ unreadCount: 7 });
    });

    it('handles empty array gracefully (no-op)', async () => {
      mockNotificationRepo.count.mockResolvedValue(5);

      const result = await service.markMultipleAsUnread('GBRPYHIL', []);

      expect(mockNotificationRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({ unreadCount: 5 });
    });

    it('is idempotent — marking already-unread notifications changes nothing', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(3);

      const result = await service.markMultipleAsUnread('GBRPYHIL', [1, 2]);
      expect(result).toEqual({ unreadCount: 3 });
    });

    it('scopes to the authenticated user only', async () => {
      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });
      mockNotificationRepo.count.mockResolvedValue(1);

      await service.markMultipleAsUnread('GBRPYHIL', [99, 100]);

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        {
          user_address: 'GBRPYHIL',
          id: expect.any(Object),
        },
        { read: false },
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes when found', async () => {
      mockNotificationRepo.findOne.mockResolvedValue(makeNotification());
      mockNotificationRepo.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(1, 'GBRPYHIL');

      expect(mockNotificationRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when not found', async () => {
      mockNotificationRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(1, 'GBRPYHIL')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Category preferences
  // -------------------------------------------------------------------------

  describe('getCategoryPreferences', () => {
    it('returns existing preferences and creates missing defaults', async () => {
      const existingPrefs = [
        {
          id: '1',
          userId: 'user-1',
          category: NotificationCategory.EventCreated,
          in_app: true,
          email: true,
          push: false,
        },
      ];
      mockCategoryPreferencesRepo.find.mockResolvedValue(existingPrefs);
      mockCategoryPreferencesRepo.create.mockImplementation((opts) => opts);
      mockCategoryPreferencesRepo.save.mockImplementation((opts) =>
        Promise.resolve(
          opts.map((p: any, i: number) => ({
            ...p,
            id: `new-${i}`,
          })),
        ),
      );

      const result = await service.getCategoryPreferences('user-1');

      expect(result.length).toBe(Object.values(NotificationCategory).length);
      expect(mockCategoryPreferencesRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('returns all defaults when no preferences exist', async () => {
      mockCategoryPreferencesRepo.find.mockResolvedValue([]);
      mockCategoryPreferencesRepo.create.mockImplementation((opts) => opts);
      mockCategoryPreferencesRepo.save.mockImplementation((opts) =>
        Promise.resolve(
          opts.map((p: any, i: number) => ({
            ...p,
            id: `new-${i}`,
          })),
        ),
      );

      const result = await service.getCategoryPreferences('user-1');

      expect(result.length).toBe(Object.values(NotificationCategory).length);
      expect(result.every((p) => p.in_app === true)).toBe(true);
      expect(result.every((p) => p.push === false)).toBe(true);
    });
  });

  describe('upsertCategoryPreference', () => {
    it('creates a new preference when none exists', async () => {
      mockCategoryPreferencesRepo.findOne.mockResolvedValue(null);
      mockCategoryPreferencesRepo.create.mockImplementation((opts) => opts);
      mockCategoryPreferencesRepo.save.mockImplementation((opts) =>
        Promise.resolve({ ...opts, id: 'new-id' }),
      );

      const result = await service.upsertCategoryPreference('user-1', {
        category: NotificationCategory.MatchResolved,
        in_app: false,
        email: true,
      });

      expect(result.in_app).toBe(false);
      expect(result.email).toBe(true);
      expect(result.push).toBe(false);
    });

    it('updates an existing preference', async () => {
      const existing = {
        id: 'existing-id',
        userId: 'user-1',
        category: NotificationCategory.EventCreated,
        in_app: true,
        email: true,
        push: false,
      };
      mockCategoryPreferencesRepo.findOne.mockResolvedValue(existing);
      mockCategoryPreferencesRepo.save.mockImplementation((opts) =>
        Promise.resolve(opts),
      );

      const result = await service.upsertCategoryPreference('user-1', {
        category: NotificationCategory.EventCreated,
        in_app: false,
      });

      expect(result.in_app).toBe(false);
      expect(result.email).toBe(true);
    });
  });

  describe('isCategoryEnabled', () => {
    it('returns true when no preference exists (default)', async () => {
      mockCategoryPreferencesRepo.findOne.mockResolvedValue(null);
      const result = await service.isCategoryEnabled(
        'user-1',
        NotificationCategory.EventCreated,
        'in_app',
      );
      expect(result).toBe(true);
    });

    it('returns the in_app value from preference', async () => {
      mockCategoryPreferencesRepo.findOne.mockResolvedValue({
        in_app: false,
        email: true,
        push: false,
      });
      const result = await service.isCategoryEnabled(
        'user-1',
        NotificationCategory.EventCreated,
        'in_app',
      );
      expect(result).toBe(false);
    });

    it('returns the email value from preference', async () => {
      mockCategoryPreferencesRepo.findOne.mockResolvedValue({
        in_app: true,
        email: false,
        push: false,
      });
      const result = await service.isCategoryEnabled(
        'user-1',
        NotificationCategory.MatchAdded,
        'email',
      );
      expect(result).toBe(false);
    });
  });
});
