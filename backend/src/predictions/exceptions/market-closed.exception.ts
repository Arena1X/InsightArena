import { HttpException, HttpStatus } from '@nestjs/common';

export class MarketClosedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        success: false,
        error: {
          code: 'MARKET_CLOSED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: reason,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
