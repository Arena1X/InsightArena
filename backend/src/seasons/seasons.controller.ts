import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
}
