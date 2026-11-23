import {
  Controller,
  Get,
  INestApplication,
  Logger as NestLogger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import {
  ALT_INCOMING_HEADER,
  CORRELATION_ID_HEADER,
  assignCorrelationId,
  correlationIdMiddleware,
  correlationIdStorage,
  getCorrelationId,
  installFetchCorrelationIdPropagation,
  installOutboundCorrelationIdPropagation,
  pinoHttpCorrelationOptions,
  readIncomingCorrelationId,
  runWithCorrelationId,
  withCorrelationId,
} from './correlation-id';
import { ResponseInterceptor } from './interceptors/response.interceptor';

@Controller('probe')
class ProbeController {
  private readonly logger = new NestLogger('ProbeController');

  @Get()
  async handle() {
    this.logger.log('first-event');
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.logger.log('second-event');
    return { ok: true };
  }
}

describe('correlation id helpers', () => {
  it('accepts a well-formed incoming correlation id', () => {
    expect(
      readIncomingCorrelationId({
        headers: { [CORRELATION_ID_HEADER]: 'client-trace-1' },
      }),
    ).toBe('client-trace-1');
  });

  it('accepts uppercase/mixed-case incoming correlation header', () => {
    expect(
      readIncomingCorrelationId({
        headers: { 'X-Correlation-ID': 'trace-mixed-case' },
      }),
    ).toBe('trace-mixed-case');
  });

  it('accepts x-request-id as a fallback incoming header', () => {
    expect(
      readIncomingCorrelationId({
        headers: { 'x-request-id': 'legacy-req-9' },
      }),
    ).toBe('legacy-req-9');
  });

  it('prefers x-correlation-id over x-request-id when both exist', () => {
    expect(
      readIncomingCorrelationId({
        headers: {
          'x-request-id': 'legacy-req-9',
          'x-correlation-id': 'primary-corr-1',
        },
      }),
    ).toBe('primary-corr-1');
  });

  it('handles array header value from Node HTTP', () => {
    expect(
      readIncomingCorrelationId({
        headers: { [CORRELATION_ID_HEADER]: ['first-val', 'second-val'] },
      }),
    ).toBe('first-val');
  });

  it('rejects empty or unsafe incoming ids', () => {
    expect(
      readIncomingCorrelationId({ headers: { [CORRELATION_ID_HEADER]: ' ' } }),
    ).toBeUndefined();
    expect(
      readIncomingCorrelationId({
        headers: { [CORRELATION_ID_HEADER]: 'bad id with spaces' },
      }),
    ).toBeUndefined();
    expect(
      readIncomingCorrelationId({
        headers: { [CORRELATION_ID_HEADER]: 'newline\r\ninjection' },
      }),
    ).toBeUndefined();
    expect(
      readIncomingCorrelationId({
        headers: { [CORRELATION_ID_HEADER]: 'a'.repeat(129) },
      }),
    ).toBeUndefined();
  });

  it('reuses an incoming id and writes it to the response', () => {
    const setHeader = jest.fn();
    const req = { headers: { [CORRELATION_ID_HEADER]: 'kept-id' } };
    const id = assignCorrelationId(req, { setHeader });
    expect(id).toBe('kept-id');
    expect(req).toEqual(expect.objectContaining({ id: 'kept-id' }));
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'kept-id');
  });

  it('does not crash or set header if res.headersSent is true', () => {
    const setHeader = jest.fn();
    const req = { headers: {} };
    const id = assignCorrelationId(req, { setHeader, headersSent: true });
    expect(id).toBeDefined();
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('exposes the id to async work through AsyncLocalStorage', async () => {
    await correlationIdStorage.run('async-job-id', async () => {
      await Promise.resolve();
      expect(getCorrelationId()).toBe('async-job-id');
    });
    expect(getCorrelationId()).toBeUndefined();
  });

  it('supports runWithCorrelationId helper for async jobs', async () => {
    await runWithCorrelationId('job-corr-456', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getCorrelationId()).toBe('job-corr-456');
    });
  });

  it('supports withCorrelationId wrapper for functions/callbacks', () => {
    const wrapped = withCorrelationId((arg: string) => {
      return { id: getCorrelationId(), arg };
    });

    const result = wrapped('payload');
    expect(result.arg).toBe('payload');
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe('outbound correlation id propagation', () => {
  beforeAll(() => {
    installOutboundCorrelationIdPropagation();
  });

  it('attaches the current correlation id to Axios requests with config', async () => {
    await correlationIdStorage.run('axios-corr-1', async () => {
      const instance = axios.create({
        adapter: (config) => {
          const headers = config.headers as {
            get?(name: string): string | undefined;
          };
          expect(headers.get?.(CORRELATION_ID_HEADER)).toBe('axios-corr-1');
          return Promise.resolve({
            data: {},
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        },
      });

      await instance.get('http://correlation.test/outbound', {
        headers: { 'x-other': 'val' },
      });
    });
  });

  it('attaches the current correlation id to Axios requests WITHOUT config', async () => {
    await correlationIdStorage.run('axios-corr-no-config', async () => {
      const instance = axios.create({
        adapter: (config) => {
          const headers = config.headers as {
            get?(name: string): string | undefined;
          };
          expect(headers.get?.(CORRELATION_ID_HEADER)).toBe(
            'axios-corr-no-config',
          );
          return Promise.resolve({
            data: {},
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        },
      });

      // Calling without options/config object
      await instance.get('http://correlation.test/no-config');
    });
  });

  it('does not overwrite existing correlation id on Axios request', async () => {
    await correlationIdStorage.run('current-id', async () => {
      const instance = axios.create({
        adapter: (config) => {
          const headers = config.headers as {
            get?(name: string): string | undefined;
          };
          expect(headers.get?.(CORRELATION_ID_HEADER)).toBe('already-set-id');
          return Promise.resolve({
            data: {},
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        },
      });

      await instance.get('http://correlation.test/custom', {
        headers: { [CORRELATION_ID_HEADER]: 'already-set-id' },
      });
    });
  });

  it('attaches correlation id to global fetch calls', async () => {
    const original = globalThis.fetch;
    const mockFetch = jest
      .fn()
      .mockImplementation((input: unknown, init?: RequestInit) => {
        return Promise.resolve(new Response(JSON.stringify({ ok: true })));
      });
    globalThis.fetch = mockFetch;
    installFetchCorrelationIdPropagation();

    try {
      await correlationIdStorage.run('fetch-corr-1', async () => {
        // Fetch via URL string
        await globalThis.fetch('https://example.com/api');
        expect(mockFetch).toHaveBeenCalled();
        const lastCall = mockFetch.mock.calls[0] as [
          unknown,
          RequestInit | undefined,
        ];
        const headers = new Headers(lastCall[1]?.headers);
        expect(headers.get(CORRELATION_ID_HEADER)).toBe('fetch-corr-1');
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('correlation ids on requests and logs', () => {
  let app: INestApplication;
  let lines: string[];

  beforeEach(async () => {
    lines = [];

    const moduleFixture = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'info',
            autoLogging: true,
            ...pinoHttpCorrelationOptions(),
            stream: {
              write(chunk: string) {
                lines.push(chunk);
              },
            },
          },
        }),
      ],
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(app.get(Logger));
    app.use(correlationIdMiddleware);
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function parsedLogs() {
    return lines
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it('returns a generated correlation id in the response header', async () => {
    const res = await request(app.getHttpServer() as never).get('/probe');

    expect(res.status).toBeLessThan(400);
    expect(res.headers[CORRELATION_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('respects an incoming correlation id', async () => {
    const incoming = 'incoming-corr-abc';
    const res = await request(app.getHttpServer() as never)
      .get('/probe')
      .set(CORRELATION_ID_HEADER, incoming);

    expect(res.status).toBeLessThan(400);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe(incoming);

    const logs = parsedLogs().filter(
      (log) =>
        log.correlationId || (log.req as { id?: string } | undefined)?.id,
    );
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      const reqId = (log.req as { id?: string } | undefined)?.id;
      expect(log.correlationId ?? reqId).toBe(incoming);
    }
  });

  it('respects incoming x-request-id fallback header', async () => {
    const incoming = 'legacy-trace-xyz';
    const res = await request(app.getHttpServer() as never)
      .get('/probe')
      .set(ALT_INCOMING_HEADER, incoming);

    expect(res.status).toBeLessThan(400);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe(incoming);
  });

  it('attaches the same correlation id to all logs for a request', async () => {
    const incoming = 'shared-log-id';
    await request(app.getHttpServer() as never)
      .get('/probe')
      .set(CORRELATION_ID_HEADER, incoming);

    const requestLogs = parsedLogs().filter((log) => {
      const msg = typeof log.msg === 'string' ? log.msg : '';
      return msg.includes('first-event') || msg.includes('second-event');
    });

    expect(requestLogs.length).toBeGreaterThanOrEqual(2);
    // Every application log emitted during the request must share the exact correlation ID
    for (const log of requestLogs) {
      expect(log.correlationId).toBe(incoming);
    }
    const ids = requestLogs.map((log) => log.correlationId);
    expect(new Set(ids)).toEqual(new Set([incoming]));
  });
});
