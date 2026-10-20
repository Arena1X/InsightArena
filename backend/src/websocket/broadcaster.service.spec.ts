import { Test, TestingModule } from '@nestjs/testing';
import { BroadcasterService } from './broadcaster.service';
import { EventsGateway } from './events.gateway';

// ---------------------------------------------------------------------------
// A more realistic server mock that records per-room emissions so we can
// assert that a broadcast for room A never appears in room B.
// ---------------------------------------------------------------------------

const makeServer = () => {
  const roomEmissions: Record<string, { event: string; payload: unknown }[]> =
    {};

  return {
    emit: jest.fn(),
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        if (!roomEmissions[room]) roomEmissions[room] = [];
        roomEmissions[room].push({ event, payload });
      }),
    })),
    _roomEmissions: roomEmissions,
    /** Returns all emission records for a given room (empty array if none). */
    emissionsFor: (room: string) => roomEmissions[room] ?? [],
    /** True when the room has never received any broadcast. */
    roomIsQuiet: (room: string) => !roomEmissions[room]?.length,
  };
};

describe('BroadcasterService', () => {
  let service: BroadcasterService;
  let server: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    server = makeServer();
    const mockGateway = { server, getServer: () => server };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcasterService,
        { provide: EventsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(BroadcasterService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Existing broadcast smoke tests
  // -------------------------------------------------------------------------

  it('broadcastEventCreated emits to all clients', () => {
    service.broadcastEventCreated({
      event_id: 1,
      creator: 'GABC',
      title: 'Test',
    });
    expect(server.emit).toHaveBeenCalledWith(
      'event:created',
      expect.objectContaining({ event: 'event:created' }),
    );
  });

  it('broadcastEventUpdated emits to event room', () => {
    service.broadcastEventUpdated(1, { title: 'Updated' });
    expect(server.to).toHaveBeenCalledWith('event:1');
    const emissions = server.emissionsFor('event:1');
    expect(emissions.length).toBeGreaterThan(0);
    expect(emissions[0].event).toBe('event:updated');
  });

  it('broadcastMatchAdded emits to event room', () => {
    service.broadcastMatchAdded({
      match_id: 5,
      event_id: 2,
      team_a: 'A',
      team_b: 'B',
    });
    expect(server.to).toHaveBeenCalledWith('event:2');
    const emissions = server.emissionsFor('event:2');
    expect(emissions[0].event).toBe('match:added');
  });

  it('broadcastUserJoined emits to event room', () => {
    service.broadcastUserJoined({ event_id: 3, user_address: 'GABC' });
    expect(server.to).toHaveBeenCalledWith('event:3');
    const emissions = server.emissionsFor('event:3');
    expect(emissions[0].event).toBe('user:joined');
  });

  it('broadcastPredictionSubmitted emits to event and match rooms', () => {
    service.broadcastPredictionSubmitted({
      match_id: 7,
      event_id: 4,
      predictor: 'GABC',
    });
    expect(server.to).toHaveBeenCalledWith('event:4');
    expect(server.to).toHaveBeenCalledWith('match:7');
  });

  it('broadcastMatchResolved emits to event and match rooms', () => {
    service.broadcastMatchResolved({
      match_id: 8,
      event_id: 5,
      winning_team: 0,
    });
    expect(server.to).toHaveBeenCalledWith('event:5');
    expect(server.to).toHaveBeenCalledWith('match:8');
  });

  it('broadcastWinnersVerified emits to event room', () => {
    service.broadcastWinnersVerified({ event_id: 6 });
    expect(server.to).toHaveBeenCalledWith('event:6');
    const emissions = server.emissionsFor('event:6');
    expect(emissions[0].event).toBe('winners:verified');
  });

  it('broadcastEventCancelled emits to event room', () => {
    service.broadcastEventCancelled({ event_id: 7, title: 'Cancelled Event' });
    expect(server.to).toHaveBeenCalledWith('event:7');
    const emissions = server.emissionsFor('event:7');
    expect(emissions[0].event).toBe('event:cancelled');
  });

  // -------------------------------------------------------------------------
  // Room isolation: a broadcast for market A never reaches market B
  // -------------------------------------------------------------------------
  describe('room isolation', () => {
    it('broadcastEventUpdated for event:1 does NOT appear in event:2', () => {
      service.broadcastEventUpdated(1, { title: 'Only for event 1' });

      const event1Emissions = server.emissionsFor('event:1');
      const event2Emissions = server.emissionsFor('event:2');

      expect(event1Emissions).toHaveLength(1);
      expect(event2Emissions).toHaveLength(0);
    });

    it('broadcastMatchAdded for event:10 does NOT appear in event:20', () => {
      service.broadcastMatchAdded({
        match_id: 1,
        event_id: 10,
        team_a: 'Alpha',
        team_b: 'Beta',
      });

      expect(server.emissionsFor('event:10')).toHaveLength(1);
      expect(server.emissionsFor('event:20')).toHaveLength(0);
    });

    it('broadcastPredictionSubmitted goes to ONLY event:4 and match:7, not event:5 or match:8', () => {
      service.broadcastPredictionSubmitted({
        match_id: 7,
        event_id: 4,
        predictor: 'GABC',
      });

      expect(server.emissionsFor('event:4')).toHaveLength(1);
      expect(server.emissionsFor('match:7')).toHaveLength(1);
      expect(server.emissionsFor('event:5')).toHaveLength(0);
      expect(server.emissionsFor('match:8')).toHaveLength(0);
    });

    it('broadcastMatchResolved goes to ONLY its event and match rooms', () => {
      service.broadcastMatchResolved({
        match_id: 8,
        event_id: 5,
        winning_team: 1,
      });

      expect(server.emissionsFor('event:5')).toHaveLength(1);
      expect(server.emissionsFor('match:8')).toHaveLength(1);
      // Unrelated rooms are untouched
      expect(server.emissionsFor('event:4')).toHaveLength(0);
      expect(server.emissionsFor('match:7')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Broadcast to a room with zero subscribers is a safe no-op
  // -------------------------------------------------------------------------
  describe('empty room broadcast', () => {
    it('does not throw when broadcasting to a room nobody has joined', () => {
      // event:9999 has never had a socket join it
      expect(() => {
        service.broadcastEventUpdated(9999, { title: 'Ghost market' });
      }).not.toThrow();

      // The call was recorded by the mock (socket.io would simply no-op)
      expect(server.to).toHaveBeenCalledWith('event:9999');
    });

    it('does not throw when broadcasting winners to an unsubscribed room', () => {
      expect(() => {
        service.broadcastWinnersVerified({ event_id: 99999, winners: [] });
      }).not.toThrow();
    });

    it('does not throw when broadcastMatchResolved targets rooms with no subscribers', () => {
      expect(() => {
        service.broadcastMatchResolved({
          match_id: 9001,
          event_id: 9001,
          winning_team: 0,
        });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Payload shape verification
  // -------------------------------------------------------------------------
  describe('payload shapes', () => {
    it('broadcastEventUpdated wraps data correctly', () => {
      service.broadcastEventUpdated(42, { title: 'Market 42', extra: true });
      const [emission] = server.emissionsFor('event:42');
      expect(emission.event).toBe('event:updated');
      expect(emission.payload).toMatchObject({
        event: 'event:updated',
        data: expect.objectContaining({ event_id: '42', title: 'Market 42' }),
      });
    });

    it('broadcastMatchResolved wraps data correctly', () => {
      service.broadcastMatchResolved({
        match_id: 88,
        event_id: 55,
        winning_team: 'A',
        submitted_by: 'GABC',
      });
      const matchEmission = server.emissionsFor('match:88')[0];
      expect(matchEmission.payload).toMatchObject({
        event: 'match:resolved',
        data: expect.objectContaining({
          match_id: '88',
          event_id: '55',
          winning_team: 'A',
        }),
      });
    });
  });
});
