import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import {
  DisputeChainReconciliationReport,
  DisputeChainReconciliationService,
} from './dispute-chain-reconciliation.service';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { AssignArbiterDto } from './dto/assign-arbiter.dto';
import { Dispute } from './entities/dispute.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User } from '../users/entities/user.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('admin-disputes')
@Controller('admin/disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminDisputesController {
  constructor(
    private readonly disputesService: DisputesService,
    private readonly chainReconciliationService: DisputeChainReconciliationService,
  ) {}

  @Post('reconcile-chain')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  @ApiOperation({
    summary:
      'Reconcile dispute on-chain IDs against contract state (Admin only). ' +
      'Corrects stale or missing chain IDs; flags disputes missing on-chain ' +
      'and resolution disagreements without changing them.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Reconciliation report, or null if a run is already in progress',
  })
  async reconcileChain(): Promise<DisputeChainReconciliationReport | null> {
    return this.chainReconciliationService.reconcile();
  }

  @Get('reconcile-chain/last')
  @Roles(Role.Admin)
  @ApiOperation({
    summary: 'Get the most recent dispute chain reconciliation report',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Last reconciliation report, or null if none has run',
  })
  getLastChainReconciliation(): DisputeChainReconciliationReport | null {
    return this.chainReconciliationService.getLastReport();
  }

  @Get('breached')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Get breached disputes (Admin only)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of breached disputes',
    type: [Dispute],
  })
  async getBreachedDisputes(): Promise<Dispute[]> {
    return this.disputesService.findBreachedDisputes();
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Resolve a dispute (Admin only)' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dispute resolved successfully',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dispute is not pending',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Admin access required',
  })
  async resolve(
    @Param('id') id: string,
    @Body() resolveDisputeDto: ResolveDisputeDto,
    @CurrentUser() adminUser: User,
  ): Promise<Dispute> {
    return this.disputesService.resolve(id, resolveDisputeDto, adminUser);
  }

  @Patch(':id/assign-arbiter')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  @ApiOperation({
    summary:
      'Assign an admin/moderator as the arbiter for a pending dispute ' +
      '(Admin only). Determines who is notified as the SLA deadline ' +
      'approaches or is breached.',
  })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Arbiter assigned successfully',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute or arbiter user not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Dispute is not pending, or the target user is not an admin/moderator',
  })
  async assignArbiter(
    @Param('id') id: string,
    @Body() assignArbiterDto: AssignArbiterDto,
    @CurrentUser() adminUser: User,
  ): Promise<Dispute> {
    return this.disputesService.assignArbiter(
      id,
      assignArbiterDto.arbiter_id,
      adminUser.id,
    );
  }
}
