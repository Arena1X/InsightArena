import { IsNumber, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

export class UserFollowResponseDto {
  id: string;
  stellar_address: string;
  username: string | null;
  avatar_url: string | null;
  reputation_score: number;
}

export class FollowersListDto {
  data: UserFollowResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export class FollowingListDto {
  data: UserFollowResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export class FollowActionResponseDto {
  success: boolean;
  message: string;
}
