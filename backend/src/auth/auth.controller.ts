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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitService: RateLimitService,
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
}
