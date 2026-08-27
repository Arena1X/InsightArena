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
import { UpdateCategoryPreferenceDto } from './dto/update-category-preference.dto';
import { CategoryPreferenceResponseDto } from './dto/category-preference-response.dto';
import { BulkUpdateDto } from './dto/bulk-update.dto';

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
  // Category preferences
  // -------------------------------------------------------------------------

  @Get('category-preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get per-category, per-channel notification preferences for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of category preferences with channel toggles',
    type: [CategoryPreferenceResponseDto],
  })
  async getCategoryPreferences(
    @CurrentUser() user: User,
  ): Promise<CategoryPreferenceResponseDto[]> {
    return this.notificationsService.getCategoryPreferences(user.id);
  }

  @Put('category-preferences')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or update a per-category notification preference',
    description:
      'Set in_app, email, and/or push toggles for a specific notification category. ' +
      'Defaults: in_app=true, email=true, push=false.',
  })
  @ApiBody({ type: UpdateCategoryPreferenceDto })
  @ApiResponse({
    status: 200,
    description: 'Updated category preference',
    type: CategoryPreferenceResponseDto,
  })
  async upsertCategoryPreference(
    @CurrentUser() user: User,
    @Body() dto: UpdateCategoryPreferenceDto,
  ): Promise<CategoryPreferenceResponseDto> {
    return this.notificationsService.upsertCategoryPreference(user.id, dto);
  }

  // -------------------------------------------------------------------------
  // Mark as read / unread / delete
  // NOTE: Static routes (read-all, bulk/read, etc.) MUST come before
  // parameterized routes (:id/read) so NestJS matches them correctly.
  // -------------------------------------------------------------------------

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Idempotent — calling it repeatedly has no extra effect.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated unread count (always zero after this call)',
    schema: {
      type: 'object',
      properties: { unreadCount: { type: 'number', example: 0 } },
    },
  })
  async markAllAsRead(
    @CurrentUser() user: User,
  ): Promise<{ unreadCount: number }> {
    return this.notificationsService.markAllAsRead(user.stellar_address);
  }

  @Patch('unread-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as unread',
    description: 'Idempotent — calling it repeatedly has no extra effect.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated unread count (total notifications for the user)',
    schema: {
      type: 'object',
      properties: { unreadCount: { type: 'number', example: 5 } },
    },
  })
  async markAllAsUnread(
    @CurrentUser() user: User,
  ): Promise<{ unreadCount: number }> {
    return this.notificationsService.markAllAsUnread(user.stellar_address);
  }

  @Patch('bulk/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a list of notifications as read',
    description:
      'Idempotent — notifications already read are unaffected. ' +
      'Scoped to the authenticated user only.',
  })
  @ApiBody({ type: BulkUpdateDto })
  @ApiResponse({
    status: 200,
    description: 'Updated unread count after the bulk operation',
    schema: {
      type: 'object',
      properties: { unreadCount: { type: 'number', example: 3 } },
    },
  })
  async markMultipleAsRead(
    @CurrentUser() user: User,
    @Body() dto: BulkUpdateDto,
  ): Promise<{ unreadCount: number }> {
    return this.notificationsService.markMultipleAsRead(
      user.stellar_address,
      dto.notificationIds,
    );
  }

  @Patch('bulk/unread')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a list of notifications as unread',
    description:
      'Idempotent — notifications already unread are unaffected. ' +
      'Scoped to the authenticated user only.',
  })
  @ApiBody({ type: BulkUpdateDto })
  @ApiResponse({
    status: 200,
    description: 'Updated unread count after the bulk operation',
    schema: {
      type: 'object',
      properties: { unreadCount: { type: 'number', example: 7 } },
    },
  })
  async markMultipleAsUnread(
    @CurrentUser() user: User,
    @Body() dto: BulkUpdateDto,
  ): Promise<{ unreadCount: number }> {
    return this.notificationsService.markMultipleAsUnread(
      user.stellar_address,
      dto.notificationIds,
    );
  }

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
