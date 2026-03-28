import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GenerateChallengeDto } from './dto/generate-challenge.dto';
import { VerifyChallengeDto } from './dto/verify-challenge.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  // Authenticated route using @CurrentUser
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  getProfile(@CurrentUser() user: User) {
    return user;
  }
}