import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
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
import { Competition } from './entities/competition.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Post()
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
}
