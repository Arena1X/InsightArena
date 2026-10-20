import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateBookmarkDto {
  @ApiProperty({
    description: 'ID of the market to bookmark',
    example: '27c91229-34ac-44fd-b343-a96db4108bb3',
  })
  @IsUUID()
  market_id: string;
}
