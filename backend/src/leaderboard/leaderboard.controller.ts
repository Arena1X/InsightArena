import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import {
  LeaderboardQueryDto,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get global leaderboard (all-time or by season)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max 100',
  })
  @ApiQuery({ name: 'season_id', required: false, type: String })
  @ApiResponse({
    status: 200,
    description:
      'Paginated leaderboard with accuracy_rate computed server-side',
  })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse> {
    return this.leaderboardService.getLeaderboard(query);
  }
}
