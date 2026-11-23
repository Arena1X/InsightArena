import { ExecutionContext, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ResponseInterceptor,
  ApiSuccessEnvelope,
} from './response.interceptor';
import { CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import {
  ALT_INCOMING_HEADER,
  CORRELATION_ID_HEADER,
  correlationIdStorage,
  getCorrelationId,
} from '../correlation-id';

function makeHttpContext(
  statusCode: number,
  incomingHeaders: Record<string, string> = {},
): {
  context: jest.Mocked<ExecutionContext>;
  request: { headers: Record<string, string>; id?: string };
  response: { statusCode: number; setHeader: jest.Mock };
} {
  const request = { headers: incomingHeaders };
  const response = { statusCode, setHeader: jest.fn() };
  const context = {
    getType: jest.fn().mockReturnValue('http'),
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(response),
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
  } as unknown as jest.Mocked<ExecutionContext>;

  return { context, request, response };
}

function makeInterceptor(metadataValue: boolean | undefined): {
  interceptor: ResponseInterceptor;
  context: jest.Mocked<ExecutionContext>;
  response: { statusCode: number; setHeader: jest.Mock };
} {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(metadataValue),
  } as unknown as Reflector;

  const interceptor = new ResponseInterceptor(reflector);
  const { context, response } = makeHttpContext(200);

  return { interceptor, context, response };
}

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;
  let mockResponse: { statusCode: number; setHeader: jest.Mock };
  let mockRequest: { headers: Record<string, string>; id?: string };

  beforeEach(() => {
    const http = makeHttpContext(200);
    mockResponse = http.response;
    mockRequest = http.request;
    mockExecutionContext = http.context;

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    interceptor = new ResponseInterceptor(reflector);

    mockCallHandler = {
      handle: jest.fn(),
    } as unknown as jest.Mocked<CallHandler>;
  });

  afterEach(() => {
    correlationIdStorage.enterWith(undefined as unknown as string);
  });

  // ─── existing: normal response wrapping ──────────────────────────────────

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
          expect((result as ApiSuccessEnvelope).timestamp).toMatch(
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

  // ─── existing: StreamableFile passthrough ────────────────────────────────

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

  // ─── existing: 204 / 304 passthrough ─────────────────────────────────────

  describe('204 No Content status passthrough', () => {
    it('does not wrap response when status code is 204', (done) => {
      mockResponse.statusCode = 204;
      mockCallHandler.handle.mockReturnValue(of(undefined));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeUndefined();
          done();
        });
    });

    it('does not wrap response when status code is 304 Not Modified', (done) => {
      mockResponse.statusCode = 304;
      mockCallHandler.handle.mockReturnValue(of(undefined));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeUndefined();
          done();
        });
    });
  });

  // ─── existing: status code boundary cases ────────────────────────────────

  describe('status code boundary cases', () => {
    it('wraps response when status code is 200', (done) => {
      mockResponse.statusCode = 200;
      mockCallHandler.handle.mockReturnValue(of({ message: 'ok' }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', { message: 'ok' });
          done();
        });
    });

    it('wraps response when status code is 201 Created', (done) => {
      mockResponse.statusCode = 201;
      mockCallHandler.handle.mockReturnValue(of({ id: 'new-id' }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', { id: 'new-id' });
          done();
        });
    });

    it('wraps response when status code is 400 Bad Request', (done) => {
      mockResponse.statusCode = 400;
      mockCallHandler.handle.mockReturnValue(of({ error: 'invalid input' }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('success', true);
          expect(result).toHaveProperty('data', { error: 'invalid input' });
          done();
        });
    });
  });

  describe('correlation id', () => {
    it('returns a generated correlation id in the response header', (done) => {
      mockCallHandler.handle.mockReturnValue(of({ ok: true }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe(() => {
          expect(mockResponse.setHeader).toHaveBeenCalledWith(
            CORRELATION_ID_HEADER,
            expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
          );
          expect(getCorrelationId()).toBeDefined();
          done();
        });
    });

    it('respects an incoming x-correlation-id header', (done) => {
      mockRequest.headers[CORRELATION_ID_HEADER] = 'incoming-corr-123';
      mockCallHandler.handle.mockReturnValue(of({ ok: true }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe(() => {
          expect(mockResponse.setHeader).toHaveBeenCalledWith(
            CORRELATION_ID_HEADER,
            'incoming-corr-123',
          );
          expect(mockRequest.id).toBe('incoming-corr-123');
          expect(getCorrelationId()).toBe('incoming-corr-123');
          done();
        });
    });

    it('respects an incoming x-request-id fallback header', (done) => {
      mockRequest.headers[ALT_INCOMING_HEADER] = 'fallback-trace-456';
      mockCallHandler.handle.mockReturnValue(of({ ok: true }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe(() => {
          expect(mockResponse.setHeader).toHaveBeenCalledWith(
            CORRELATION_ID_HEADER,
            'fallback-trace-456',
          );
          expect(mockRequest.id).toBe('fallback-trace-456');
          expect(getCorrelationId()).toBe('fallback-trace-456');
          done();
        });
    });

    it('preserves existing request.id if already set', (done) => {
      mockRequest.id = 'pre-assigned-req-id';
      mockCallHandler.handle.mockReturnValue(of({ ok: true }));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe(() => {
          expect(mockResponse.setHeader).toHaveBeenCalledWith(
            CORRELATION_ID_HEADER,
            'pre-assigned-req-id',
          );
          expect(mockRequest.id).toBe('pre-assigned-req-id');
          done();
        });
    });

    it('safely passes through non-HTTP execution contexts', (done) => {
      const nonHttpContext = {
        getType: jest.fn().mockReturnValue('ws'),
        switchToHttp: jest.fn().mockReturnValue({
          getResponse: jest.fn().mockReturnValue(null),
          getRequest: jest.fn().mockReturnValue(null),
        }),
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
      } as unknown as jest.Mocked<ExecutionContext>;

      mockCallHandler.handle.mockReturnValue(of({ event: 'pong' }));

      interceptor
        .intercept(nonHttpContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('data', { event: 'pong' });
          done();
        });
    });
  });

  // ─── new: pagination metadata ─────────────────────────────────────────────

  describe('pagination metadata (opted-in endpoints)', () => {
    it('includes pagination block when handler is marked @Paginated()', (done) => {
      const { interceptor: pi, context: ctx } = makeInterceptor(true);
      const callHandler: jest.Mocked<CallHandler> = {
        handle: jest.fn(),
      } as unknown as jest.Mocked<CallHandler>;

      const payload = {
        items: [{ id: 1 }, { id: 2 }],
        total: 42,
        nextCursor: 'cursor-abc',
      };
      callHandler.handle.mockReturnValue(of(payload));

      pi.intercept(ctx, callHandler).subscribe((result) => {
        const envelope = result as ApiSuccessEnvelope;
        expect(envelope.success).toBe(true);
        expect(envelope.data).toEqual(payload);
        expect(envelope.pagination).toEqual({
          nextCursor: 'cursor-abc',
          total: 42,
        });
        done();
      });
    });

    it('sets nextCursor to null on the last page', (done) => {
      const { interceptor: pi, context: ctx } = makeInterceptor(true);
      const callHandler: jest.Mocked<CallHandler> = {
        handle: jest.fn(),
      } as unknown as jest.Mocked<CallHandler>;

      const payload = {
        items: [{ id: 10 }],
        total: 1,
        nextCursor: null,
      };
      callHandler.handle.mockReturnValue(of(payload));

      pi.intercept(ctx, callHandler).subscribe((result) => {
        const envelope = result as ApiSuccessEnvelope;
        expect(envelope.pagination).toEqual({
          nextCursor: null,
          total: 1,
        });
        done();
      });
    });

    it('does not add pagination block to non-paginated responses', (done) => {
      // reflector returns undefined — no @Paginated() decorator present
      const { interceptor: pi, context: ctx } = makeInterceptor(undefined);
      const callHandler: jest.Mocked<CallHandler> = {
        handle: jest.fn(),
      } as unknown as jest.Mocked<CallHandler>;

      const responseData = { id: 99, name: 'plain response' };
      callHandler.handle.mockReturnValue(of(responseData));

      pi.intercept(ctx, callHandler).subscribe((result) => {
        const envelope = result as ApiSuccessEnvelope;
        expect(envelope.success).toBe(true);
        expect(envelope.data).toEqual(responseData);
        expect(envelope.pagination).toBeUndefined();
        done();
      });
    });
  });
});
