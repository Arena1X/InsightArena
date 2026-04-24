import {
  Controller,
  Post,
  Get,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { FlagsService } from './flags.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';
import { Flag } from './entities/flag.entity';

@ApiTags('Flags')
@Controller('flags')
@UseGuards(JwtAuthGuard)
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
}
