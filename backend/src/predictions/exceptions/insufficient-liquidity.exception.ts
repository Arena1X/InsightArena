import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientLiquidityException extends HttpException {
  constructor(
    public readonly actualPrice: string,
    public readonly actualShares: string,
    public readonly minShares: string,
  ) {
    super(
      {
        success: false,
        error: {
          code: 'INSUFFICIENT_LIQUIDITY',
          statusCode: HttpStatus.CONFLICT,
          message: 'Market has insufficient liquidity to price this prediction',
          details: {
            actualPrice,
            actualShares,
            minShares,
          },
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
