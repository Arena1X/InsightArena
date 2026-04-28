import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flag } from './entities/flag.entity';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { FlagsService } from './flags.service';
import { FlagsController } from './flags.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [TypeOrmModule.forFeature([Flag, User, Market]), AnalyticsModule],
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
