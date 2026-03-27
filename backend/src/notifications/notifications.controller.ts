import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for authenticated user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unread_only', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Paginated notifications list' })
  async getMyNotifications(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('unread_only') unreadOnly?: string,
  ) {
    const isUnreadOnly = unreadOnly === 'true' || unreadOnly === '1';

    const result = await this.notificationsService.findAllForUser(
      user.id,
      Number(page),
      Number(limit),
      unreadOnly === 'true',
    );

    res.set('X-Unread-Count', result.unreadCount.toString());

    return {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 204, description: 'Marked as read' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'Count of notifications updated' })
  async markAllAsRead(@CurrentUser() user: User): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsRead(user.id);
  }
}
