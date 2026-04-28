import { IsBoolean, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ModerateCommentDto {
  @ApiProperty({
    description: 'Whether the comment should be hidden/moderated',
  })
  @IsBoolean()
  is_moderated: boolean;

  @ApiProperty({ description: 'Reason for moderation', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
