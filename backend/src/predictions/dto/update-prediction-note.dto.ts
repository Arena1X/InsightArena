import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePredictionNoteDto {
  @ApiProperty({
    description: 'Personal note for the prediction',
    example: 'I think this outcome is likely based on recent trends',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  note: string;
}
