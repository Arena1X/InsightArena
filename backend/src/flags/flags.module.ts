import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flag } from './entities/flag.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { AdminAuditLog } from '../admin/entities/admin-audit-log.entity';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { FlagsService } from './flags.service';
import { FlagsController } from './flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FlagEvaluationCacheService } from './flag-evaluation-cache.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flag, FeatureFlag, AdminAuditLog, User, Market]),
    AnalyticsModule,
  ],
  controllers: [FlagsController, FeatureFlagsController],
  providers: [FlagsService, FeatureFlagsService, FlagEvaluationCacheService],
  exports: [FlagsService, FeatureFlagsService],
})
export class FlagsModule {}
