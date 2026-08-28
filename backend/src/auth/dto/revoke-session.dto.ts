import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeSessionDto {
  @ApiProperty({
    description:
      'The raw refresh token identifying the session (token family) to revoke',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class RevokeSessionResponseDto {
  @ApiProperty({
    description: 'Whether the session was revoked',
    example: true,
  })
  revoked: boolean;
}
