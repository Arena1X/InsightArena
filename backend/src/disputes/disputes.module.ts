import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeVote } from './entities/dispute-vote.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AdminDisputesController } from './admin-disputes.controller';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanModule } from '../soroban/soroban.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dispute,
      DisputeEvidence,
      DisputeVote,
      Market,
      User,
    ]),
    SorobanModule,
    NotificationsModule,
  ],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
