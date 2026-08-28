import { HttpException, HttpStatus } from '@nestjs/common';

export class NoClaimableRewardsException extends HttpException {
  constructor(userId: string) {
    super(
      {
        success: false,
        error: {
          code: 'NO_CLAIMABLE_REWARDS',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'No claimable rewards',
          userId,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
