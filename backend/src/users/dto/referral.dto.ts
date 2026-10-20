import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReferralStatus } from '../entities/user-referral.entity';

export class ClaimReferralDto {
  @ApiProperty({
    description: 'User ID of the account that referred the current user',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  referrer_id: string;
}

export class ClaimReferralResponseDto {
  success: boolean;
  message: string;
}

export class ReferralItemDto {
  id: string;
  referred_id: string;
  referred_username: string | null;
  referred_stellar_address: string;
  status: ReferralStatus;
  created_at: Date;
  qualified_at: Date | null;
}

export class MyReferralsResponseDto {
  /** Share this user's ID as their referral code. */
  referral_code: string;
  total: number;
  pending: number;
  qualified: number;
  referrals: ReferralItemDto[];
}
