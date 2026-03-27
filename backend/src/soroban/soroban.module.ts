import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SorobanService } from './soroban.service';
import { SorobanListener } from './soroban.listener';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { SystemState } from './entities/system-state.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Market, Prediction, User, SystemState])],
  providers: [SorobanService, SorobanListener],
  exports: [SorobanService],
})
export class SorobanModule {}
