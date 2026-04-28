import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyWalletDto {
  @ApiProperty({
    example: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    description: 'Stellar public key (G... address)',
  })
  @IsString()
  @IsNotEmpty()
  stellar_address: string;

  @ApiProperty({
    example: 'InsightArena:dispute:123456789:abcdef',
    description: 'The plaintext challenge that was signed',
  })
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @ApiProperty({
    example: 'a1b2c3d4...',
    description: 'Hex-encoded signature',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}
