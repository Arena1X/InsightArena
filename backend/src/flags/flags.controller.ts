import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { FlagsService } from './flags.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';
import { Flag } from './entities/flag.entity';

@ApiTags('Flags')
@Controller('flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a flag on a market' })
  @ApiResponse({
    status: 201,
    description: 'Flag created successfully',
    type: Flag,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 409, description: 'User already flagged this market' })
  async createFlag(
    @Body() createFlagDto: CreateFlagDto,
    @CurrentUser() user: User,
  ): Promise<Flag> {
    try {
      return await this.flagsService.createFlag(user.id, createFlagDto);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Market not found') {
          throw new NotFoundException('Market not found');
        }
        if (error.message === 'You have already flagged this market') {
          throw new ConflictException('You have already flagged this market');
        }
      }
      throw error;
    }
  }

  @Get('my-flags')
  @ApiOperation({ summary: "Get authenticated user's submitted flags" })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'User flags retrieved successfully',
  })
  async getMyFlags(
    @CurrentUser() user: User,
    @Query() query: ListFlagsQueryDto,
  ) {
    return this.flagsService.listFlags({
      ...query,
      user_id: user.id,
    });
  }

  @Get()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'List all open/submitted flags (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Flags list retrieved successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden resource' })
  async listFlags(@Query() query: ListFlagsQueryDto) {
    return this.flagsService.listFlags(query);
  }

  @Patch(':id/resolve')
  @Roles(Role.Admin)
  @ApiOperation({
    summary: 'Resolve a flag with an action and reason (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Flag resolved successfully',
    type: Flag,
  })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  @ApiResponse({ status: 409, description: 'Flag has already been resolved' })
  @ApiResponse({ status: 403, description: 'Forbidden resource' })
  async resolveFlag(
    @Param('id') id: string,
    @Body() resolveFlagDto: ResolveFlagDto,
    @CurrentUser() user: User,
  ): Promise<Flag> {
    return this.flagsService.resolveFlag(id, resolveFlagDto, user.id);
  }
}
