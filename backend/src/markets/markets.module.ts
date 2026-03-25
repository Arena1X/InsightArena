import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Market } from './entities/market.entity';
import { MarketsService } from './markets.service';
import { MarketsController } from './markets.controller';
import { UsersModule } from '../users/users.module';
import { SorobanModule } from '../soroban/soroban.module';

@Module({
  imports: [TypeOrmModule.forFeature([Market]), UsersModule, SorobanModule],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
