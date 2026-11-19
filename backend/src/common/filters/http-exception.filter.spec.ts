import { Test } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { QueryFailedError } from 'typeorm';
import { Request, Response } from 'express';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'POST',
      url: '/api/v1/predictions',
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as any;

    jest.spyOn(filter['logger'], 'error').mockImplementation();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(filter).toBeDefined();
    });

    it('should have logger instance', () => {
      expect(filter['logger']).toBeDefined();
    });
  });

  describe('catch method', () => {
    it('should be defined', () => {
      expect(filter.catch).toBeDefined();
    });

    it('should return undefined (void)', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      const result = filter.catch(exception, mockArgumentsHost);

      expect(result).toBeUndefined();
    });

    it('should call response.status with correct status code', () => {
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('should call response.json with error object', () => {
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(Object),
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('HttpException handling', () => {
    it('should extract status from HttpException', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    });

    it('should extract string message from HttpException', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Test error',
          }),
        }),
      );
    });

    it('should handle array messages from validation errors', () => {
      const exception = new HttpException(
        { message: ['field1 error', 'field2 error'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'field1 error, field2 error',
          }),
        }),
      );
    });

    it('should handle object response with message property', () => {
      const exception = new HttpException(
        { message: 'Object message', statusCode: 400 },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Object message',
          }),
        }),
      );
    });

    it('should use exception.message as fallback', () => {
      const exception = new HttpException(
        {},
        HttpStatus.BAD_REQUEST,
      );
      exception.message = 'Fallback message';

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Fallback message',
          }),
        }),
      );
    });

    it('should handle string response body', () => {
      const exception = new HttpException('String response', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'String response',
          }),
        }),
      );
    });

    it('should handle different HTTP status codes', () => {
      const statuses = [
        { exception: new BadRequestException('Bad'), status: HttpStatus.BAD_REQUEST },
        { exception: new NotFoundException('Not found'), status: HttpStatus.NOT_FOUND },
        { exception: new ConflictException('Conflict'), status: HttpStatus.CONFLICT },
      ];

      statuses.forEach(({ exception, status }) => {
        (mockResponse.status as jest.Mock).mockClear();
        filter.catch(exception, mockArgumentsHost);
        expect(mockResponse.status).toHaveBeenCalledWith(status);
      });
    });
  });

  describe('QueryFailedError handling', () => {
    it('should handle duplicate key constraint (23505)', () => {
      const error = new QueryFailedError(
        'INSERT INTO ...',
        [],
        new Error('duplicate key'),
      );
      (error as any).code = '23505';

      filter.catch(error, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'A record with these details already exists.',
          }),
        }),
      );
    });

    it('should handle other database errors', () => {
      const error = new QueryFailedError(
        'SELECT * FROM ...',
        [],
        new Error('query failed'),
      );
      (error as any).code = 'OTHER_CODE';

      filter.catch(error, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Database query failed',
          }),
        }),
      );
    });

    it('should handle QueryFailedError without code', () => {
      const error = new QueryFailedError(
        'SELECT * FROM ...',
        [],
        new Error('unknown error'),
      );

      filter.catch(error, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Database query failed',
          }),
        }),
      );
    });
  });

  describe('generic error handling', () => {
    it('should handle plain Error objects', () => {
      const exception = new Error('Generic error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Internal server error',
          }),
        }),
      );
    });

    it('should handle non-Error objects', () => {
      const exception = 'String error';

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('should handle null or undefined', () => {
      filter.catch(null, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });

  describe('logging', () => {
    it('should log 500 errors with request details', () => {
      const exception = new Error('Server error');
      mockRequest.method = 'POST';
      mockRequest.url = '/api/v1/test';

      filter.catch(exception, mockArgumentsHost);

      expect(filter['logger'].error).toHaveBeenCalledWith(
        'POST /api/v1/test',
        expect.any(String),
      );
    });

    it('should log error stack trace', () => {
      const exception = new Error('Stack trace test');
      exception.stack = 'Error: Stack trace test\n  at ...';

      filter.catch(exception, mockArgumentsHost);

      expect(filter['logger'].error).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Stack trace test'),
      );
    });

    it('should not log non-500 errors', () => {
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockArgumentsHost);

      expect(filter['logger'].error).not.toHaveBeenCalled();
    });

    it('should log string representation of non-Error exceptions', () => {
      const exception = { message: 'Object exception' };

      filter.catch(exception, mockArgumentsHost);

      expect(filter['logger'].error).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('response format', () => {
    it('should include success: false', () => {
      const exception = new BadRequestException('Error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        }),
      );
    });

    it('should include error object with code and message', () => {
      const exception = new HttpException('Error message', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            code: HttpStatus.BAD_REQUEST,
            message: 'Error message',
          },
        }),
      );
    });

    it('should include ISO timestamp', () => {
      const exception = new BadRequestException('Error');
      const beforeCall = new Date().toISOString();

      filter.catch(exception, mockArgumentsHost);

      const callArgs = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const afterCall = new Date().toISOString();

      expect(new Date(callArgs.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeCall).getTime(),
      );
      expect(new Date(callArgs.timestamp).getTime()).toBeLessThanOrEqual(
        new Date(afterCall).getTime(),
      );
    });

    it('should set correct error code in response', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: HttpStatus.FORBIDDEN,
          }),
        }),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle HttpException with null response', () => {
      const exception = new HttpException(null, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle HttpException with undefined message', () => {
      const exception = new HttpException(
        { message: undefined },
        HttpStatus.BAD_REQUEST,
      );
      exception.message = 'Default message';

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Default message',
          }),
        }),
      );
    });

    it('should handle extremely long error messages', () => {
      const longMessage = 'x'.repeat(10000);
      const exception = new BadRequestException(longMessage);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalled();
      const callArgs = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.error.message).toHaveLength(10000);
    });

    it('should handle special characters in error messages', () => {
      const exception = new BadRequestException('Error: <script>alert("xss")</script>');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('<script>'),
          }),
        }),
      );
    });

    it('should handle validation errors with many fields', () => {
      const messages = Array(50)
        .fill(null)
        .map((_, i) => `field${i} error`);

      const exception = new BadRequestException({ message: messages });

      filter.catch(exception, mockArgumentsHost);

      const callArgs = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.error.message).toContain('field0 error');
      expect(callArgs.error.message).toContain('field49 error');
    });
  });

  describe('filter implementation', () => {
    it('should implement ExceptionFilter interface', () => {
      expect(filter.catch).toBeDefined();
      expect(typeof filter.catch).toBe('function');
    });

    it('should be decorated with @Catch()', () => {
      expect(filter).toBeDefined();
    });

    it('should not return a value (void)', () => {
      const exception = new BadRequestException('Error');

      const result = filter.catch(exception, mockArgumentsHost);

      expect(result).toBeUndefined();
    });

    it('should handle ArgumentsHost correctly', () => {
      const exception = new BadRequestException('Error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockArgumentsHost.switchToHttp).toHaveBeenCalled();
    });
  });
});
