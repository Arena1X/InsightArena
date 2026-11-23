process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = process.env.JWT_SECRET || '12345678901234567890123456789012';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
process.env.SOROBAN_CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
process.env.SERVER_SECRET_KEY = process.env.SERVER_SECRET_KEY || 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

import { Test } from '@nestjs/testing';
import { VersioningType } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { buildSwaggerConfig, exportOpenApiAndStaticDocs } from '../src/main';

import { AppController } from '../src/app.controller';
import { AccountController } from '../src/account/account.controller';
import { AchievementsController } from '../src/achievements/achievements.controller';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { ApiKeyController } from '../src/auth/api-key.controller';
import { AuthController } from '../src/auth/auth.controller';
import { FxRateController } from '../src/common/fx-rate.controller';
import { CompetitionsController } from '../src/competitions/competitions.controller';
import { CreatorEventsController } from '../src/creator-events/creator-events.controller';
import { DisputesController } from '../src/disputes/disputes.controller';
import { FlagsController } from '../src/flags/flags.controller';
import { LeaderboardController } from '../src/leaderboard/leaderboard.controller';
import { MarketsController } from '../src/markets/markets.controller';
import { PublicMarketsController } from '../src/markets/public-markets.controller';
import { MatchesController } from '../src/matches/matches.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { OracleController } from '../src/oracle/oracle.controller';
import { PredictionsController } from '../src/predictions/predictions.controller';
import { SearchController } from '../src/search/search.controller';
import { SeasonsController } from '../src/seasons/seasons.controller';
import { UsersController } from '../src/users/users.controller';
import { WebhooksController } from '../src/webhooks/webhooks.controller';

const controllers = [
  AppController,
  AccountController,
  AchievementsController,
  AnalyticsController,
  ApiKeyController,
  AuthController,
  FxRateController,
  CompetitionsController,
  CreatorEventsController,
  DisputesController,
  FlagsController,
  LeaderboardController,
  MarketsController,
  PublicMarketsController,
  MatchesController,
  NotificationsController,
  OracleController,
  PredictionsController,
  SearchController,
  SeasonsController,
  UsersController,
  WebhooksController,
];

export async function generateFullOpenApiSpec() {
  const moduleRef = await Test.createTestingModule({
    controllers,
  })
    .useMocker(() => ({
      get: () => 'test',
      canActivate: () => true,
    }))
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const config = buildSwaggerConfig();
  const document = SwaggerModule.createDocument(app, config);
  await app.close();
  return document;
}

if (require.main === module) {
  generateFullOpenApiSpec()
    .then((doc) => {
      exportOpenApiAndStaticDocs(doc);
      console.log('Successfully generated OpenAPI document and static reference HTML.');
    })
    .catch((err) => {
      console.error('Failed to generate OpenAPI spec:', err);
      process.exit(1);
    });
}
