import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListFlagsQueryDto } from '../flags/dto/list-flags-query.dto';
import { ResolveFlagDto } from '../flags/dto/resolve-flag.dto';
import { ListFraudFlagsQueryDto } from '../predictions/dto/list-fraud-flags-query.dto';
import { AdminService } from './admin.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { BulkImportMarketsDto } from './dto/bulk-import-markets.dto';
import { BulkUserActionDto } from './dto/bulk-user-action.dto';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { FeeStatsResponseDto } from './dto/fee-stats-response.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ListVerifiedAddressesQueryDto } from './dto/list-verified-addresses-query.dto';
import { ListCreatorEventsQueryDto } from './dto/list-creator-events-query.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { ReportQueryDto, ReportFormat } from './dto/report-query.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

type RequestUser = Request & { user: { id: string } };

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @Roles(Role.Admin, Role.Moderator)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 1 minute
  async getDashboardStats(): Promise<StatsResponseDto> {
    return this.adminService.getStats();
  }

  @Get('creator-events/fees')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fee collection statistics' })
  @ApiResponse({
    status: 200,
    description: 'Fee statistics',
    type: FeeStatsResponseDto,
  })
  async getFeeStats(
    @Query() query: DateRangeQueryDto,
  ): Promise<FeeStatsResponseDto> {
    return this.adminService.getFeeStats(query);
  }

  @Delete('competitions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a competition' })
  @ApiResponse({ status: 200, description: 'Competition cancelled' })
  @ApiResponse({ status: 404, description: 'Competition not found' })
  @ApiResponse({
    status: 409,
    description: 'Competition cannot be cancelled',
  })
  @ApiResponse({ status: 502, description: 'Refund process failed' })
  async cancelCompetition(
    @Param('id') id: string,
    @Request() req: RequestUser,
  ) {
    return this.adminService.adminCancelCompetition(
      id,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Get('users')
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('creator-events/verified-addresses')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all verified addresses for creator events' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of verified addresses',
  })
  async listVerifiedAddresses(@Query() query: ListVerifiedAddressesQueryDto) {
    return this.adminService.listVerifiedAddresses(query);
  }

  @Get('creator-events/moderate')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all events for moderation with filtering and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of events with moderation data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async listCreatorEventsForModeration(
    @Query() query: ListCreatorEventsQueryDto,
  ) {
    return this.adminService.listCreatorEventsForModeration(query);
  }

  @Patch('users/:id/ban')
  async banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @Request() req: any,
  ) {
    return this.adminService.banUser(
      id,
      dto.reason,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Patch('users/:id/unban')
  async unbanUser(@Param('id') id: string, @Request() req: any) {
    return this.adminService.unbanUser(
      id,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Post('users/bulk-action')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply a moderation action (ban/unban/flag) to multiple users',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-user result report for the bulk action',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async bulkUserAction(
    @Body() dto: BulkUserActionDto,
    @Request() req: RequestUser,
  ) {
    return this.adminService.bulkUserAction(
      dto,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Request() req: any,
  ) {
    return this.adminService.updateUserRole(
      id,
      dto,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Get('users/:id/activity')
  async getUserActivity(
    @Param('id') id: string,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.adminService.getUserActivity(id, query);
  }

  @Get('flags')
  @Roles(Role.Admin, Role.Moderator)
  async listFlags(@Query() query: ListFlagsQueryDto) {
    return this.adminService.listFlags(query);
  }

  @Get('predictions/fraud-flags')
  @Roles(Role.Admin, Role.Moderator)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'List advisory prediction fraud signal flags (timing clustering, ' +
      'counterparty concentration). Advisory only - no automatic ' +
      'enforcement is taken from these flags.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of fraud flags' })
  async listFraudFlags(@Query() query: ListFraudFlagsQueryDto) {
    return this.adminService.listFraudFlags(query);
  }

  @Patch('flags/:id/resolve')
  @Roles(Role.Admin, Role.Moderator)
  async resolveFlag(
    @Param('id') id: string,
    @Body() dto: ResolveFlagDto,
    @Request() req: any,
  ) {
    return this.adminService.resolveFlag(
      id,
      dto,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Post('markets/bulk-import')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Bulk-import markets from a CSV string. Admin-only. Valid rows are ' +
      'created; invalid rows are reported with reasons and do not abort ' +
      'the rest of the import.',
  })
  async bulkImportMarkets(
    @Body() dto: BulkImportMarketsDto,
    @Request() req: any,
  ) {
    return this.adminService.importMarketsFromCsv(
      dto.csv,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Post('markets/:id/resolve')
  async resolveMarket(
    @Param('id') id: string,
    @Body() dto: ResolveMarketDto,
    @Request() req: any,
  ) {
    return this.adminService.adminResolveMarket(
      id,
      dto,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Patch('comments/:id/moderate')
  async moderateComment(
    @Param('id') id: string,
    @Body() dto: ModerateCommentDto,
  ) {
    return this.adminService.moderateComment(id, dto.is_moderated, dto.reason);
  }

  @Patch('markets/:id/feature')
  async featureMarket(@Param('id') id: string, @Request() req: any) {
    return this.adminService.featureMarket(
      id,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Patch('markets/:id/unfeature')
  async unfeatureMarket(@Param('id') id: string, @Request() req: any) {
    return this.adminService.unfeatureMarket(
      id,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Get('reports/activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get activity report for platform monitoring' })
  @ApiResponse({
    status: 200,
    description: 'Activity report in JSON or CSV format',
  })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  async getActivityReport(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.adminService.getActivityReport(query);

    if (query.format === ReportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="activity-report.csv"',
      );
      res.send(result);
    } else {
      res.json(result);
    }
  }
}
