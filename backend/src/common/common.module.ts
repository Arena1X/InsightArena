import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilteringService } from './filtering.service';
import { IdempotencyKey } from './idempotency/idempotency-key.entity';
import { IdempotencyService } from './idempotency/idempotency.service';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { OptionalIdempotencyInterceptor } from './idempotency/optional-idempotency.interceptor';

@Module({
  imports: [
    PassportModule,
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
    TypeOrmModule.forFeature([IdempotencyKey]),
  ],
  providers: [
    FilteringService,
    IdempotencyService,
    IdempotencyInterceptor,
    OptionalIdempotencyInterceptor,
  ],
  exports: [
    JwtModule,
    FilteringService,
    IdempotencyService,
    IdempotencyInterceptor,
    OptionalIdempotencyInterceptor,
  ],
})
export class CommonModule {}
