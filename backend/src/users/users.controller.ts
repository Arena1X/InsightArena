import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { PublicUserDto } from './dto/public-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import {
  ListUserPredictionsDto,
  PaginatedPublicUserPredictionsResponse,
} from './dto/list-user-predictions.dto';

import { ListUserCompetitionsDto } from './dto/list-user-competitions.dto';
import { UserStatsDto } from './dto/user-stats.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Fetch own profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getOwnProfile(@CurrentUser() user: User) {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('me')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({ summary: 'Update own profile (username, avatar_url)' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateOwnProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.usersService.updateProfile(user.id, dto);
    return plainToInstance(UserResponseDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':address')
  @Public()
  async getPublicProfile(@Param('address') address: string) {
    const user = await this.usersService.findByAddress(address);
    return plainToInstance(PublicUserDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':address/predictions')
  @Public()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({
    summary: "Get a user's predictions for resolved markets (public)",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated predictions for resolved markets only',
  })
  async getPublicPredictions(
    @Param('address') address: string,
    @Query() query: ListUserPredictionsDto,
  ): Promise<PaginatedPublicUserPredictionsResponse> {
    return this.usersService.findPublicPredictionsByAddress(address, query);
  }

  @Get(':address/stats')
  @Public()
  @ApiOperation({ summary: 'Detailed public statistics for a user profile' })
  @ApiResponse({ status: 200, description: 'User statistics', type: UserStatsDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserStats(@Param('address') address: string): Promise<UserStatsDto> {
    return this.usersService.getPublicStatsByAddress(address);
  }

  @Get(':address/competitions')
  @Public()
  @ApiOperation({ summary: 'Get competitions a user has participated in' })
  @ApiResponse({ status: 200, description: 'List of competitions' })
  async getUserCompetitions(
    @Param('address') address: string,
    @Query() query: ListUserCompetitionsDto,
  ) {
    return this.usersService.findUserCompetitions(address, query);
  }
}
