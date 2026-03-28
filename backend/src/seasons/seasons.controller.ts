import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Season } from './entities/season.entity';
import { SeasonsService } from './seasons.service';

@ApiTags('Seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  @ApiOperation({ summary: 'List seasons' })
  @ApiResponse({ status: 200, type: [Season] })
  async findAll(): Promise<Season[]> {
    return this.seasonsService.findAll();
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
