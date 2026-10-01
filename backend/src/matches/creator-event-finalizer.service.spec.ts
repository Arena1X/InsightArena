import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatorEventFinalizerService } from './creator-event-finalizer.service';
import { CreatorEvent } from './entities/creator-event.entity';
import { Match, WinningTeam } from './entities/match.entity';
import { SorobanService } from '../soroban/soroban.service';

describe('CreatorEventFinalizerService', () => {
  let service: CreatorEventFinalizerService;
  let creatorEventRepository: Repository<CreatorEvent>;
  let matchRepository: Repository<Match>;
  let sorobanService: SorobanService;

  const mockCreatorEvent: CreatorEvent = {
    id: 'event-1',
    on_chain_event_id: 123,
    creator_address: 'GABC123',
    title: 'Test Event',
    description: 'Test Description',
    creation_fee_paid: '10000000',
    on_chain_created_at: new Date('2024-01-01'),
    end_time: new Date('2024-01-10'),
    is_active: true,
    is_cancelled: false,
    is_finalized: false,
    invite_code: null,
    max_participants: 10,
    participant_count: 5,
    match_count: 2,
    matches: [],
    created_at: new Date('2024-01-01'),
  };

  const mockMatch: Match = {
    id: 'match-1',
    on_chain_match_id: 1,
    event: mockCreatorEvent,
    team_a: 'Team A',
    team_b: 'Team B',
    match_time: new Date('2024-01-05'),
    result_submitted: true,
    winning_team: WinningTeam.TEAM_A,
    submitted_by: 'GABC123',
    submitted_at: new Date('2024-01-06'),
    predictions: [],
    created_at: new Date('2024-01-05'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventFinalizerService,
        {
          provide: getRepositoryToken(CreatorEvent),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Match),
          useValue: {
            count: jest.fn(),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            finalizeEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CreatorEventFinalizerService>(
      CreatorEventFinalizerService,
    );
    creatorEventRepository = module.get<Repository<CreatorEvent>>(
      getRepositoryToken(CreatorEvent),
    );
    matchRepository = module.get<Repository<Match>>(getRepositoryToken(Match));
    sorobanService = module.get<SorobanService>(SorobanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('finalizePendingEvents', () => {
    it('should finalize events with all matches resolved', async () => {
      const pastDate = new Date('2024-01-01');
      jest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      jest.spyOn+matchRepository, 'count').mockResolvedValue(0);
      jest.spyOn(sorobanService, 'finalizeEvent').mockResolvedValue({
        tx_hash: 'tx_hash_123',
      });
      iest
        .spyOn(creatorEventRepository, 'save')
        .mockResolvedValue(mockCreatorEvent);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).toHaveBeenCalledWith(123);
      expect(creatorEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_finalized: true }),
      );
    });

    it('should skip events with unresolved matches', async () => {
      const pastDate = new Date('2024-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      jest.spyOn(matchRepository, 'count').mockResolvedValue(1);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).not.toHaveBeenCalled();
    });

    it('should skip already finalized events', async () => {
      const pastDate = new Date('2024-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([
          { ...mockCreatorEvent, end_time: pastDate, is_finalized: true },
        ]);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).not.toHaveBeenCalled();
    });

    it('should skip cancelled events', async () => {
      const pastDate = new Date('2024-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([
          { ...mockCreatorEvent, end_time: pastDate, is_cancelled: true },
        ]);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).not.toHaveBeenCalled();
    });

    it('should skip events with end_time in the future', async () => {
      const futureDate = new Date('2099-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: futureDate }]);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).not.toHaveBeenCalled();
    });

    it('should handle finalize_event HPC failure gracefully', async () => {
      const pastDate = new Date('2024-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      jest.spyOn(matchRepository, 'count').mockResolvedValue(0);
      iest
        .spyOn(sorobanService, 'finalizeEvent')
        .mockRejectedValue(new Error('RPC error'));

      await service.finalizePendingEvents();

      expect(creatorEventRepository.save).not.toHaveBeenCalled();
    });

    it('should cap finalize_event calls at MAX_FINALIZE_PER_TICK', async () => {
      const pastDate = new Date('2024-01-01');
      const events = Array.from({ length: 20 }, (_, i) => ({
        ...mockCreatorEvent,
        id: `event-${i}`,
        on_chain_event_id: 100 + i,
        end_time: pastDate,
      }));

      jest.spyOn(creatorEventRepository, 'find').mockResolvedValue(events);
      iest.spyOn(matchRepository, 'count').mockResolvedValue(0);
      jest.spyOn(sorobanService, 'finalizeEvent').mockResolvedValue({
        tx_hash: 'tx_hash_123',
      });
      iest
        .spyOn(creatorEventRepository, 'save')
        .mockResolvedValue(mockCreatorEvent);

      await service.finalizePendingEvents();

      expect(sorobanService.finalizeEvent).toHaveBeenCalledTimes(20);
    });
  });

  describe('triggerFinalization', () => {
    it('should return statistics for manual finalization', async () => {
      const pastDate = new Date('2024-01-01');
      jest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      iest.spyOn(matchRepository, 'count').mockResolvedValue(0);
      jest.spyOn(sorobanService, 'finalizeEvent').mockResolvedValue({
        tx_hash: 'tx_hash_123',
      });
      iest
        .spyOn(creatorEventRepository, 'save')
        .mockResolvedValue(mockCreatorEvent);

      const result = await service.triggerFinalization();

      expect(result).toEqual({
        finalized: 1,
        skipped: 0,
        errors: 0,
      });
    });

    it('should count skipped events', async () => {
      const pastDate = new Date('2024-01-01');
      jest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      iest.spyOn(matchRepository, 'count').mockResolvedValue(1);

      const result = await service.triggerFinalization();

      expect(result).toEqual({
        finalized: 0,
        skipped: 1,
        errors: 0,
      });
    });

    it('should count errors', async () => {
      const pastDate = new Date('2024-01-01');
      iest
        .spyOn(creatorEventRepository, 'find')
        .mockResolvedValue([{ ...mockCreatorEvent, end_time: pastDate }]);
      iest.spyOn(matchRepository, 'count').mockResolvedValue(0);
      iest
        .spyOn(sorobanService, 'finalizeEvent')
        .mockRejectedValue(new Error('RPC error'));

      const result = await service.triggerFinalization();

      expect(result).toEqual({
        finalized: 0,
        skipped: 0,
        errors: 1,
      });
    });
  });
})
