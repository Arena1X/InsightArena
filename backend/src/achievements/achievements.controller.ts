import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AchievementsService } from './achievements.service';
import { AchievementResponseDto } from './dto/achievement-response.dto';

@ApiTags('Achievements')
@Controller('users/:address/achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user achievements and badges' })
  @ApiResponse({
    status: 200,
    description: 'List of achievements with unlock status',
    type: [AchievementResponseDto],
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserAchievements(
    @Param('address') address: string,
  ): Promise<AchievementResponseDto[]> {
    return this.achievementsService.getUserAchievements(address);
  }
}
