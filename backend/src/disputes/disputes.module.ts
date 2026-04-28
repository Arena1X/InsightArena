import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from './entities/dispute.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AdminDisputesController } from './admin-disputes.controller';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanModule } from '../soroban/soroban.module';

@Module({
  imports: [TypeOrmModule.forFeature([Dispute, Market, User]), SorobanModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
