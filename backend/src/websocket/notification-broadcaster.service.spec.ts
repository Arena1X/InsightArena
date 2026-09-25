import { Test, TestingModule } from '@nestjs/testing';
import { NotificationBroadcasterService } from './notification-broadcaster.service';
import { EventsGateway } from './events.gateway';

describe('NotificationBroadcasterService', () => {
  let service: NotificationBroadcasterService;
  let gateway: EventsGateway;
  let mockServer: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    const mockGateway = {
      server: mockServer,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationBroadcasterService,
        {
          provide: EventsGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    service = module.get<NotificationBroadcasterService>(
      NotificationBroadcasterService,
    );
    gateway = module.get<EventsGateway>(EventsGateway);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('broadcastNewNotification', () => {
    it('should queue and batch notifications', async () => {
      const userAddress = 'GTEST123';
      const notification = {
        id: 1,
        type: 'event_created',
        title: 'Test',
        message: 'Test message',
        created_at: new Date(),
      };

      service.broadcastNewNotification(userAddress, notification);

      // Clear previous calls from module initialization
      jest.clearAllMocks();

      // Advance timers to trigger batch processing
      jest.advanceTimersByTime(1100);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userAddress}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'notification:new',
        expect.objectContaining({
          event: 'notification:new',
          data: expect.objectContaining({
            notifications: expect.arrayContaining([
              expect.objectContaining({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
              }),
            ]),
            count: 1,
          }),
        }),
      );
    });
  });

  describe('broadcastNotificationRead', () => {
    it('should broadcast read notification', () => {
      const userAddress = 'GTEST123';
      const notificationId = 1;

      service.broadcastNotificationRead(userAddress, notificationId);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userAddress}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'notification:read',
        expect.objectContaining({
          event: 'notification:read',
          data: expect.objectContaining({
            notification_id: notificationId,
          }),
        }),
      );
    });
  });

  describe('broadcastPredictionResult', () => {
    it('should broadcast prediction result to user', () => {
      const userAddress = 'GTEST123';
      const result = {
        match_id: 1,
        event_id: 1,
        winning_team: 'TEAM_A',
        user_prediction: 'TEAM_A',
        is_correct: true,
      };

      service.broadcastPredictionResult(userAddress, result);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userAddress}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'prediction:result',
        expect.objectContaining({
          event: 'prediction:result',
          data: expect.objectContaining({
            match_id: result.match_id,
            is_correct: result.is_correct,
          }),
        }),
      );
    });
  });

  describe('broadcastEventWinner', () => {
    it('should broadcast winner notification to user', () => {
      const userAddress = 'GTEST123';
      const winner = {
        event_id: 1,
        event_title: 'World Cup',
        rank: 1,
        total_winners: 3,
        correct_predictions: 10,
        total_matches: 10,
      };

      service.broadcastEventWinner(userAddress, winner);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userAddress}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'event:winner',
        expect.objectContaining({
          event: 'event:winner',
          data: expect.objectContaining({
            event_id: winner.event_id,
            rank: winner.rank,
          }),
        }),
      );
    });
  });

  describe('delivery confirmation', () => {
    it('should track delivery confirmations', () => {
      const userAddress = 'GTEST123';
      const notificationId = 1;

      expect(service.isDelivered(userAddress, notificationId)).toBe(false);

      service.confirmDelivery(userAddress, notificationId);

      expect(service.isDelivered(userAddress, notificationId)).toBe(true);
    });

    it('should request delivery confirmation', () => {
      const userAddress = 'GTEST123';
      const notificationId = 1;

      service.requestDeliveryConfirmation(userAddress, notificationId);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userAddress}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'notification:confirm',
        expect.objectContaining({
          notification_id: notificationId,
        }),
      );
    });
  });

  describe('cleanupConfirmations', () => {
    it('should remove a tracked confirmation entry older than the expiry threshold', () => {
      const userAddress = 'GTEST123';
      const notificationId = 1;

      service.requestDeliveryConfirmation(userAddress, notificationId);
      expect(service.isDelivered(userAddress, notificationId)).toBe(false);

      // Advance past the confirmation expiry threshold so the entry is stale.
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      service.cleanupConfirmations();

      // The stale entry should have been purged from tracking.
      expect(service.isDelivered(userAddress, notificationId)).toBe(false);
    });

    it('should leave a recently-created, still-pending confirmation entry untouched', () => {
      const userAddress = 'GTEST123';
      const notificationId = 2;

      service.requestDeliveryConfirmation(userAddress, notificationId);

      // Only a short amount of time passes; the entry is still fresh.
      jest.advanceTimersByTime(1000);

      service.cleanupConfirmations();

      // The recent pending entry must still be tracked.
      expect(service.isDelivered(userAddress, notificationId)).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop the cleanup interval so no further cleanup runs after destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});
