import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidOutcomeException extends HttpException {
  constructor(chosenOutcome: string, validOptions: string[]) {
    super(
      {
        success: false,
        error: {
          code: 'INVALID_OUTCOME',
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Invalid outcome "${chosenOutcome}". Valid options: ${validOptions.join(', ')}`,
          chosenOutcome,
          validOptions,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
