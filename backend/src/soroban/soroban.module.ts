import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SorobanService } from './soroban.service';
import { SorobanListener } from './soroban.listener';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { SystemState } from './entities/system-state.entity';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Market, Prediction, User, SystemState]),
  ],
  providers: [SorobanService, SorobanListener],
  exports: [SorobanService],
})
export class SorobanModule {}
