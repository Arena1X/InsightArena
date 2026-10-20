import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum UserEventType {
  Joined = 'joined',
  Created = 'created',
  All = 'all',
}

export enum EventStatus {
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
  All = 'all',
}

export class UserEventsQueryDto {
  @ApiPropertyOptional({
    enum: UserEventType,
    default: UserEventType.All,
    description: 'Filter by event type (joined, created, or all)',
  })
  @IsOptional()
  @IsEnum(UserEventType)
  type: UserEventType = UserEventType.All;

  @ApiPropertyOptional({
    enum: EventStatus,
    default: EventStatus.All,
    description: 'Filter by event status',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status: EventStatus = EventStatus.All;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
