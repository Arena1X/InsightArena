import { HttpException, HttpStatus } from '@nestjs/common';

export class BatchValidationFailedException extends HttpException {
  constructor(errors: Array<{ index: number; error: string }>) {
    super(
      {
        success: false,
        error: {
          code: 'BATCH_VALIDATION_FAILED',
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Batch submission failed validation - no predictions were submitted',
          errors,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
