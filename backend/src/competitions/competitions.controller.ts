import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { BanGuard } from '../common/guards/ban.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import {
  ListCompetitionsDto,
  PaginatedCompetitionsResponse,
} from './dto/list-competitions.dto';
import {
  ListParticipantsQueryDto,
  PaginatedParticipantsResponse,
} from './dto/list-participants.dto';
import { UserRankResponseDto } from './dto/user-rank-response.dto';
import { JoinCompetitionResponseDto } from './dto/join-competition.dto';
import { LeaveCompetitionResponseDto } from './dto/leave-competition.dto';
import { Competition } from './entities/competition.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Post()
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new competition' })
  @ApiResponse({
    status: 201,
    description: 'Competition created',
    type: Competition,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. end_time before start_time)',
  })
  async createCompetition(
    @Body() dto: CreateCompetitionDto,
    @CurrentUser() user: User,
  ): Promise<Competition> {
    return this.competitionsService.create(dto, user);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List competitions with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedCompetitionsResponse })
  async listCompetitions(
    @Query() query: ListCompetitionsDto,
  ): Promise<PaginatedCompetitionsResponse> {
    return this.competitionsService.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get competition by ID' })
  @ApiResponse({ status: 200, type: Competition })
  @ApiResponse({ status: 404, description: 'Competition not found' })
  async getCompetition(@Param('id') id: string): Promise<Competition> {
    const competition = await this.competitionsService.findById(id);
    if (!competition) {
      throw new NotFoundException(`Competition with ID "${id}" not found`);
    }
    return competition;
  }

  @Get(':id/participants')
  @Public()
  @ApiOperation({ summary: 'Get participants of a competition' })
  @ApiResponse({
    status: 200,
    description: 'Paginated participants with scores and rankings',
  })
  @ApiResponse({ status: 404, description: 'Competition not found' })
  async getParticipants(
    @Param('id') id: string,
    @Query() query: ListParticipantsQueryDto,
  ): Promise<PaginatedParticipantsResponse> {
    return this.competitionsService.getParticipants(id, query);
  }

  @Get(':id/my-rank')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user rank in a competition' })
  @ApiResponse({
    status: 200,
    description: 'User rank, score, and percentile',
    type: UserRankResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Competition or participant not found',
  })
  async getMyRank(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<UserRankResponseDto> {
    return this.competitionsService.getMyRank(id, user.id);
  }

  @Post(':id/join')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a competition' })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined competition',
    type: JoinCompetitionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Competition not found' })
  @ApiResponse({
    status: 400,
    description: 'Competition ended or full',
  })
  @ApiResponse({
    status: 409,
    description: 'Already joined',
  })
  async joinCompetition(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<JoinCompetitionResponseDto> {
    const participant = await this.competitionsService.joinCompetition(
      id,
      user,
    );
    return {
      message: 'Successfully joined competition',
      competition_id: id,
      participant_id: participant.id,
    };
  }

  @Delete(':id/leave')
  @UseGuards(BanGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a competition before it starts' })
  @ApiResponse({
    status: 200,
    description: 'Successfully left competition',
    type: LeaveCompetitionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Competition not found' })
  @ApiResponse({
    status: 400,
    description: 'Competition already started',
  })
  async leaveCompetition(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<LeaveCompetitionResponseDto> {
    await this.competitionsService.leaveCompetition(id, user);
    return {
      message: 'Successfully left competition',
      competition_id: id,
    };
  }
}
