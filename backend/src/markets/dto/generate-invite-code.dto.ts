/**
 * DTO for generating an invite code.
 *
 * @typedef {Object} GenerateInviteCodeDTO
 * @property {number} max_uses - Maximum number of uses for the invite code (min: 1, max: 100). Example: 5
 * @property {number} expires_in_seconds - Time in seconds until the invite code expires (min: 60, max: 31536000). Example: 3600
 */

import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class GenerateInviteCodeDTO {
  @IsInt({ message: 'max_uses must be an integer' })
  @Min(1, { message: 'max_uses must be at least 1' })
  @Max(100, { message: 'max_uses must not exceed 100' })
  @IsNotEmpty({ message: 'max_uses is required' })
  max_uses: number;

  @IsInt({ message: 'expires_in_seconds must be an integer' })
  @Min(60, { message: 'expires_in_seconds must be at least 60' })
  @Max(31536000, { message: 'expires_in_seconds must not exceed 31536000' })
  @IsNotEmpty({ message: 'expires_in_seconds is required' })
  expires_in_seconds: number;
}
