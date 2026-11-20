import { HttpException, HttpStatus } from '@nestjs/common';

export class BatchSizeExceededException extends HttpException {
  constructor(actualSize: number, maxSize: number) {
    super(
      {
        success: false,
        error: {
          code: 'BATCH_SIZE_EXCEEDED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Batch size exceeds the maximum of ${maxSize} predictions`,
          actualSize,
          maxSize,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
