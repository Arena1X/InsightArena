import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ description: 'Reason for banning the user' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
