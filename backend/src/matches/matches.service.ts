import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, WinningTeam } from './entities/match.entity';
import {
  MatchPrediction,
  PredictedOutcome,
} from './entities/match-prediction.entity';
import { MatchDetailDto } from './dto/match-detail.dto';
import { MatchPredictionsResponseDto } from './dto/match-predictions.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,

    @InjectRepository(MatchPrediction)
    private readonly matchPredictionRepository: Repository<MatchPrediction>,
  ) {}

  async getMatchDetail(matchId: string): Promise<MatchDetailDto> {
    const numericId = Number(matchId);
    const where = Number.isFinite(numericId)
      ? [{ id: matchId }, { on_chain_match_id: numericId }]
      : [{ id: matchId }];

    const match = await this.matchRepository.findOne({
      where,
      relations: ['event'],
    });

    if (!match) {
      throw new NotFoundException(`Match with ID "${matchId}" not found`);
    }

    const totalPredictions = await this.matchPredictionRepository.count({
      where: { match: { id: match.id } },
    });

    const distribution = await this.getDistribution(match.id, totalPredictions);

    return {
      id: match.id,
      on_chain_match_id: match.on_chain_match_id,
      team_a: match.team_a,
      team_b: match.team_b,
      match_time: match.match_time,
      result_submitted: match.result_submitted,
      winning_team: match.winning_team,
      home_score: match.home_score,
      away_score: match.away_score,
      points_multiplier: match.points_multiplier,
      total_predictions: totalPredictions,
      prediction_distribution: distribution,
      event_info: {
        id: match.event.id,
        on_chain_event_id: match.event.on_chain_event_id,
        title: match.event.title,
        creator_address: match.event.creator_address,
        is_active: match.event.is_active,
        is_cancelled: match.event.is_cancelled,
      },
      submitted_by: match.submitted_by,
      submitted_at: match.submitted_at,
      created_at: match.created_at,
    };
  }

  async getMatchPredictions(
    matchId: string,
    includeUsers = false,
    page = 1,
    limit = 20,
  ): Promise<MatchPredictionsResponseDto> {
    const numericId = Number(matchId);
    const where = Number.isFinite(numericId)
      ? [{ id: matchId }, { on_chain_match_id: numericId }]
      : [{ id: matchId }];

    const match = await this.matchRepository.findOne({
      where,
    });

    if (!match) {
      throw new NotFoundException(`Match with ID "${matchId}" not found`);
    }

    const totalPredictions = await this.matchPredictionRepository.count({
      where: { match: { id: match.id } },
    });

    const distribution = await this.getDistribution(match.id, totalPredictions);

    const response: MatchPredictionsResponseDto = {
      distribution,
      total_predictions: totalPredictions,
    };

    if (includeUsers) {
      const skip = (page - 1) * limit;
      const [predictions, total] =
        await this.matchPredictionRepository.findAndCount({
          where: { match: { id: match.id } },
          relations: ['user'],
          order: { predicted_at: 'DESC' },
          skip,
          take: limit,
        });

      response.users = predictions.map((p) => ({
        id: p.id,
        user_address: p.user.stellar_address,
        predicted_outcome: p.predicted_outcome,
        predicted_at: p.predicted_at,
        is_correct: p.is_correct,
      }));

      response.meta = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return response;
  }

  private async getDistribution(matchId: string, totalPredictions: number) {
    const outcomes = ['TEAM_A', 'TEAM_B', 'DRAW'] as const;
    const distribution: Array<{
      outcome: string;
      count: number;
      percentage: string;
    }> = [];

    for (const outcome of outcomes) {
      const count = await this.matchPredictionRepository.count({
        where: {
          match: { id: matchId },
          predicted_outcome: outcome as PredictedOutcome,
        },
      });
      distribution.push({
        outcome,
        count,
        percentage:
          totalPredictions > 0
            ? ((count / totalPredictions) * 100).toFixed(2)
            : '0.00',
      });
    }

    return distribution;
  }

  /**
   * Submit the final result for a match. Admin/moderator only (enforced at
   * the controller). Validates score sanity, match completion and
   * winner/score consistency before persisting.
   */
  async submitResult(
    matchId: string,
    dto: SubmitMatchResultDto,
    submittedBy: string,
  ): Promise<Match> {
    const numericId = Number(matchId);
    const where = Number.isFinite(numericId)
      ? [{ id: matchId }, { on_chain_match_id: numericId }]
      : [{ id: matchId }];

    const match = await this.matchRepository.findOne({ where });

    if (!match) {
      throw new NotFoundException(`Match with ID "${matchId}" not found`);
    }

    if (match.result_submitted) {
      throw new ConflictException(
        `Result for match "${match.id}" has already been submitted`,
      );
    }

    if (new Date() < new Date(match.match_time)) {
      throw new BadRequestException(
        `Match "${match.id}" has not started yet - result cannot be submitted before match time`,
      );
    }

    this.validateResultConsistency(dto);

    match.home_score = dto.home_score;
    match.away_score = dto.away_score;
    match.winning_team = dto.winning_team;
    match.result_submitted = true;
    match.submitted_by = submittedBy;
    match.submitted_at = new Date();

    const saved = await this.matchRepository.save(match);

    this.logger.log(
      `Result submitted for match ${match.id}: ${match.team_a} ${dto.home_score} - ${dto.away_score} ${match.team_b} (${dto.winning_team}) by ${submittedBy}`,
    );

    return saved;
  }

  private validateResultConsistency(dto: SubmitMatchResultDto): void {
    const { home_score, away_score, winning_team } = dto;

    if (winning_team === WinningTeam.DRAW && home_score !== away_score) {
      throw new BadRequestException(
        'winning_team DRAW requires equal home_score and away_score',
      );
    }

    if (winning_team === WinningTeam.TEAM_A && home_score <= away_score) {
      throw new BadRequestException(
        'winning_team TEAM_A requires home_score greater than away_score',
      );
    }

    if (winning_team === WinningTeam.TEAM_B && away_score <= home_score) {
      throw new BadRequestException(
        'winning_team TEAM_B requires away_score greater than home_score',
      );
    }
  }
}
