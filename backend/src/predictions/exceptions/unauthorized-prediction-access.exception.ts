import { HttpException, HttpStatus } from '@nestjs/common';

export class UnauthorizedPredictionAccessException extends HttpException {
  constructor(predictionId: string) {
    super(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED_PREDICTION_ACCESS',
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to view this prediction',
          predictionId,
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
