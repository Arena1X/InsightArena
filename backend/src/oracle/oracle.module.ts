import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import { CreatorEvent } from '../creator-events/entities/creator-event.entity';
import { OracleService } from './oracle.service';
import { OracleController } from './oracle.controller';
import { WebhookService } from './webhook.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { OracleAssignmentGuard } from './guards/oracle-assignment.guard';
import { SubmissionHistoryService } from './submission-history.service';
import { OracleSubmission } from './entities/oracle-submission.entity';
import { OracleSubmissionFlag } from './entities/oracle-submission-flag.entity';
import { OracleSourceReliability } from './entities/oracle-source-reliability.entity';
import { OracleAssignment } from './entities/oracle-assignment.entity';
import { OracleReliabilityService } from './oracle-reliability.service';
import { MatchResultDivergence } from '../matches/entities/match-result-divergence.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatorEventMatch,
      CreatorEvent,
      OracleSubmission,
      OracleSubmissionFlag,
      OracleSourceReliability,
      OracleAssignment,
      MatchResultDivergence,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [OracleController],
  providers: [
    OracleService,
    WebhookService,
    WebhookAuthGuard,
    OracleAssignmentGuard,
    SubmissionHistoryService,
    OracleReliabilityService,
  ],
  exports: [
    OracleService,
    WebhookService,
    SubmissionHistoryService,
    OracleReliabilityService,
  ],
})
export class OracleModule {}
