import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RateLimitService } from './rate-limit.service';
import { GenerateChallengeDto } from './dto/generate-challenge.dto';
import { VerifyChallengeDto } from './dto/verify-challenge.dto';
import { VerifyWalletDto } from './dto/verify-wallet.dto';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';
import {
  RefreshTokenResponseDto,
  RotateRefreshTokenDto,
} from './dto/refresh-token.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
  ) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  generateChallenge(@Body() generateChallengeDto: GenerateChallengeDto) {
    const challenge = this.authService.generateChallenge(
      generateChallengeDto.stellar_address,
    );
    return { challenge };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(@Body() verifyChallengeDto: VerifyChallengeDto) {
    return this.authService.verifyChallenge(
      verifyChallengeDto.stellar_address,
      verifyChallengeDto.signed_challenge,
    );
  }

  @Post('verify-wallet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify wallet signature without session creation' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  verifyWallet(@Body() dto: VerifyWalletDto) {
    const verified = this.authService.verifyStellarSignature(
      dto.stellar_address,
      dto.challenge,
      dto.signature,
    );
    return { verified };
  }

  @Get('rate-limit')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current rate limit status for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Current rate limit status',
    type: RateLimitStatusDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRateLimitStatus(
    @CurrentUser() user: User,
  ): Promise<RateLimitStatusDto> {
    return this.rateLimitService.getStatus(user.id);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description:
      'Exchanges a valid refresh token for a new access token and a new refresh token, invalidating the presented refresh token. Reusing an already-rotated refresh token revokes the entire session family.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token and refresh token issued',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - invalid, expired, or reused refresh token, or user deleted',
  })
  async refreshToken(
    @Body() dto: RotateRefreshTokenDto,
  ): Promise<RefreshTokenResponseDto> {
    const { access_token, refresh_token } =
      await this.authService.rotateRefreshToken(dto.refresh_token);

    // Calculate expiry timestamp
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '7d';
    const expiresMs = this.parseExpiryToMs(expiresIn);
    const expires_at = new Date(Date.now() + expiresMs).toISOString();

    return { access_token, refresh_token, expires_at };
  }

  /**
   * Parse JWT_EXPIRES_IN format (e.g., '7d', '24h', '3600s') to milliseconds
   */
  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) {
      // Default to 7 days if format is invalid
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'm':
        return value * 60 * 1000;
      case 's':
        return value * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
