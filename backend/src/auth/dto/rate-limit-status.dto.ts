import { ApiProperty } from '@nestjs/swagger';

export class RateLimitStatusDto {
  @ApiProperty({
    description: 'Maximum number of requests allowed in the window',
    example: 100,
  })
  limit: number;

  @ApiProperty({
    description: 'Number of requests remaining in the current window',
    example: 87,
  })
  remaining: number;

  @ApiProperty({
    description: 'When the rate limit window resets',
    example: '2026-03-30T04:00:00.000Z',
  })
  reset_at: Date;
}
