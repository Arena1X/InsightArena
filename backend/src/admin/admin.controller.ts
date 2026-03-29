import {
  Controller,
  Get,
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

  @Get('users/:id/activity')
  async getUserActivity(
    @Param('id') id: string,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.adminService.getUserActivity(id, query);
  }
}
