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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListFlagsQueryDto } from '../flags/dto/list-flags-query.dto';
import { ResolveFlagDto } from '../flags/dto/resolve-flag.dto';
import { AdminService } from './admin.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { UpdateSystemConfigDto } from './dto/system-config.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  async getDashboardStats(): Promise<StatsResponseDto> {
    return this.adminService.getStats();
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
  async cancelCompetition(@Param('id') id: string, @Request() req: any) {
    return this.adminService.adminCancelCompetition(
      id,
      (req as { user: { id: string } }).user.id,
    );
  }

  @Get('users')
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
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
  async listFlags(@Query() query: ListFlagsQueryDto) {
    return this.adminService.listFlags(query);
  }

  @Patch('flags/:id/resolve')
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
  async getActivityReport(@Query() query: ReportQueryDto) {
    return this.adminService.getActivityReport(query);
  }

  @Get('config')
  async getConfig() {
    return this.adminService.getConfig();
  }

  @Patch('config')
  async updateConfig(@Body() dto: UpdateSystemConfigDto, @Request() req: any) {
    return this.adminService.updateConfig(
      dto,
      (req as { user: { id: string } }).user.id,
    );
  }
}
