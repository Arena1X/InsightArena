import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { MarketsService } from './markets.service';
import { Market } from './entities/market.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { MarketResponseDto } from './dto/market-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  @ApiOperation({ summary: 'Fetch all markets' })
  @ApiResponse({
    status: 200,
    description: 'Markets retrieved successfully',
    type: [Market],
  })
  async getAllMarkets(): Promise<Market[]> {
    return this.marketsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch market by ID' })
  @ApiResponse({
    status: 200,
    description: 'Market retrieved successfully',
    type: Market,
  })
  @ApiResponse({ status: 404, description: 'Market not found' })
  async getMarketById(@Param('id') id: string): Promise<Market | null> {
    return this.marketsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: 'Create a new prediction market' })
  @ApiResponse({
    status: 201,
    description: 'Market created successfully',
    type: MarketResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. end_time in past, < 2 outcomes)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 502, description: 'Soroban contract call failed' })
  async createMarket(
    @CurrentUser() user: User,
    @Body() dto: CreateMarketDto,
  ) {
    const market = await this.marketsService.createMarket(dto, user);
    return plainToInstance(MarketResponseDto, market, {
      excludeExtraneousValues: true,
    });
  }
}
