import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { ReportQueryDto } from './dto/report-query.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  async getDashboardStats(): Promise<StatsResponseDto> {
    return this.adminService.getStats();
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

  @Get('reports/activity')
  async getActivityReport(@Query() query: ReportQueryDto) {
    return this.adminService.getActivityReport(query);
  }
}
