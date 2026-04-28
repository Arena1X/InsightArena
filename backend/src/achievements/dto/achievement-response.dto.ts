import { ApiProperty } from '@nestjs/swagger';
import { AchievementType } from '../entities/achievement.entity';

export class AchievementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AchievementType })
  type: AchievementType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ nullable: true })
  icon_url: string | null;

  @ApiProperty()
  reward_points: number;

  @ApiProperty()
  is_unlocked: boolean;

  @ApiProperty({ nullable: true })
  unlocked_at: Date | null;
}
