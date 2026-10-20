import { HttpException, HttpStatus } from '@nestjs/common';

export class PredictionNotFoundException extends HttpException {
  constructor(predictionId: string) {
    super(
      {
        success: false,
        error: {
          code: 'PREDICTION_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          message: `Prediction "${predictionId}" not found`,
          predictionId,
        },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
