import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignArbiterDto {
  @ApiProperty({
    description: 'ID of the admin/moderator user to assign as arbiter',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  arbiter_id: string;
}
