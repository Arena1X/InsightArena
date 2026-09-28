import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const MAX_BULK_USER_ACTION_SIZE = 100;

export enum BulkUserAction {
  Ban = 'ban',
  Unban = 'unban',
  Flag = 'flag',
}

export enum BulkUserActionErrorCode {
  UserNotFound = 'USER_NOT_FOUND',
  AlreadyBanned = 'ALREADY_BANNED',
  NotBanned = 'NOT_BANNED',
  SelfActionNotAllowed = 'SELF_ACTION_NOT_ALLOWED',
  InternalError = 'INTERNAL_ERROR',
}

export class BulkUserActionDto {
  @ApiProperty({
    type: [String],
    description: `User IDs to apply the action to (1-${MAX_BULK_USER_ACTION_SIZE} unique UUIDs)`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_USER_ACTION_SIZE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  user_ids: string[];

  @ApiProperty({ enum: BulkUserAction, description: 'Action to apply' })
  @IsEnum(BulkUserAction)
  action: BulkUserAction;

  @ApiPropertyOptional({
    description: 'Reason recorded in the audit log for this action',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkUserActionResultDto {
  @ApiProperty() user_id: string;
  @ApiProperty() success: boolean;
  @ApiPropertyOptional() error?: string;
  @ApiPropertyOptional({
    enum: BulkUserActionErrorCode,
    description: 'Machine-readable failure reason, present when success=false',
  })
  error_code?: BulkUserActionErrorCode;
}

export class BulkUserActionResponseDto {
  @ApiProperty({ type: [BulkUserActionResultDto] })
  results: BulkUserActionResultDto[];

  @ApiProperty({ enum: BulkUserAction }) action: BulkUserAction;
  @ApiProperty() total: number;
  @ApiProperty() succeeded: number;
  @ApiProperty() failed: number;
}
