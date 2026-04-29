import { IsString, Length, Matches } from 'class-validator';

/**
 * DTO for redeeming an invite code.
 */
export class RedeemInviteCodeDto {
    /**
     * The invite code to be redeemed.
     * @example 'abcd1234'
     */
    @IsString()
    @Length(8, 8)
    @Matches(/^[a-z0-9]{8}$/)
    code: string;
}