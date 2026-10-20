import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
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
    @CurrentUser() currentUser?: User,
  ): Promise<AchievementResponseDto[]> {
    // Trigger achievement check for authenticated user viewing their own profile
    if (currentUser && currentUser.stellar_address === address) {
      await this.achievementsService.checkAndUnlockAchievements(currentUser);
      await this.achievementsService.updateAchievementProgress(currentUser);
    }

    return this.achievementsService.getUserAchievements(address);
  }

  @Get('progress')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get achievement progress for a user' })
  @ApiResponse({
    status: 200,
    description: 'Progress and thresholds for each achievement',
    type: [AchievementResponseDto],
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAchievementProgress(
    @Param('address') address: string,
    @CurrentUser() currentUser?: User,
  ): Promise<AchievementResponseDto[]> {
    if (currentUser && currentUser.stellar_address === address) {
      await this.achievementsService.updateAchievementProgress(currentUser);
    }

    return this.achievementsService.getAchievementProgress(address);
  }
}
