import { HttpException, HttpStatus } from '@nestjs/common';
import type { BatchPredictionResultDto } from '../dto/batch-submit-response.dto';

export class BatchChainSubmissionFailedException extends HttpException {
  constructor(
    errors: Array<{ index: number; error: string }>,
    results: BatchPredictionResultDto[] = [],
  ) {
    super(
      {
        success: false,
        error: {
          code: 'BATCH_CHAIN_SUBMISSION_FAILED',
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Batch submission failed on-chain - no predictions were persisted',
          errors,
          results,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
