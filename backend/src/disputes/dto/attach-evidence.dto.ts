import {
  IsString,
  IsUrl,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachEvidenceDto {
  @ApiProperty({
    description: 'URL where the evidence file is hosted',
    example: 'https://storage.example.com/evidence/screenshot.png',
  })
  @IsUrl()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({
    description: 'Original file name',
    example: 'screenshot.png',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 204800,
  })
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @ApiProperty({
    description: 'Optional note describing the evidence',
    example: 'Screenshot showing the market resolved incorrectly.',
    maxLength: 500,
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
