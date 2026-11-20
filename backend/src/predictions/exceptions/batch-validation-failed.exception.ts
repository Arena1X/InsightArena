import { HttpException, HttpStatus } from '@nestjs/common';
import type { BatchPredictionResultDto } from '../dto/batch-submit-response.dto';

export class BatchValidationFailedException extends HttpException {
  constructor(
    errors: Array<{ index: number; error: string }>,
    results: BatchPredictionResultDto[] = [],
  ) {
    super(
      {
        success: false,
        error: {
          code: 'BATCH_VALIDATION_FAILED',
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Batch submission failed validation - no predictions were submitted',
          errors,
          results,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
