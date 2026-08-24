import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DigestService, aggregateDigestNotifications, DIGEST_MAX_ITEMS } from './digest.service';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDigestState } from './entities/notification-digest-state.entity';
import { EmailService } from './email.service';

describe('DigestService', () => {
  let service: DigestService;
  let prefsRepo: Repository<UserPreferences>;
  let userRepo: Repository<User>;
  let notificationRepo: Repository<Notification>;
  let digestStateRepo: Repository<NotificationDigestState>;
  let emailService: EmailService;
  let config: ConfigService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([{ digest_timezone: 'UTC' }]),
  };

  const mockUser: Partial<User> = {
    id: 'user-1',
    email: 'user@example.com',
    stellar_address: 'GABC123',
  };

  const mockPref: Partial<UserPreferences> = {
    userId: 'user-1',
    digest_frequency: 'daily',
    digest_hour: 8,
    digest_timezone: 'UTC',
    email_notifications: true,
  };

  const mockNotification: Partial<Notification> = {
    title: 'Test',
    message: 'Test message',
  } as Partial<Notification>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockUser),
          },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(NotificationDigestState),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((x) => x),
            save: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: EmailService,
          useValue: {
            queueEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
    prefsRepo = module.get<Repository<UserPreferences>>(
      getRepositoryToken(UserPreferences),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    notificationRepo = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    digestStateRepo = module.get<Repository<NotificationDigestState>>(
      getRepositoryToken(NotificationDigestState),
    );
    emailService = module.get<EmailService>(EmailService);
    config = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.getRawMany.mockResolvedValue([{ digest_timezone: 'UTC' }]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Timezone-aware time helpers ─────────────────────────────────────────

  describe('getLocalHour', () => {
    it('computes the correct local hour for a UTC-5 zone (America/New_York, January = EST)', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const hour = service['getLocalHour'](date, 'America/New_York');
      expect(hour).toBe(7);
    });

    it('computes the correct local hour for a UTC+1 zone (Africa/Lagos)', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const hour = service['getLocalHour'](date, 'Africa/Lagos');
      expect(hour).toBe(13);
    });

    it('returns the same hour for UTC itself', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const hour = service['getLocalHour'](date, 'UTC');
      expect(hour).toBe(12);
    });
  });

  describe('getLocalWeekday', () => {
    it('returns Monday (1) for a Monday UTC instant in a same-day zone', () => {
      // 2024-01-15 is a Monday
      const date = new Date('2024-01-15T12:00:00Z');
      const weekday = service['getLocalWeekday'](date, 'UTC');
      expect(weekday).toBe(1);
    });

    it('rolls over to the next local day in a far-ahead timezone', () => {
      // 23:00 UTC on Monday Jan 15 is already Tuesday Jan 16 in
      // Pacific/Auckland (UTC+13)
      const date = new Date('2024-01-15T23:00:00Z');
      const weekday = service['getLocalWeekday'](date, 'Pacific/Auckland');
      expect(weekday).toBe(2); // Tuesday
    });
  });

  describe('getLocalDailyPeriodKey / getLocalWeeklyPeriodKey', () => {
    it('produces a period key based on the local date, not the UTC date', () => {
      // 23:00 UTC Jan 15 is already Jan 16 local in Pacific/Auckland
      const date = new Date('2024-01-15T23:00:00Z');
      const utcKey = service['getLocalDailyPeriodKey'](date, 'UTC');
      const aucklandKey = service['getLocalDailyPeriodKey'](
        date,
        'Pacific/Auckland',
      );
      expect(utcKey).toBe('2024-01-15');
      expect(aucklandKey).toBe('2024-01-16');
    });

    it('produces an ISO week key', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const key = service['getLocalWeeklyPeriodKey'](date, 'UTC');
      expect(key).toMatch(/^2024-W\d{2}$/);
    });
  });

  // ── Frequency selection & timezone bucketing ────────────────────────────

  describe('handleHourlyCheck', () => {
    it('does nothing when DIGEST_ENABLED is false', async () => {
      jest.spyOn(config, 'get').mockImplementation((key: string) => {
        if (key === 'DIGEST_ENABLED') return 'false';
        return undefined;
      });

      await service.handleHourlyCheck(new Date('2024-01-15T08:00:00Z'));

      expect(prefsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('queries active timezones and runs daily digests for each', async () => {
      jest.spyOn(config, 'get').mockImplementation((key: string) => {
        if (key === 'DIGEST_ENABLED') return 'true';
        if (key === 'DIGEST_WEEKLY_DAY') return '1';
        return undefined;
      });
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { digest_timezone: 'UTC' },
        { digest_timezone: 'Africa/Lagos' },
      ]);

      const sendDailySpy = jest
        .spyOn(service, 'sendDailyDigests')
        .mockResolvedValue(undefined);

      await service.handleHourlyCheck(new Date('2024-01-15T08:00:00Z'));

      expect(sendDailySpy).toHaveBeenCalledTimes(2);
      expect(sendDailySpy).toHaveBeenCalledWith(expect.any(Date), 'UTC', 8);
      expect(sendDailySpy).toHaveBeenCalledWith(
        expect.any(Date),
        'Africa/Lagos',
        9, // UTC+1
      );
    });

    it('only runs weekly digests when the local weekday matches DIGEST_WEEKLY_DAY', async () => {
      jest.spyOn(config, 'get').mockImplementation((key: string) => {
        if (key === 'DIGEST_ENABLED') return 'true';
        if (key === 'DIGEST_WEEKLY_DAY') return '1'; // Monday
        return undefined;
      });
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { digest_timezone: 'UTC' },
      ]);
      jest.spyOn(service, 'sendDailyDigests').mockResolvedValue(undefined);
      const sendWeeklySpy = jest
        .spyOn(service, 'sendWeeklyDigests')
        .mockResolvedValue(undefined);

      // Monday
      await service.handleHourlyCheck(new Date('2024-01-15T08:00:00Z'));
      expect(sendWeeklySpy).toHaveBeenCalledTimes(1);

      sendWeeklySpy.mockClear();

      // Tuesday
      await service.handleHourlyCheck(new Date('2024-01-16T08:00:00Z'));
      expect(sendWeeklySpy).not.toHaveBeenCalled();
    });

    it('skips an unrecognized timezone without throwing', async () => {
      jest.spyOn(config, 'get').mockImplementation((key: string) => {
        if (key === 'DIGEST_ENABLED') return 'true';
        return undefined;
      });
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { digest_timezone: 'Not/A_Real_Zone' },
        { digest_timezone: 'UTC' },
      ]);
      const sendDailySpy = jest
        .spyOn(service, 'sendDailyDigests')
        .mockResolvedValue(undefined);

      await expect(
        service.handleHourlyCheck(new Date('2024-01-15T08:00:00Z')),
      ).resolves.not.toThrow();

      // the invalid zone is skipped; the valid one still gets processed
      expect(sendDailySpy).toHaveBeenCalledTimes(1);
      expect(sendDailySpy).toHaveBeenCalledWith(expect.any(Date), 'UTC', 8);
    });
  });

  describe('aggregateDigestNotifications', () => {
    it('groups items by category and de-duplicates within the window', () => {
      const notifications = [
        {
          type: 'match_resolved',
          title: 'Result posted',
          message: 'Arsenal won',
        },
        {
          type: 'match_resolved',
          title: 'Result posted',
          message: 'Arsenal won',
        },
        {
          type: 'event_created',
          title: 'New event',
          message: 'Join now',
        },
      ] as Notification[];

      const aggregated = aggregateDigestNotifications(notifications);

      expect(aggregated.totalUnique).toBe(2);
      expect(aggregated.groups).toEqual([
        {
          category: 'Results',
          items: [{ title: 'Result posted', message: 'Arsenal won' }],
        },
        {
          category: 'Events',
          items: [{ title: 'New event', message: 'Join now' }],
        },
      ]);
    });

    it('caps visible items and reports overflow count', () => {
      const notifications = Array.from({ length: DIGEST_MAX_ITEMS + 4 }, (_, i) => ({
        type: 'prediction_submitted',
        title: `Prediction ${i + 1}`,
        message: 'Submitted',
      })) as Notification[];

      const aggregated = aggregateDigestNotifications(notifications);

      expect(
        aggregated.groups.reduce((sum, group) => sum + group.items.length, 0),
      ).toBe(DIGEST_MAX_ITEMS);
      expect(aggregated.overflowCount).toBe(4);
      expect(aggregated.totalUnique).toBe(DIGEST_MAX_ITEMS + 4);
    });
  });

  // ── Digest content & idempotency ────────────────────────────────────────

  describe('runDigests / processUserDigest', () => {
    it('sends an email when there are unread notifications in the window', async () => {
      jest
        .spyOn(prefsRepo, 'find')
        .mockResolvedValue([mockPref as UserPreferences]);
      jest.spyOn(notificationRepo, 'find').mockResolvedValue([
        mockNotification as Notification,
        {
          ...mockNotification,
          type: 'event_created',
          title: 'Event created',
          message: 'Your event is live',
        } as Notification,
      ]);

      await service.sendDailyDigests(
        new Date('2024-01-15T08:00:00Z'),
        'UTC',
        8,
      );

      expect(emailService.queueEmail).toHaveBeenCalledTimes(1);
      expect(emailService.queueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Events'),
        }),
      );
      expect(digestStateRepo.save).toHaveBeenCalledTimes(1);
    });

    it('skips a user with no unread notifications in the window (does not email or write state)', async () => {
      jest
        .spyOn(prefsRepo, 'find')
        .mockResolvedValue([mockPref as UserPreferences]);
      jest.spyOn(notificationRepo, 'find').mockResolvedValue([]);

      await service.sendDailyDigests(
        new Date('2024-01-15T08:00:00Z'),
        'UTC',
        8,
      );

      expect(emailService.queueEmail).not.toHaveBeenCalled();
      expect(digestStateRepo.save).not.toHaveBeenCalled();
    });

    it('skips a user whose period was already sent (idempotency)', async () => {
      jest
        .spyOn(prefsRepo, 'find')
        .mockResolvedValue([mockPref as UserPreferences]);
      jest
        .spyOn(notificationRepo, 'find')
        .mockResolvedValue([mockNotification as Notification]);
      jest.spyOn(digestStateRepo, 'findOne').mockResolvedValue({
        userId: 'user-1',
        lastDailyPeriod: '2024-01-15',
        lastWeeklyPeriod: null,
      } as NotificationDigestState);

      await service.sendDailyDigests(
        new Date('2024-01-15T08:00:00Z'),
        'UTC',
        8,
      );

      expect(emailService.queueEmail).not.toHaveBeenCalled();
    });

    it('filters by frequency, timezone, and hour when querying preferences', async () => {
      const findSpy = jest
        .spyOn(prefsRepo, 'find')
        .mockResolvedValue([mockPref as UserPreferences]);
      jest
        .spyOn(notificationRepo, 'find')
        .mockResolvedValue([mockNotification as Notification]);

      await service.sendWeeklyDigests(
        new Date('2024-01-15T08:00:00Z'),
        'Africa/Lagos',
        9,
      );

      expect(findSpy).toHaveBeenCalledWith({
        where: {
          digest_frequency: 'weekly',
          email_notifications: true,
          digest_timezone: 'Africa/Lagos',
          digest_hour: 9,
        },
      });
    });

    it('skips a user with no stored email', async () => {
      jest
        .spyOn(prefsRepo, 'find')
        .mockResolvedValue([mockPref as UserPreferences]);
      jest.spyOn(userRepo, 'findOne').mockResolvedValue({
        ...mockUser,
        email: null,
      } as User);

      await service.sendDailyDigests(
        new Date('2024-01-15T08:00:00Z'),
        'UTC',
        8,
      );

      expect(notificationRepo.find).not.toHaveBeenCalled();
      expect(emailService.queueEmail).not.toHaveBeenCalled();
    });
  });
});
