import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUpdateDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read or unread',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  notificationIds: number[];
}
