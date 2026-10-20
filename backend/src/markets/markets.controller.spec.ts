import { Test, TestingModule } from '@nestjs/testing';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { DisputesService } from '../disputes/disputes.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { OptionalIdempotencyInterceptor } from '../common/idempotency/optional-idempotency.interceptor';
import { User } from '../users/entities/user.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { ExecutionContext, UnprocessableEntityException } from '@nestjs/common';
import { of } from 'rxjs';

describe('MarketsController', () => {
  let controller: MarketsController;
  let marketsService: jest.Mocked<
    Pick<
      MarketsService,
      'create' | 'createBulk' | 'findAllFiltered' | 'getComments'
    >
  >;
  let idempotencyService: jest.Mocked<
    Pick<IdempotencyService, 'acquire' | 'complete' | 'release'>
  >;
  let interceptor: OptionalIdempotencyInterceptor;

  const mockUser = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL',
  } as User;

  beforeEach(async () => {
    marketsService = {
      create: jest.fn(),
      createBulk: jest.fn(),
      findAllFiltered: jest.fn(),
      getComments: jest.fn(),
    } as any;

    idempotencyService = {
      acquire: jest.fn(),
      complete: jest.fn(),
      release: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketsController],
      providers: [
        { provide: MarketsService, useValue: marketsService },
        { provide: AnalyticsService, useValue: {} },
        { provide: DisputesService, useValue: {} },
        { provide: IdempotencyService, useValue: idempotencyService },
        OptionalIdempotencyInterceptor,
      ],
    }).compile();

    controller = module.get<MarketsController>(MarketsController);
    interceptor = module.get<OptionalIdempotencyInterceptor>(
      OptionalIdempotencyInterceptor,
    );
  });

  // -------------------------------------------------------------------------
  // Idempotency Tests
  // -------------------------------------------------------------------------
  describe('OptionalIdempotencyInterceptor', () => {
    const makeMockExecutionContext = (
      headers: Record<string, string>,
      body: any,
    ): ExecutionContext => {
      const req = {
        headers,
        body,
        method: 'POST',
        originalUrl: '/markets',
        user: { id: 'user-uuid-1' },
      };
      const res = {
        statusCode: 201,
        setHeader: jest.fn(),
      };
      return {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as any;
    };

    it('should bypass idempotency logic if header is missing', async () => {
      const context = makeMockExecutionContext({}, { title: 'New Market' });
      const next = {
        handle: () => of({ id: 'market-1', title: 'New Market' }),
      };

      await interceptor.intercept(context, next);
      expect(idempotencyService.acquire).not.toHaveBeenCalled();
    });

    it('should reject with UnprocessableEntityException if key is not a valid UUID', async () => {
      const context = makeMockExecutionContext(
        { 'idempotency-key': 'not-a-uuid' },
        { title: 'New Market' },
      );
      const next = { handle: () => of({}) };

      await expect(interceptor.intercept(context, next)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should process normally and complete if key is first used', async () => {
      const key = '123e4567-e89b-12d3-a456-426614174000'; // valid UUID
      const context = makeMockExecutionContext(
        { 'idempotency-key': key },
        { title: 'New Market' },
      );
      const next = {
        handle: () => of({ id: 'market-1', title: 'New Market' }),
      };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'key-record-id' } as any,
      });

      const obs = await interceptor.intercept(context, next);
      await obs.toPromise();

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        key,
        'user-uuid-1',
        expect.any(String),
      );
      expect(idempotencyService.complete).toHaveBeenCalledWith(
        'key-record-id',
        201,
        { id: 'market-1', title: 'New Market' },
      );
    });

    it('should replay saved response and set headers if key is replayed with same body', async () => {
      const key = '123e4567-e89b-12d3-a456-426614174000';
      const context = makeMockExecutionContext(
        { 'idempotency-key': key },
        { title: 'New Market' },
      );
      const next = { handle: () => of({}) };

      const res = context.switchToHttp().getResponse();

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'key-record-id',
          request_hash: 'same-hash-constructed-by-interceptor',
          response_body: { id: 'market-1', title: 'New Market' },
          status_code: 201,
          in_progress: false,
        } as any,
      });

      // Mock hash generation in the test to match what interceptor does
      const spyAcquire = jest
        .spyOn(idempotencyService, 'acquire')
        .mockImplementation(async (k, u, hash) => {
          return {
            acquired: false,
            record: {
              id: 'key-record-id',
              request_hash: hash,
              response_body: { id: 'market-1', title: 'New Market' },
              status_code: 201,
              in_progress: false,
            } as any,
          };
        });

      const resultObservable = await interceptor.intercept(context, next);
      const result = await resultObservable.toPromise();

      expect(result).toEqual({ id: 'market-1', title: 'New Market' });
      expect(res.setHeader).toHaveBeenCalledWith(
        'idempotency-replayed',
        'true',
      );
      expect(res.statusCode).toBe(201);
    });

    it('should reject with 422 UnprocessableEntityException on key collision with different body', async () => {
      const key = '123e4567-e89b-12d3-a456-426614174000';
      const context = makeMockExecutionContext(
        { 'idempotency-key': key },
        { title: 'New Market' },
      );
      const next = { handle: () => of({}) };

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'key-record-id',
          request_hash: 'different-hash',
          in_progress: false,
        } as any,
      });

      await expect(interceptor.intercept(context, next)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Pagination totalPages Envelope Tests
  // -------------------------------------------------------------------------
  describe('list pagination envelopes', () => {
    it('listMarkets return pagination metadata totalPages', async () => {
      marketsService.findAllFiltered.mockResolvedValue({
        data: [{ id: 'market-1' }],
        total: 25,
        page: 1,
        limit: 10,
      } as any);

      const res = await controller.listMarkets({ page: 1, limit: 10 });
      expect(res).toEqual({
        data: [{ id: 'market-1' }],
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      });
    });

    it('getComments return pagination metadata totalPages', async () => {
      marketsService.getComments.mockResolvedValue({
        data: [{ id: 'comment-1' }],
        total: 45,
        page: 2,
        limit: 20,
      } as any);

      const res = await controller.getComments('market-1', {
        page: 2,
        limit: 20,
      });
      expect(res).toEqual({
        data: [{ id: 'comment-1' }],
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });
});
