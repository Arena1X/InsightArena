import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { Season } from './entities/season.entity';
import { SeasonDistributionLedgerEntry } from './entities/season-distribution-ledger.entity';
import { SeasonRolloverScheduler } from './season-rollover.scheduler';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Season, User, SeasonDistributionLedgerEntry]),
    UsersModule,
    NotificationsModule,
    WebhooksModule,
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService, SeasonRolloverScheduler],
  exports: [SeasonsService],
})
export class SeasonsModule {}
