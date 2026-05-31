import { Test, TestingModule } from '@nestjs/testing';
import { BroadcasterService } from './broadcaster.service';
import { EventsGateway } from './events.gateway';

const mockServer = {
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
};

const mockGateway = { server: mockServer, getServer: () => mockServer };

describe('BroadcasterService', () => {
  let service: BroadcasterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcasterService,
        { provide: EventsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(BroadcasterService);
  });

  afterEach(() => jest.clearAllMocks());

  it('broadcastEventCreated emits to all clients', () => {
    service.broadcastEventCreated({ event_id: 1, creator: 'GABC', title: 'Test' });
    expect(mockServer.emit).toHaveBeenCalledWith(
      'event:created',
      expect.objectContaining({ event: 'event:created' }),
    );
  });

  it('broadcastEventUpdated emits to event room', () => {
    service.broadcastEventUpdated(1, { title: 'Updated' });
    expect(mockServer.to).toHaveBeenCalledWith('event:1');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'event:updated',
      expect.objectContaining({ event: 'event:updated' }),
    );
  });

  it('broadcastMatchAdded emits to event room', () => {
    service.broadcastMatchAdded({ match_id: 5, event_id: 2, team_a: 'A', team_b: 'B' });
    expect(mockServer.to).toHaveBeenCalledWith('event:2');
    expect(mockServer.emit).toHaveBeenCalledWith('match:added', expect.any(Object));
  });

  it('broadcastUserJoined emits to event room', () => {
    service.broadcastUserJoined({ event_id: 3, user_address: 'GABC' });
    expect(mockServer.to).toHaveBeenCalledWith('event:3');
    expect(mockServer.emit).toHaveBeenCalledWith('user:joined', expect.any(Object));
  });

  it('broadcastPredictionSubmitted emits to event and match rooms', () => {
    service.broadcastPredictionSubmitted({ match_id: 7, event_id: 4, predictor: 'GABC' });
    expect(mockServer.to).toHaveBeenCalledWith('event:4');
    expect(mockServer.to).toHaveBeenCalledWith('match:7');
  });

  it('broadcastMatchResolved emits to event and match rooms', () => {
    service.broadcastMatchResolved({ match_id: 8, event_id: 5, winning_team: 0 });
    expect(mockServer.to).toHaveBeenCalledWith('event:5');
    expect(mockServer.to).toHaveBeenCalledWith('match:8');
  });

  it('broadcastWinnersVerified emits to event room', () => {
    service.broadcastWinnersVerified({ event_id: 6 });
    expect(mockServer.to).toHaveBeenCalledWith('event:6');
    expect(mockServer.emit).toHaveBeenCalledWith('winners:verified', expect.any(Object));
  });

  it('broadcastEventCancelled emits to event room', () => {
    service.broadcastEventCancelled({ event_id: 7, title: 'Cancelled Event' });
    expect(mockServer.to).toHaveBeenCalledWith('event:7');
    expect(mockServer.emit).toHaveBeenCalledWith('event:cancelled', expect.any(Object));
  });
});
