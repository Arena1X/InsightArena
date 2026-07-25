import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RotateRefreshTokenDto {
  @ApiProperty({
    description: 'The raw refresh token previously issued to the client',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({
    description: 'New JWT access token with refreshed expiry',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description:
      'New refresh token. The previous refresh token is now invalid — replaying it will revoke the whole session family.',
    example: 'f6e5d4c3b2a1...',
  })
  refresh_token: string;

  @ApiProperty({
    description: 'Token expiration timestamp',
    example: '2026-07-25T12:00:00.000Z',
  })
  expires_at: string;
}
