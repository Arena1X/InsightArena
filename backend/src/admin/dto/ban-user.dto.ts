import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ description: 'Reason for banning the user' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'reason must not be blank' })
  @MaxLength(500)
  reason: string;
}
