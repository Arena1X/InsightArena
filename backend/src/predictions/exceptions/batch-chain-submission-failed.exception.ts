import { HttpException, HttpStatus } from '@nestjs/common';

export class BatchChainSubmissionFailedException extends HttpException {
  constructor(errors: Array<{ index: number; error: string }>) {
    super(
      {
        success: false,
        error: {
          code: 'BATCH_CHAIN_SUBMISSION_FAILED',
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Batch submission failed on-chain - no predictions were persisted',
          errors,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
