import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { PublicUserDto } from './dto/public-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UpdateUserPreferencesDto,
  UserPreferencesResponseDto,
} from './dto/user-preferences.dto';
import {
  PaginationDto,
  FollowersListDto,
  FollowingListDto,
  FollowActionResponseDto,
  FollowStatsResponseDto,
} from './dto/user-follow.dto';
import { User } from './entities/user.entity';
import {
  ListUserPredictionsDto,
  PaginatedPublicUserPredictionsResponse,
} from './dto/list-user-predictions.dto';
import {
  ListUserBookmarksDto,
  PaginatedUserBookmarksResponse,
} from './dto/list-user-bookmarks.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { UserBookmark } from '../markets/entities/user-bookmark.entity';
import { ApiBearerAuth } from '@nestjs/swagger';

import { ListUserCompetitionsDto } from './dto/list-user-competitions.dto';
import {
  ListUserMarketsDto,
  PaginatedUserMarketsResponse,
} from './dto/list-user-markets.dto';
import { UserStatsResponseDto } from './dto/user-stats.dto';
import {
  ClaimReferralDto,
  ClaimReferralResponseDto,
  MyReferralsResponseDto,
} from './dto/referral.dto';
import { GetFeedQueryDto } from './dto/get-feed-query.dto';
import { FeedResponseDto } from './dto/feed-response.dto';

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

  @Get('me/stats')
  @ApiOperation({
    summary: 'Get lightweight prediction stats for current user',
  })
  @ApiResponse({
    status: 200,
    description: 'User stats retrieved successfully',
    type: UserStatsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyStats(@CurrentUser() user: User): Promise<UserStatsResponseDto> {
    return this.usersService.getMyStats(user.id);
  }

  @Get('me/bookmarks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get favorite markets for current user' })
  @ApiResponse({
    status: 200,
    description: 'Paginated user bookmarks',
  })
  async getUserBookmarks(
    @CurrentUser() user: User,
    @Query() query: ListUserBookmarksDto,
  ): Promise<PaginatedUserBookmarksResponse> {
    return this.usersService.findUserBookmarks(user.id, query);
  }

  @Post('me/bookmarks')
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bookmark a market for the current user' })
  @ApiResponse({ status: 201, description: 'Market bookmarked' })
  @ApiResponse({ status: 404, description: 'Market not found' })
  @ApiResponse({ status: 409, description: 'Market already bookmarked' })
  async createBookmark(
    @CurrentUser() user: User,
    @Body() dto: CreateBookmarkDto,
  ): Promise<UserBookmark> {
    return this.usersService.addBookmark(user.id, dto.market_id);
  }

  @Delete('me/bookmarks/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a bookmark owned by the current user' })
  @ApiResponse({ status: 200, description: 'Bookmark removed' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async deleteBookmark(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: true }> {
    await this.usersService.removeBookmark(user.id, id);
    return { success: true };
  }

  @Get('me/referrals')
  @ApiOperation({
    summary: "Get the current user's referral code, counts, and statuses",
  })
  @ApiResponse({
    status: 200,
    description: 'Referral counts and statuses retrieved successfully',
    type: MyReferralsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyReferrals(
    @CurrentUser() user: User,
  ): Promise<MyReferralsResponseDto> {
    return this.usersService.getMyReferrals(user.id);
  }

  @Post('me/referrals/claim')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({
    summary: 'Record that the current user was referred by another user',
  })
  @ApiResponse({
    status: 201,
    description: 'Referral recorded successfully',
    type: ClaimReferralResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Self-referral is not allowed',
  })
  @ApiResponse({
    status: 404,
    description: 'Referrer not found',
  })
  @ApiResponse({
    status: 409,
    description: 'A referral has already been recorded for this account',
  })
  async claimReferral(
    @CurrentUser() user: User,
    @Body() dto: ClaimReferralDto,
  ): Promise<ClaimReferralResponseDto> {
    return this.usersService.claimReferral(user.id, dto.referrer_id);
  }

  @Get('me/feed')
  @ApiBearerAuth()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({
    summary: 'Get personalized activity feed from followed users',
  })
  @ApiResponse({
    status: 200,
    description:
      'Paginated feed of predictions from followed users, ordered by recency. ' +
      'Excludes activity from soft-deleted users. ' +
      'No block exclusion applied — no blocked-users model exists in this codebase yet.',
    type: FeedResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyFeed(
    @CurrentUser() user: User,
    @Query() query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.usersService.getFeed(user.id, query);
  }

  @Patch('me')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
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

  @Get(':address/markets')
  @Public()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({ summary: 'List markets created by a user (public)' })
  @ApiResponse({ status: 200, description: 'Paginated markets list' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserMarkets(
    @Param('address') address: string,
    @Query() query: ListUserMarketsDto,
  ): Promise<PaginatedUserMarketsResponse> {
    return this.usersService.findMarketsByAddress(address, query);
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

  @Get('me/export')
  @ApiOperation({ summary: 'Export all user data (GDPR)' })
  @ApiResponse({ status: 200, description: 'User data exported as JSON' })
  async exportData(@CurrentUser() user: User) {
    return await this.usersService.exportUserData(user.id);
  }

  @Patch('me/preferences')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Post(':address/follow')
  @ApiOperation({ summary: 'Follow a user' })
  @ApiResponse({
    status: 200,
    description: 'User followed successfully',
    type: FollowActionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async followUser(
    @CurrentUser() user: User,
    @Param('address') address: string,
  ): Promise<FollowActionResponseDto> {
    return this.usersService.followUser(user.id, address);
  }

  @Delete(':address/unfollow')
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiResponse({
    status: 200,
    description: 'User unfollowed successfully',
    type: FollowActionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Follow relationship not found' })
  async unfollowUser(
    @CurrentUser() user: User,
    @Param('address') address: string,
  ): Promise<FollowActionResponseDto> {
    return this.usersService.unfollowUser(user.id, address);
  }

  @Get(':address/followers')
  @Public()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({ summary: 'Get followers of a user' })
  @ApiResponse({
    status: 200,
    description: 'Paginated followers list',
    type: FollowersListDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getFollowers(
    @Param('address') address: string,
    @Query() query: PaginationDto,
  ): Promise<FollowersListDto> {
    return this.usersService.getFollowers(address, query);
  }

  @Get(':address/following')
  @Public()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  @ApiOperation({ summary: 'Get users that a user is following' })
  @ApiResponse({
    status: 200,
    description: 'Paginated following list',
    type: FollowingListDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getFollowing(
    @Param('address') address: string,
    @Query() query: PaginationDto,
  ): Promise<FollowingListDto> {
    return this.usersService.getFollowing(address, query);
  }

  @Get(':address/follow-stats')
  @Public()
  @ApiOperation({ summary: 'Get follower and following counts for a user' })
  @ApiResponse({
    status: 200,
    description: 'User follow statistics',
    type: FollowStatsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getFollowStats(
    @Param('address') address: string,
  ): Promise<FollowStatsResponseDto> {
    return this.usersService.getFollowStats(address);
  }
}
