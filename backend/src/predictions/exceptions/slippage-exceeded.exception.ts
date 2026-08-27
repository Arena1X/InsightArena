import { HttpException, HttpStatus } from '@nestjs/common';

export class SlippageExceededException extends HttpException {
  constructor(
    public readonly expectedPrice: string,
    public readonly actualPrice: string,
    public readonly expectedShares: string,
    public readonly actualShares: string,
  ) {
    super(
      {
        success: false,
        error: {
          code: HttpStatus.CONFLICT,
          message: 'Slippage tolerance exceeded',
          details: {
            expectedPrice,
            actualPrice,
            expectedShares,
            actualShares,
          },
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
