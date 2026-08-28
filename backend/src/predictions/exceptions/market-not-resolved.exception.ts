import { HttpException, HttpStatus } from '@nestjs/common';

export class MarketNotResolvedException extends HttpException {
  constructor(marketId: string) {
    super(
      {
        success: false,
        error: {
          code: 'MARKET_NOT_RESOLVED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Market is not yet resolved',
          marketId,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
