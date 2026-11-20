import { HttpException, HttpStatus } from '@nestjs/common';

export class PredictionNotWonException extends HttpException {
  constructor(predictionId: string) {
    super(
      {
        success: false,
        error: {
          code: 'PREDICTION_NOT_WON',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'You did not win this prediction',
          predictionId,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
