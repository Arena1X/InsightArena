import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BanGuard } from '../common/guards/ban.guard';
import { User } from '../users/entities/user.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('disputes')
@Controller('disputes')
@UseGuards(JwtAuthGuard, BanGuard)
@ApiBearerAuth()
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new dispute' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Dispute created successfully',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Market not found, not resolved, or dispute window passed',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Dispute already exists for this market',
  })
  async create(
    @Body() createDisputeDto: CreateDisputeDto,
    @CurrentUser() user: User,
  ): Promise<Dispute> {
    return this.disputesService.create(createDisputeDto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a dispute by ID' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dispute retrieved successfully',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  async findOne(@Param('id') id: string): Promise<Dispute> {
    return this.disputesService.findOne(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all disputes with pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: DisputeStatus,
    description: 'Filter by dispute status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Disputes retrieved successfully',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: DisputeStatus,
  ): Promise<{
    disputes: Dispute[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.disputesService.findAll(pageNum, limitNum, status);
  }

  @Get('market/:marketId')
  @ApiOperation({ summary: 'Get disputes for a specific market' })
  @ApiParam({ name: 'marketId', description: 'Market ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Market disputes retrieved successfully',
    type: [Dispute],
  })
  async findByMarket(@Param('marketId') marketId: string): Promise<Dispute[]> {
    return this.disputesService.findByMarket(marketId);
  }
}
