import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, StreamableFile } from '@nestjs/common';
import {
  ResponseInterceptor,
  ApiSuccessEnvelope,
} from './response.interceptor';
import { CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;
  let mockResponse: any;

  beforeEach(async () => {
    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as jest.Mocked<ExecutionContext>;

    mockCallHandler = {
      handle: jest.fn(),
    } as unknown as jest.Mocked<CallHandler>;

    interceptor = new ResponseInterceptor();
  });

  describe('normal response wrapping', () => {
    it('wraps normal response in success envelope', (done) => {
      const responseData = { id: 1, name: 'test' };
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(
            expect.objectContaining({
              success: true,
              data: responseData,
              timestamp: expect.any(String),
            }),
          );
          expect(result.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          );
          done();
        });
    });

    it('wraps null data in success envelope', (done) => {
      mockCallHandler.handle.mockReturnValue(of(null));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(
            expect.objectContaining({
              success: true,
              data: null,
              timestamp: expect.any(String),
            }),
          );
          done();
        });
    });

    it('wraps array response in success envelope', (done) => {
      const responseData = [{ id: 1 }, { id: 2 }];
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(
            expect.objectContaining({
              success: true,
              data: responseData,
              timestamp: expect.any(String),
            }),
          );
          done();
        });
    });

    it('wraps empty object in success envelope', (done) => {
      const responseData = {};
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(
            expect.objectContaining({
              success: true,
              data: responseData,
              timestamp: expect.any(String),
            }),
          );
          done();
        });
    });
  });

  describe('StreamableFile passthrough', () => {
    it('does not wrap StreamableFile instance', (done) => {
      const streamableFile = new StreamableFile(Buffer.from('test content'));
      mockCallHandler.handle.mockReturnValue(of(streamableFile));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe(streamableFile);
          expect(result).not.toHaveProperty('success');
          expect(result).not.toHaveProperty('data');
          expect(result).not.toHaveProperty('timestamp');
          done();
        });
    });
  });

  describe('204 No Content status passthrough', () => {
    it('does not wrap response when status code is 204', (done) => {
      mockResponse.statusCode = 204;
      const responseData = undefined;
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeUndefined();
          done();
        });
    });

    it('does not wrap response when status code is 304 Not Modified', (done) => {
      mockResponse.statusCode = 304;
      const responseData = undefined;
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeUndefined();
          done();
        });
    });
  });

  describe('status code boundary cases', () => {
    it('wraps response when status code is 200', (done) => {
      mockResponse.statusCode = 200;
      const responseData = { message: 'ok' };
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', responseData);
          done();
        });
    });

    it('wraps response when status code is 201 Created', (done) => {
      mockResponse.statusCode = 201;
      const responseData = { id: 'new-id' };
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', responseData);
          done();
        });
    });

    it('wraps response when status code is 400 Bad Request', (done) => {
      mockResponse.statusCode = 400;
      const responseData = { error: 'invalid input' };
      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', responseData);
          done();
        });
    });
  });
});
