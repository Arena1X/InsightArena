import { HttpException, HttpStatus } from '@nestjs/common';

export class NoteTooLongException extends HttpException {
  constructor(actualLength: number, maxLength: number) {
    super(
      {
        success: false,
        error: {
          code: 'NOTE_TOO_LONG',
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Note must be at most ${maxLength} characters (received ${actualLength})`,
          maxLength,
          actualLength,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
