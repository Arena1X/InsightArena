import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Returned only at creation time — includes the raw key (shown once).
 */
export class ApiKeyCreatedResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'My Bot Key' })
  name: string;

  @ApiProperty({
    example:
      'ia_4f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f',
    description:
      'Full raw key — shown ONCE at creation, never retrievable again',
  })
  key: string;

  @ApiProperty({
    example: 'ia_4f9a1b',
    description: 'First 8-char prefix for display',
  })
  key_prefix: string;

  @ApiProperty({ example: ['predictions:read'] })
  scopes: string[];

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', nullable: true })
  expires_at: Date | null;

  @ApiProperty()
  created_at: Date;
}

/**
 * Returned by list / revoke — never includes the raw key or hash.
 */
export class ApiKeyListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'ia_4f9a1b' })
  key_prefix: string;

  @ApiProperty({ example: ['predictions:read'] })
  scopes: string[];

  @ApiPropertyOptional({ nullable: true })
  expires_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  last_used_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  revoked_at: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Set once this key has been rotated out',
  })
  rotated_at: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'End of the grace window during which a rotated key still validates',
  })
  grace_expires_at: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ID of the key that replaced this one via rotation',
  })
  replaced_by_id: string | null;

  @ApiProperty()
  created_at: Date;
}
