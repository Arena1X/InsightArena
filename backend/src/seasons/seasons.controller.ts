import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Season } from './entities/season.entity';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import {
  ListSeasonsDto,
  PaginatedSeasonsResponseDto,
} from './dto/list-seasons.dto';

@ApiTags('Seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Public()
  @Get('active')
  @ApiOperation({
    summary: 'Get the currently active season (public)',
    description:
      'Returns the full season row that is marked active (`is_active`) and whose scheduled window contains the current time. Responds with 404 when none qualifies.',
  })
  @ApiResponse({ status: 200, description: 'Active season', type: Season })
  @ApiResponse({
    status: 404,
    description: 'No season is active for the current time',
  })
  async getActive(): Promise<Season> {
    return this.seasonsService.findActive();
  }

  @Public()
  @Get('current')
  @ApiOperation({
    summary: 'Get the current active season (public)',
    description:
      'Alias for /active. Returns the season that is currently active based on `is_active` flag and time window. Responds with 404 when none qualifies.',
  })
  @ApiResponse({ status: 200, description: 'Current season', type: Season })
  @ApiResponse({
    status: 404,
    description: 'No season is active for the current time',
  })
  async getCurrent(): Promise<Season> {
    return this.seasonsService.findActive();
  }

  @Public()
  @Get()
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({
    summary: 'List all seasons (paginated, public)',
    description:
      'Ordered by season_number descending. When a season is finalized and a top winner is stored, `top_winner` includes public profile fields.',
  })
  @ApiResponse({ status: 200, type: PaginatedSeasonsResponseDto })
  async list(
    @Query() query: ListSeasonsDto,
  ): Promise<PaginatedSeasonsResponseDto> {
    return this.seasonsService.findAllPaginated(query);
  }

  @Post()
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({ summary: 'Create a season (admin only)' })
  @ApiBody({ type: CreateSeasonDto })
  @ApiResponse({ status: 201, description: 'Season created', type: Season })
  @ApiResponse({
    status: 409,
    description: 'Overlapping active season or duplicate season_number',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async create(@Body() dto: CreateSeasonDto): Promise<Season> {
    return this.seasonsService.create(dto);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finalize a season (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Season finalized with top winner set and points reset',
    type: Season,
  })
  @ApiResponse({ status: 404, description: 'Season not found' })
  @ApiResponse({
    status: 409,
    description: 'Season is already finalized',
  })
  async finalizeSeason(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.finalizeSeason(id);
  }
}
