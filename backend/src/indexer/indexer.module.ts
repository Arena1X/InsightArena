import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ContractEvent } from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { IndexerService } from './indexer.service';
import { IndexerController } from './indexer.controller';
import { IndexerHealthController } from './indexer-health.controller';
import { IndexerHealthService } from './health.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContractEvent,
      FeeHistory,
      IndexerCheckpoint,
      CreatorEvent,
      Match,
      MatchPrediction,
      User,
    ]),
    CacheModule.register(),
    NotificationsModule,
    WebsocketModule,
  ],
  controllers: [IndexerController, IndexerHealthController],
  providers: [IndexerService, IndexerHealthService],
  exports: [IndexerService, IndexerHealthService],
})
export class IndexerModule {}
