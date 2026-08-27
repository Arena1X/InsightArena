import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Match, MatchDisputeStatus, WinningTeam } from './entities/match.entity';
import {
  ExternalMatchResult,
  ExternalResultStatus,
} from './entities/external-match-result.entity';
import { MatchResultDivergence } from './entities/match-result-divergence.entity';
import {
  EXTERNAL_RESULT_FEED_CLIENT,
  ExternalResultFeedClient,
} from './external-result-feed.client';
import { ExternalResultIngestionService } from './external-result-ingestion.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';

describe('ExternalResultIngestionService', () => {
  const payload = {
    externalId: 'feed-42',
    homeScore: 2,
    awayScore: 1,
    winningTeam: WinningTeam.TEAM_A,
  };
  const matchRepository = { findOne: jest.fn(), save: jest.fn() };
  const resultRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const divergenceRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const notificationGenerator = {
    notifyOracleDivergence: jest.fn(),
  };
  const feedClient: jest.Mocked<ExternalResultFeedClient> = {
    fetchResults: jest.fn(),
  };
  let service: ExternalResultIngestionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ExternalResultIngestionService,
        { provide: getRepositoryToken(Match), useValue: matchRepository },
        {
          provide: getRepositoryToken(ExternalMatchResult),
          useValue: resultRepository,
        },
        {
          provide: getRepositoryToken(MatchResultDivergence),
          useValue: divergenceRepository,
        },
        {
          provide: NotificationGeneratorService,
          useValue: notificationGenerator,
        },
        { provide: EXTERNAL_RESULT_FEED_CLIENT, useValue: feedClient },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key, fallback) => fallback) },
        },
      ],
    }).compile();
    service = module.get(ExternalResultIngestionService);
    feedClient.fetchResults.mockResolvedValue([payload]);
  });

  it('maps a result and queues it for confirmation without settling the match', async () => {
    const match = {
      id: 'match-1',
      external_id: payload.externalId,
      result_submitted: false,
      home_score: null,
      away_score: null,
      winning_team: null,
    } as Match;
    matchRepository.findOne.mockResolvedValue(match);
    resultRepository.findOne.mockResolvedValue(null);

    await service.ingest();

    expect(matchRepository.findOne).toHaveBeenCalledWith({
      where: { external_id: payload.externalId },
    });
    expect(resultRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        match,
        status: ExternalResultStatus.PENDING_CONFIRMATION,
        home_score: 2,
        away_score: 1,
      }),
    );
    expect(match.result_submitted).toBe(false);
  });

  it('logs an unmatched external ID and does not queue it', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    matchRepository.findOne.mockResolvedValue(null);

    await service.ingest();

    expect(warning).toHaveBeenCalledWith(
      `Unmatched external result: ${payload.externalId}`,
    );
    expect(resultRepository.save).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('logs a conflict, persists a divergence record, marks the match DISPUTED_SOURCE, and notifies admins when the feed conflicts with a recorded result', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const match = {
      id: 'match-1',
      external_id: payload.externalId,
      result_submitted: true,
      home_score: 0,
      away_score: 0,
      winning_team: WinningTeam.DRAW,
      dispute_status: null,
    } as Match;
    matchRepository.findOne.mockResolvedValue(match);

    await service.ingest();

    expect(warning).toHaveBeenCalledWith(
      `Conflicting external result: ${payload.externalId}`,
    );
    expect(resultRepository.save).not.toHaveBeenCalled();
    expect(match.home_score).toBe(0);

    expect(divergenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        match,
        source_a_name: 'match_submitted_result',
        source_a_value: { home_score: 0, away_score: 0, winning_team: WinningTeam.DRAW },
        source_b_name: 'external_feed',
        source_b_value: { home_score: 2, away_score: 1, winning_team: WinningTeam.TEAM_A },
      }),
    );
    expect(matchRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dispute_status: MatchDisputeStatus.DISPUTED_SOURCE }),
    );
    expect(notificationGenerator.notifyOracleDivergence).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: match.id,
        sourceAName: 'match_submitted_result',
        sourceBName: 'external_feed',
      }),
    );
    warning.mockRestore();
  });

  it('logs a conflict, persists a divergence record, and marks the match DISPUTED_SOURCE when the feed conflicts with an already-queued result', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const match = {
      id: 'match-1',
      external_id: payload.externalId,
      result_submitted: false,
      home_score: null,
      away_score: null,
      winning_team: null,
      dispute_status: null,
    } as Match;
    matchRepository.findOne.mockResolvedValue(match);
    resultRepository.findOne.mockResolvedValue({
      home_score: 3,
      away_score: 3,
      winning_team: WinningTeam.DRAW,
    });

    await service.ingest();

    expect(warning).toHaveBeenCalledWith(
      `Conflicting queued external result: ${payload.externalId}`,
    );
    expect(resultRepository.save).not.toHaveBeenCalled();

    expect(divergenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        match,
        source_a_name: 'queued_external_result',
        source_a_value: { home_score: 3, away_score: 3, winning_team: WinningTeam.DRAW },
        source_b_name: 'external_feed',
        source_b_value: { home_score: 2, away_score: 1, winning_team: WinningTeam.TEAM_A },
      }),
    );
    expect(matchRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ dispute_status: MatchDisputeStatus.DISPUTED_SOURCE }),
    );
    expect(notificationGenerator.notifyOracleDivergence).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('does not enqueue the same match twice, and does not create a divergence or notify when the two sources agree', async () => {
    matchRepository.findOne.mockResolvedValue({
      id: 'match-1',
      result_submitted: false,
    });
    resultRepository.findOne.mockResolvedValue({
      home_score: 2,
      away_score: 1,
      winning_team: WinningTeam.TEAM_A,
    });

    await service.ingest();

    expect(resultRepository.save).not.toHaveBeenCalled();
    expect(divergenceRepository.save).not.toHaveBeenCalled();
    expect(notificationGenerator.notifyOracleDivergence).not.toHaveBeenCalled();
    expect(matchRepository.save).not.toHaveBeenCalled();
  });

  it('does not create a divergence record or notify when the incoming result agrees with a match already recorded as submitted', async () => {
    const match = {
      id: 'match-1',
      external_id: payload.externalId,
      result_submitted: true,
      home_score: 2,
      away_score: 1,
      winning_team: WinningTeam.TEAM_A,
      dispute_status: null,
    } as Match;
    matchRepository.findOne.mockResolvedValue(match);
    resultRepository.findOne.mockResolvedValue(null);

    await service.ingest();

    expect(divergenceRepository.save).not.toHaveBeenCalled();
    expect(notificationGenerator.notifyOracleDivergence).not.toHaveBeenCalled();
    expect(matchRepository.save).not.toHaveBeenCalled();
  });
});
