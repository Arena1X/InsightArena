import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { QueryFailedError } from 'typeorm';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let mockRequest: Record<string, any>;
  let mockHost: Partial<ArgumentsHost>;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'GET',
      url: '/test',
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    };
  });

  describe('catch', () => {
    it('should be defined', () => {
      expect(filter).toBeDefined();
    });

    it('should handle HttpException with 400 status', () => {
      const exception = new HttpException(
        'Bad request',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.BAD_REQUEST,
            message: 'Bad request',
          },
        }),
      );
    });

    it('should handle HttpException with object response body', () => {
      const exception = new HttpException(
        { message: ['Field is required', 'Invalid format'] },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.UNPROCESSABLE_ENTITY,
            message: 'Field is required, Invalid format',
          },
        }),
      );
    });

    it('should handle HttpException with string response body', () => {
      const exception = new HttpException(
        'Unauthorized access',
        HttpStatus.UNAUTHORIZED,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.UNAUTHORIZED,
            message: 'Unauthorized access',
          },
        }),
      );
    });

    it('should handle QueryFailedError with unique violation', () => {
      const exception = Object.create(QueryFailedError.prototype);
      exception.code = '23505'; // PostgreSQL unique violation

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.CONFLICT,
            message: 'A record with these details already exists.',
          },
        }),
      );
    });

    it('should handle QueryFailedError with generic database error', () => {
      const exception = Object.create(QueryFailedError.prototype);
      exception.code = '42000'; // Generic database error

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Database query failed',
          },
        }),
      );
    });

    it('should handle generic unknown exceptions', () => {
      const exception = new Error('Unknown error');

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          },
        }),
      );
    });

    it('should return response with timestamp', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle HttpException with message array', () => {
      const exception = new HttpException(
        { message: ['error1', 'error2', 'error3'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            code: HttpStatus.BAD_REQUEST,
            message: 'error1, error2, error3',
          },
        }),
      );
    });

    it('should handle 404 Not Found exception', () => {
      const exception = new HttpException(
        'Resource not found',
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.NOT_FOUND,
            message: 'Resource not found',
          },
        }),
      );
    });

    it('should handle 403 Forbidden exception', () => {
      const exception = new HttpException(
        'Access forbidden',
        HttpStatus.FORBIDDEN,
      );

      filter.catch(exception, mockHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: HttpStatus.FORBIDDEN,
            message: 'Access forbidden',
          },
        }),
      );
    });
  });
});
