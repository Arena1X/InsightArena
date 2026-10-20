import { ApiProperty } from '@nestjs/swagger';
import { NotificationCategory } from '../entities/notification-category-preference.entity';

export class CategoryPreferenceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: NotificationCategory })
  category: NotificationCategory;

  @ApiProperty()
  in_app: boolean;

  @ApiProperty()
  email: boolean;

  @ApiProperty()
  push: boolean;
}
