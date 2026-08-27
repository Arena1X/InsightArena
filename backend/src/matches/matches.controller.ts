import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { MatchesService } from './matches.service';
import { MatchDetailDto } from './dto/match-detail.dto';
import { MatchPredictionsResponseDto } from './dto/match-predictions.dto';
import { MatchPredictionsQueryDto } from './dto/match-predictions-query.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { Match } from './entities/match.entity';

@ApiTags('Matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: 'Get match details by ID or on-chain ID' })
  @ApiResponse({
    status: 200,
    description: 'Match details with prediction distribution',
    type: MatchDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatchById(@Param('id') id: string): Promise<MatchDetailDto> {
    return this.matchesService.getMatchDetail(id);
  }

  @Post(':id/result')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.Moderator)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Submit the final result for a match (admin/moderator only). Scores must be non-negative integers and consistent with the declared winner.',
  })
  @ApiResponse({
    status: 201,
    description: 'Result recorded',
    type: Match,
  })
  @ApiResponse({
    status: 400,
    description:
      'Match not finished yet, scores/winner inconsistent, or malformed payload',
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({
    status: 409,
    description: 'Result has already been submitted',
  })
  async submitMatchResult(
    @Param('id') matchId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: SubmitMatchResultDto,
    @CurrentUser() user: User,
  ): Promise<Match> {
    return this.matchesService.submitResult(matchId, dto, user.id);
  }

  @Get(':id/predictions')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Get predictions for a match with distribution statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Prediction distribution and optional user list',
    type: MatchPredictionsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatchPredictions(
    @Param('id') id: string,
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: MatchPredictionsQueryDto,
  ): Promise<MatchPredictionsResponseDto> {
    return this.matchesService.getMatchPredictions(
      id,
      query.includeUsers === true,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
