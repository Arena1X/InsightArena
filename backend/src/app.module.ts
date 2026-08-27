import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AchievementsModule } from './achievements/achievements.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CompetitionsModule } from './competitions/competitions.module';
import { CreatorEventsModule } from './creator-events/creator-events.module';
import { validate } from './config/env.validation';
import { FlagsModule } from './flags/flags.module';
import { HealthModule } from './health/health.module';
import { IndexerModule } from './indexer/indexer.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { MarketsModule } from './markets/markets.module';
import { MatchesModule } from './matches/matches.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OracleModule } from './oracle/oracle.module';
import { PredictionsModule } from './predictions/predictions.module';
import { SearchModule } from './search/search.module';
import { SeasonsModule } from './seasons/seasons.module';
import { SorobanModule } from './soroban/soroban.module';
import { UsersModule } from './users/users.module';
import { DisputesModule } from './disputes/disputes.module';
import { ContractModule } from './contract/contract.module';
import { CacheWarmingModule } from './cache/cache-warming.module';
import { WebsocketModule } from './websocket/websocket.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AccountModule } from './account/account.module';
import { TieredThrottlerGuard } from './common/guards/tiered-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl:
              configService.get<number>('RATE_LIMIT_DEFAULT_TTL_MS') ?? 60_000,
            limit: configService.get<number>('RATE_LIMIT_DEFAULT_LIMIT') ?? 100,
          },
          {
            name: 'auth',
            ttl: configService.get<number>('RATE_LIMIT_AUTH_TTL_MS') ?? 60_000,
            limit: configService.get<number>('RATE_LIMIT_AUTH_LIMIT') ?? 10,
          },
          {
            name: 'read',
            ttl: configService.get<number>('RATE_LIMIT_READ_TTL_MS') ?? 60_000,
            limit: configService.get<number>('RATE_LIMIT_READ_LIMIT') ?? 200,
          },
          {
            name: 'write',
            ttl: configService.get<number>('RATE_LIMIT_WRITE_TTL_MS') ?? 60_000,
            limit: configService.get<number>('RATE_LIMIT_WRITE_LIMIT') ?? 30,
          },
        ],
        setHeaders: true,
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        autoLogging: true,
      },
    }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        autoLoadEntities: true,
      }),
    }),

    HealthModule,
    AuthModule,
    UsersModule,
    MarketsModule,
    PredictionsModule,
    CompetitionsModule,
    CreatorEventsModule,
    SeasonsModule,
    AnalyticsModule,
    LeaderboardModule,
    NotificationsModule,
    OracleModule,
    SorobanModule,
    AdminModule,
    AchievementsModule,
    SearchModule,
    CommonModule,
    FlagsModule,
    DisputesModule,
    MatchesModule,
    IndexerModule,
    ContractModule,
    CacheWarmingModule,
    WebsocketModule,
    WebhooksModule,
    AccountModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],

  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: TieredThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
