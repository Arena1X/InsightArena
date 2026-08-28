import { HttpException, HttpStatus } from '@nestjs/common';

export class PayoutAlreadyClaimedException extends HttpException {
  constructor(predictionId: string) {
    super(
      {
        success: false,
        error: {
          code: 'PAYOUT_ALREADY_CLAIMED',
          statusCode: HttpStatus.CONFLICT,
          message: 'Payout has already been claimed',
          predictionId,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
