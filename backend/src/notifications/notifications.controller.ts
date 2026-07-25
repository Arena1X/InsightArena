import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { NotificationsService } from './notifications.service';
import {
  NotificationChannel,
  NotificationFrequency,
} from './entities/notification-preference.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Inline DTOs (kept small — project uses inline classes elsewhere too)
// ---------------------------------------------------------------------------

class UpdatePreferenceDto {
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsEnum(NotificationFrequency)
  frequency: NotificationFrequency;

  /**
   * Optional quiet-hours window in "HH:MM-HH:MM" UTC format, e.g. "22:00-07:00".
   * Pass null to remove quiet hours.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/, {
    message: 'quietHours must be in "HH:MM-HH:MM" format',
  })
  quietHours?: string | null;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // -------------------------------------------------------------------------
  // Notification list
  // -------------------------------------------------------------------------

  @Get(':address')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get notifications for a user by address' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'read',
    required: false,
    type: String,
    enum: ['true', 'false', 'all'],
    example: 'all',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    description: 'Filter by notification type',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated notifications list with unread count',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getNotifications(
    @Param('address') address: string,
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('read') read?: string,
    @Query('type') type?: string,
  ) {
    if (user.stellar_address !== address) {
      return {
        success: false,
        message: 'Unauthorized',
        statusCode: 401,
      };
    }

    let readFilter: boolean | undefined;
    if (read === 'true') {
      readFilter = true;
    } else if (read === 'false') {
      readFilter = false;
    }

    return this.notificationsService.findAllForUser(
      address,
      Number(page),
      Number(limit),
      readFilter,
      type,
    );
  }

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get notification preferences for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of per-channel notification preferences',
  })
  async getPreferences(@CurrentUser() user: User) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Create or update a notification preference for the authenticated user',
    description:
      'frequency=INSTANT delivers immediately; HOURLY/DAILY batches into a digest. ' +
      'quietHours (UTC "HH:MM-HH:MM") defers — never drops — notifications.',
  })
  @ApiBody({ type: UpdatePreferenceDto })
  @ApiResponse({
    status: 200,
    description: 'Updated preference record',
  })
  async upsertPreference(
    @CurrentUser() user: User,
    @Body() dto: UpdatePreferenceDto,
  ) {
    return this.notificationsService.upsertPreference(
      user.id,
      dto.channel,
      dto.frequency,
      dto.quietHours,
    );
  }

  // -------------------------------------------------------------------------
  // Mark as read / delete
  // -------------------------------------------------------------------------

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 204, description: 'Marked as read' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.notificationsService.markAsRead(
      Number(id),
      user.stellar_address,
    );
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'Count of notifications updated' })
  async markAllAsRead(@CurrentUser() user: User): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsRead(user.stellar_address);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.notificationsService.remove(Number(id), user.stellar_address);
  }
}
