import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prediction } from './entities/prediction.entity';
import { PredictionFraudFlag } from './entities/prediction-fraud-flag.entity';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { SlippageCheckerService } from './services/slippage-checker.service';
import { UsersModule } from '../users/users.module';
import { MarketsModule } from '../markets/markets.module';
import { SorobanModule } from '../soroban/soroban.module';
import { CommonModule } from '../common/common.module';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Prediction, User, Market, PredictionFraudFlag]),
    UsersModule,
    MarketsModule,
    SorobanModule,
    CommonModule,
  ],
  controllers: [PredictionsController],
  providers: [PredictionsService, SlippageCheckerService],
  exports: [PredictionsService],
})
export class PredictionsModule {}
