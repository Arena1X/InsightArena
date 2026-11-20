import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Central exception filter for the predictions module.
 * Ensures all domain exceptions are mapped to consistent HTTP responses
 * with stable error codes, preventing 500 errors for user-caused issues.
 */
@Catch()
export class PredictionsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PredictionsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Handle HttpException (including our domain exceptions)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // If it's already a structured response (our domain exceptions), use it
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'error' in exceptionResponse
      ) {
        return response.status(status).json(exceptionResponse);
      }

      // Otherwise, structure the response
      return response.status(status).json({
        success: false,
        error: {
          code: this.getErrorCode(status),
          statusCode: status,
          message:
            typeof exceptionResponse === 'string'
              ? exceptionResponse
              : (exceptionResponse as any).message || 'An error occurred',
          ...(typeof exceptionResponse === 'object' &&
            exceptionResponse !== null && {
              ...exceptionResponse,
            }),
        },
      });
    }

    // Handle unexpected errors (500)
    this.logger.error(
      'Unhandled exception in predictions module',
      exception instanceof Error ? exception.stack : exception,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
      },
    });
  }

  /**
   * Map HTTP status codes to stable error codes for generic exceptions
   */
  private getErrorCode(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
