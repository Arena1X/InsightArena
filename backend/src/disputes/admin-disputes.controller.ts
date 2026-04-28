import {
  Controller,
  Post,
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
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
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
  constructor(private readonly disputesService: DisputesService) {}

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
}
