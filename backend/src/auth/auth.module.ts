import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RateLimitService } from './rate-limit.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthAuditEvent } from './entities/auth-audit-event.entity';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      User,
      ApiKey,
      UserPreferences,
      RefreshToken,
      AuthAuditEvent,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') as never,
        },
      }),
    }),
  ],
  controllers: [AuthController, ApiKeyController],
  providers: [AuthService, ApiKeyService, JwtStrategy, RateLimitService],
  exports: [AuthService, ApiKeyService, JwtModule],
})
export class AuthModule {}
