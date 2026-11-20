import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountExportCleanupScheduler } from './account-export-cleanup.scheduler';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { DataExportJob } from './entities/data-export-job.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataExportJob])],
  controllers: [AccountController],
  providers: [AccountService, AccountExportCleanupScheduler],
})
export class AccountModule {}
