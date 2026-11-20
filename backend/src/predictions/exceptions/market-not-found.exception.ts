import { HttpException, HttpStatus } from '@nestjs/common';

export class MarketNotFoundException extends HttpException {
  constructor(marketId: string) {
    super(
      {
        success: false,
        error: {
          code: 'MARKET_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          message: `Market "${marketId}" not found`,
          marketId,
        },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
