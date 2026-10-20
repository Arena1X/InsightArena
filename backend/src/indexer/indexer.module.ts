import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ContractEvent } from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { ChainSyncCheckpoint } from './entities/chain-sync-checkpoint.entity';
import { ReorgEvent } from './entities/reorg-event.entity';
import { IndexerService } from './indexer.service';
import { IndexerController } from './indexer.controller';
import { IndexerHealthController } from './indexer-health.controller';
import { IndexerHealthService } from './health.service';
import { ReconciliationService } from './reconciliation.service';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { CreatorEventLeaderboardEntry } from '../matches/entities/creator-event-leaderboard-entry.entity';
import { CreatorEventPayout } from '../matches/entities/creator-event-payout.entity';
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
      ChainSyncCheckpoint,
      ReorgEvent,
      CreatorEvent,
      CreatorEventLeaderboardEntry,
      CreatorEventPayout,
      Match,
      MatchPrediction,
      User,
    ]),
    CacheModule.register(),
    NotificationsModule,
    WebsocketModule,
  ],
  controllers: [IndexerController, IndexerHealthController],
  providers: [IndexerService, IndexerHealthService, ReconciliationService],
  exports: [IndexerService, IndexerHealthService, ReconciliationService],
})
export class IndexerModule {}
