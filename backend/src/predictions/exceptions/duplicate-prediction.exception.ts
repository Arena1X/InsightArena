import { HttpException, HttpStatus } from '@nestjs/common';

export class DuplicatePredictionException extends HttpException {
  constructor(marketId: string) {
    super(
      {
        success: false,
        error: {
          code: 'DUPLICATE_PREDICTION',
          statusCode: HttpStatus.CONFLICT,
          message: 'You have already submitted a prediction for this market',
          marketId,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
