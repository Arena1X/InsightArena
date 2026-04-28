import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum UserCompetitionFilterStatus {
  Active = 'active',
  Completed = 'completed',
}

export class ListUserCompetitionsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: UserCompetitionFilterStatus })
  @IsOptional()
  @IsEnum(UserCompetitionFilterStatus)
  status?: UserCompetitionFilterStatus;
}

export class UserCompetitionResponseItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  rank: number | null;

  @ApiProperty()
  score: number;

  @ApiProperty()
  end_time: Date;

  @ApiProperty({ example: 'active' })
  status: string;
}
