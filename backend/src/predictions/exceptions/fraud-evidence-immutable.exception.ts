import { HttpException, HttpStatus } from '@nestjs/common';

export class FraudEvidenceImmutableException extends HttpException {
  constructor(flagId: string) {
    super(
      {
        success: false,
        error: {
          code: 'FRAUD_EVIDENCE_IMMUTABLE',
          statusCode: HttpStatus.CONFLICT,
          message: `Evidence snapshot for fraud flag ${flagId} is write-once and cannot be modified`,
          flagId,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
