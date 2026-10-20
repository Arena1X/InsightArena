import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountService } from './account.service';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('export')
  requestExport(@CurrentUser() user: User) {
    return this.accountService.requestExport(user.id);
  }

  @Get('export/:jobId')
  getExportStatus(@CurrentUser() user: User, @Param('jobId') jobId: string) {
    return this.accountService.getExportStatus(user.id, jobId);
  }

  @Get('export/:jobId/download')
  async downloadExport(
    @CurrentUser() user: User,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.accountService.downloadExport(user.id, jobId);
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="export-${jobId}.json"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Delete()
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: User): Promise<void> {
    await this.accountService.deleteAccount(user.id);
  }
}
