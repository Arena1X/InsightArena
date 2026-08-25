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
import { AttachEvidenceDto } from './dto/attach-evidence.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import {
  ListDisputesDto,
  PaginatedDisputesResponse,
} from './dto/list-disputes.dto';
import { Dispute } from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
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

  @Get('my')
  @ApiOperation({ summary: 'Get disputes filed by the current user' })
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Disputes retrieved successfully',
  })
  async findMyDisputes(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    disputes: Dispute[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.disputesService.findMyDisputes(user.id, pageNum, limitNum);
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
  @ApiOperation({
    summary:
      'List disputes with status/date filters and cursor pagination. ' +
      'Response metadata includes counts by status.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Disputes retrieved successfully',
  })
  async findAll(
    @Query() query: ListDisputesDto,
  ): Promise<PaginatedDisputesResponse> {
    return this.disputesService.findAll(query);
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

  @Post(':id/evidence')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach evidence to a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Evidence attached successfully',
    type: DisputeEvidence,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dispute is not pending, or file type/size is not allowed',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only dispute participants can attach evidence',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  async attachEvidence(
    @Param('id') id: string,
    @Body() attachEvidenceDto: AttachEvidenceDto,
    @CurrentUser() user: User,
  ): Promise<DisputeEvidence> {
    return this.disputesService.attachEvidence(id, attachEvidenceDto, user);
  }

  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cast a reputation-weighted vote on a pending dispute. The tier ' +
      'finalizes automatically once weighted participation meets quorum.',
  })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Vote recorded; dispute returned (resolved if quorum reached)',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Voting is closed, or the voter has no wallet address',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'This address has already voted in this dispute',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  async vote(
    @Param('id') id: string,
    @Body() castVoteDto: CastVoteDto,
    @CurrentUser() user: User,
  ): Promise<Dispute> {
    return this.disputesService.castVote(id, castVoteDto, user);
  }

  @Post(':id/escalate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Escalate a resolved dispute tier to the next tier. Allowed only ' +
      'after the tier resolves and within the escalation window.',
  })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Dispute escalated; the new higher-tier dispute is returned',
    type: Dispute,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Dispute is not resolved, at max tier, or the escalation window passed',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'This dispute has already been escalated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  async escalate(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Dispute> {
    return this.disputesService.escalate(id, user);
  }

  @Get(':id/evidence')
  @ApiOperation({ summary: 'List evidence attached to a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Evidence retrieved successfully',
    type: [DisputeEvidence],
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only dispute participants can view evidence',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Dispute not found',
  })
  async listEvidence(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<DisputeEvidence[]> {
    return this.disputesService.listEvidence(id, user);
  }
}
