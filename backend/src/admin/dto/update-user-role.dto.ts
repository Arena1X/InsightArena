import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class UpdateUserRoleDto {
  @ApiProperty({
    description: 'The role to assign to the user',
    enum: Role,
    example: Role.Admin,
  })
  @IsEnum(Role)
  role: Role;
}
