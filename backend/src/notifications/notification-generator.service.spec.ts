import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationGeneratorService } from './notification-generator.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';

describe('NotificationGeneratorService', () => {
  let service: NotificationGeneratorService;
  let notificationsRepository: Repository<Notification>;
  let creatorEventRepository: Repository<CreatorEvent>;
  let matchRepository: Repository<Match>;
  let matchPredictionRepository: Repository<MatchPrediction>;
  let userRepository: Repository<User>;

  const mockUser: User = {
    id: 'user-1',
    stellar_address: 'GABC123',
    username: 'testuser',
    preferences: {
      event_created_notifications: true,
      match_added_notifications: true,
      prediction_submitted_notifications: true,
      match_resolved_notifications: true,
      winner_verified_notifications: true,
      event_cancelled_notifications: true,
    },
  } as User;

  const mockCreatorEvent: CreatorEvent = {
    id: 'event-1',
    on_chain_event_id: 1,
    creator_address: 'GABC123',
    title: 'Test Event',
    description: 'Test Description',
    creation_fee_paid: '100',
    on_chain_created_at: new Date(),
    is_active: true,
    is_cancelled: false,
    invite_code: null,
    max_participants: 100,
    participant_count: 1,
    match_count: 1,
  } as CreatorEvent;

  const mockMatch: Match = {
    id: 'match-1',
    on_chain_match_id: 1,
    event: mockCreatorEvent,
    team_a: 'Team A',
    team_b: 'Team B',
    match_time: new Date(),
    result_submitted: false,
    winning_team: null,
    submitted_by: null,
    submitted_at: null,
  } as Match;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGeneratorService,
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({}),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockCreatorEvent),
            find: jest.fn().mockResolvedValue([mockCreatorEvent]),
          },
        },
        {
          provide: getRepositoryToken(Match),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockMatch),
            find: jest.fn().mockResolvedValue([mockMatch]),
          },
        },
        {
          provide: getRepositoryToken(MatchPrediction),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockUser),
            find: jest.fn().mockResolvedValue([mockUser]),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationGeneratorService>(
      NotificationGeneratorService,
    );
    notificationsRepository = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    creatorEventRepository = module.get<Repository<CreatorEvent>>(
      getRepositoryToken(CreatorEvent),
    );
    matchRepository = module.get<Repository<Match>>(getRepositoryToken(Match));
    matchPredictionRepository = module.get<Repository<MatchPrediction>>(
      getRepositoryToken(MatchPrediction),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEventCreated', () => {
    it('should create notification for event creator', async () => {
      const data = {
        event_id: 1,
        creator: 'GABC123',
        title: 'Test Event',
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleEventCreated(data);
      // Flush the queue to process queued notifications
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });

    it('should skip notification if user has disabled event_created_notifications', async () => {
      const data = {
        event_id: 1,
        creator: 'GABC123',
        title: 'Test Event',
      };

      const userWithDisabledPrefs = {
        ...mockUser,
        preferences: {
          ...mockUser.preferences,
          event_created_notifications: false,
        },
      };

      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue(userWithDisabledPrefs as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleEventCreated(data);
      await service.flushQueue();

      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });

    it('should skip notification if missing event_id', async () => {
      const data = {
        creator: 'GABC123',
        title: 'Test Event',
      };

      await service.handleEventCreated(data);
      await service.flushQueue();

      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('handleMatchAdded', () => {
    it('should create notifications for all event participants', async () => {
      const data = {
        match_id: 1,
        event_id: 1,
        team_a: 'Team A',
        team_b: 'Team B',
      };

      jest
        .spyOn(creatorEventRepository, 'findOne')
        .mockResolvedValue(mockCreatorEvent as any);
      jest
        .spyOn(service as any, 'getEventParticipants')
        .mockResolvedValue(['GABC123', 'GDEF456']);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleMatchAdded(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });

    it('should skip notification if event not found', async () => {
      const data = {
        match_id: 1,
        event_id: 1,
        team_a: 'Team A',
        team_b: 'Team B',
      };

      jest.spyOn(creatorEventRepository, 'findOne').mockResolvedValue(null);

      await service.handleMatchAdded(data);
      await service.flushQueue();

      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('handleUserJoinedEvent', () => {
    it('should create notification for event creator', async () => {
      const data = {
        event_id: 1,
        user_address: 'GDEF456',
      };

      jest
        .spyOn(creatorEventRepository, 'findOne')
        .mockResolvedValue(mockCreatorEvent as any);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleUserJoinedEvent(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('handlePredictionSubmitted', () => {
    it('should create notification for predictor', async () => {
      const data = {
        match_id: 1,
        predictor: 'GABC123',
        predicted_outcome: 'TEAM_A',
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handlePredictionSubmitted(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('handleMatchResultSubmitted', () => {
    it('should create notifications for all predictors', async () => {
      const data = {
        match_id: 1,
        event_id: 1,
        winning_team: 0,
      };

      const mockPredictions = [
        {
          user: { stellar_address: 'GABC123' },
        },
        {
          user: { stellar_address: 'GDEF456' },
        },
      ];

      jest
        .spyOn(matchRepository, 'findOne')
        .mockResolvedValue(mockMatch as any);
      jest
        .spyOn(matchPredictionRepository, 'find')
        .mockResolvedValue(mockPredictions as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleMatchResultSubmitted(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('handleWinnersVerified', () => {
    it('should create notifications for winners', async () => {
      const data = {
        event_id: 1,
        winners: ['GABC123', 'GDEF456'],
      };

      const mockMatchWithPrediction = {
        ...mockMatch,
        predictions: [
          {
            user: { stellar_address: 'GABC123' },
            is_correct: true,
          },
          {
            user: { stellar_address: 'GDEF456' },
            is_correct: true,
          },
        ],
      };

      jest
        .spyOn(creatorEventRepository, 'findOne')
        .mockResolvedValue(mockCreatorEvent as any);
      jest
        .spyOn(matchRepository, 'find')
        .mockResolvedValue([mockMatchWithPrediction] as any);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleWinnersVerified(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('handleEventCancelled', () => {
    it('should create notifications for all participants', async () => {
      const data = {
        event_id: 1,
      };

      jest
        .spyOn(creatorEventRepository, 'findOne')
        .mockResolvedValue(mockCreatorEvent as any);
      jest
        .spyOn(service as any, 'getEventParticipants')
        .mockResolvedValue(['GABC123', 'GDEF456']);
      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.handleEventCancelled(data);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('batching', () => {
    it('should batch notifications when queue size exceeds batch size', async () => {
      const notifications = Array.from({ length: 100 }, (_, i) => ({
        userAddress: `GUSER${i}`,
        type: NotificationType.EventCreated,
        title: 'Test',
        message: 'Test message',
      }));

      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service['queueBatchNotifications'](notifications);
      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });

  describe('flushQueue', () => {
    it('should flush all queued notifications', async () => {
      // Queue some notifications first
      await service['queueNotification']({
        userAddress: 'GABC123',
        type: NotificationType.EventCreated,
        title: 'Test',
        message: 'Test message',
      });

      jest.spyOn(notificationsRepository, 'create').mockReturnValue({} as any);
      jest.spyOn(notificationsRepository, 'save').mockResolvedValue({} as any);

      await service.flushQueue();

      expect(notificationsRepository.create).toHaveBeenCalled();
    });
  });
});
