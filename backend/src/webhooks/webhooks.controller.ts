import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Scopes } from '../common/decorators/scopes.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

import { WebhooksService } from './services/webhooks.service';

import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDeliveryLog } from './entities/webhook-delivery-log.entity';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, ApiKeyGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('endpoints')
  @Scopes('webhooks:write')
  async createEndpoint(
    @CurrentUser() user: User,
    @Body() dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    return this.webhooksService.createEndpoint(user, dto);
  }

  @Get('endpoints')
  @Scopes('webhooks:read')
  async listEndpoints(@CurrentUser() user: User): Promise<WebhookEndpoint[]> {
    return this.webhooksService.listEndpoints(user.id);
  }

  @Get('endpoints/:id')
  @Scopes('webhooks:read')
  async getEndpoint(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<WebhookEndpoint> {
    return this.webhooksService.findEndpointById(id, user.id);
  }

  @Patch('endpoints/:id')
  @Scopes('webhooks:write')
  async updateEndpoint(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    return this.webhooksService.updateEndpoint(id, user.id, dto);
  }

  @Delete('endpoints/:id')
  @Scopes('webhooks:write')
  async deleteEndpoint(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    return this.webhooksService.deleteEndpoint(id, user.id);
  }

  @Get('endpoints/:id/deliveries')
  @Scopes('webhooks:read')
  async getDeliveryLogs(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ logs: WebhookDeliveryLog[]; total: number }> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.webhooksService.getDeliveryLogs(
      id,
      user.id,
      parsedLimit,
      parsedOffset,
    );
  }

  @Get('deliveries/dead-letter')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Scopes('webhooks:admin')
  async listDeadLetterDeliveries(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ logs: WebhookDeliveryLog[]; total: number }> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.webhooksService.listDeadLetterDeliveries(
      parsedLimit,
      parsedOffset,
    );
  }

  @Post('deliveries/:id/redrive')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Scopes('webhooks:admin')
  async redriveDelivery(@Param('id') id: string): Promise<WebhookDeliveryLog> {
    return this.webhooksService.redriveDelivery(id);
  }
}
