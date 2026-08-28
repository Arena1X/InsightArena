import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PredictionsExceptionFilter } from './predictions-exception.filter';
import {
  MarketNotFoundException,
  MarketClosedException,
  InvalidOutcomeException,
  DuplicatePredictionException,
  PredictionNotFoundException,
  UnauthorizedPredictionAccessException,
  PayoutAlreadyClaimedException,
  MarketNotResolvedException,
  PredictionNotWonException,
  NoClaimableRewardsException,
  BatchSizeExceededException,
  SlippageExceededException,
} from '../exceptions';
import { ArgumentsHost } from '@nestjs/common';

describe('PredictionsExceptionFilter', () => {
  let filter: PredictionsExceptionFilter;
  let mockResponse: any;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PredictionsExceptionFilter],
    }).compile();

    filter = module.get<PredictionsExceptionFilter>(PredictionsExceptionFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as any;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('Domain Exception Mappings', () => {
    it('should map MarketNotFoundException to 404 with MARKET_NOT_FOUND code', () => {
      const exception = new MarketNotFoundException('market-123');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MARKET_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Market "market-123" not found',
          marketId: 'market-123',
        },
      });
    });

    it('should map MarketClosedException to 400 with MARKET_CLOSED code', () => {
      const exception = new MarketClosedException(
        'Market is closed - predictions are no longer accepted',
      );
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MARKET_CLOSED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Market is closed - predictions are no longer accepted',
        },
      });
    });

    it('should map InvalidOutcomeException to 400 with INVALID_OUTCOME code', () => {
      const exception = new InvalidOutcomeException('Maybe', ['Yes', 'No']);
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_OUTCOME',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid outcome "Maybe". Valid options: Yes, No',
          chosenOutcome: 'Maybe',
          validOptions: ['Yes', 'No'],
        },
      });
    });

    it('should map DuplicatePredictionException to 409 with DUPLICATE_PREDICTION code', () => {
      const exception = new DuplicatePredictionException('market-456');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'DUPLICATE_PREDICTION',
          statusCode: HttpStatus.CONFLICT,
          message: 'You have already submitted a prediction for this market',
          marketId: 'market-456',
        },
      });
    });

    it('should map PredictionNotFoundException to 404 with PREDICTION_NOT_FOUND code', () => {
      const exception = new PredictionNotFoundException('pred-789');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PREDICTION_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Prediction "pred-789" not found',
          predictionId: 'pred-789',
        },
      });
    });

    it('should map UnauthorizedPredictionAccessException to 403 with UNAUTHORIZED_PREDICTION_ACCESS code', () => {
      const exception = new UnauthorizedPredictionAccessException('pred-999');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED_PREDICTION_ACCESS',
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You do not have permission to view this prediction',
          predictionId: 'pred-999',
        },
      });
    });

    it('should map PayoutAlreadyClaimedException to 409 with PAYOUT_ALREADY_CLAIMED code', () => {
      const exception = new PayoutAlreadyClaimedException('pred-111');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PAYOUT_ALREADY_CLAIMED',
          statusCode: HttpStatus.CONFLICT,
          message: 'Payout has already been claimed',
          predictionId: 'pred-111',
        },
      });
    });

    it('should map MarketNotResolvedException to 400 with MARKET_NOT_RESOLVED code', () => {
      const exception = new MarketNotResolvedException('market-222');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MARKET_NOT_RESOLVED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Market is not yet resolved',
          marketId: 'market-222',
        },
      });
    });

    it('should map PredictionNotWonException to 400 with PREDICTION_NOT_WON code', () => {
      const exception = new PredictionNotWonException('pred-333');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PREDICTION_NOT_WON',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'You did not win this prediction',
          predictionId: 'pred-333',
        },
      });
    });

    it('should map NoClaimableRewardsException to 400 with NO_CLAIMABLE_REWARDS code', () => {
      const exception = new NoClaimableRewardsException('user-444');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NO_CLAIMABLE_REWARDS',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'No claimable rewards',
          userId: 'user-444',
        },
      });
    });

    it('should map BatchSizeExceededException to 400 with BATCH_SIZE_EXCEEDED code', () => {
      const exception = new BatchSizeExceededException(150, 100);
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'BATCH_SIZE_EXCEEDED',
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Batch size exceeds the maximum of 100 predictions',
          actualSize: 150,
          maxSize: 100,
        },
      });
    });

    it('should map SlippageExceededException to 409 with SLIPPAGE_EXCEEDED code', () => {
      const exception = new SlippageExceededException(
        '3000000',
        '4000000',
        '100',
        '80',
      );
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SLIPPAGE_EXCEEDED',
          statusCode: HttpStatus.CONFLICT,
          message: 'Slippage tolerance exceeded',
          details: {
            expectedPrice: '3000000',
            actualPrice: '4000000',
            expectedShares: '100',
            actualShares: '80',
          },
        },
      });
    });
  });

  describe('Unexpected Errors', () => {
    it('should map unexpected errors to 500 with INTERNAL_SERVER_ERROR code', () => {
      const exception = new Error('Unexpected database error');
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred',
        },
      });
    });

    it('should handle non-Error exceptions gracefully', () => {
      const exception = 'Some string error';
      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred',
        },
      });
    });
  });

  describe('HTTP Status Code Mappings', () => {
    it('should return correct status codes for each exception type', () => {
      const testCases = [
        {
          exception: new MarketNotFoundException('m1'),
          expectedStatus: HttpStatus.NOT_FOUND,
        },
        {
          exception: new PredictionNotFoundException('p1'),
          expectedStatus: HttpStatus.NOT_FOUND,
        },
        {
          exception: new UnauthorizedPredictionAccessException('p2'),
          expectedStatus: HttpStatus.FORBIDDEN,
        },
        {
          exception: new DuplicatePredictionException('m2'),
          expectedStatus: HttpStatus.CONFLICT,
        },
        {
          exception: new PayoutAlreadyClaimedException('p3'),
          expectedStatus: HttpStatus.CONFLICT,
        },
        {
          exception: new SlippageExceededException('0', '0', '0', '0'),
          expectedStatus: HttpStatus.CONFLICT,
        },
        {
          exception: new MarketClosedException('closed'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new InvalidOutcomeException('x', ['y']),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new MarketNotResolvedException('m3'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new PredictionNotWonException('p4'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new NoClaimableRewardsException('u1'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new BatchSizeExceededException(1, 1),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
      ];

      testCases.forEach(({ exception, expectedStatus }) => {
        mockResponse.status.mockClear();
        mockResponse.json.mockClear();
        filter.catch(exception, mockArgumentsHost);
        expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
      });
    });
  });

  describe('Error Code Stability', () => {
    it('should always return the same error code for the same exception type', () => {
      const exception1 = new MarketNotFoundException('market-1');
      const exception2 = new MarketNotFoundException('market-2');

      filter.catch(exception1, mockArgumentsHost);
      const call1 = mockResponse.json.mock.calls[0][0];

      mockResponse.json.mockClear();

      filter.catch(exception2, mockArgumentsHost);
      const call2 = mockResponse.json.mock.calls[0][0];

      expect(call1.error.code).toBe(call2.error.code);
      expect(call1.error.code).toBe('MARKET_NOT_FOUND');
    });

    it('should include stable error codes in all responses', () => {
      const exceptions = [
        new MarketNotFoundException('m'),
        new InvalidOutcomeException('x', ['y']),
        new DuplicatePredictionException('m'),
        new PredictionNotFoundException('p'),
        new UnauthorizedPredictionAccessException('p'),
        new PayoutAlreadyClaimedException('p'),
        new MarketNotResolvedException('m'),
        new PredictionNotWonException('p'),
        new NoClaimableRewardsException('u'),
        new BatchSizeExceededException(1, 1),
        new SlippageExceededException('0', '0', '0', '0'),
        new MarketClosedException('closed'),
      ];

      exceptions.forEach((exception) => {
        mockResponse.json.mockClear();
        filter.catch(exception, mockArgumentsHost);
        const response = mockResponse.json.mock.calls[0][0];

        expect(response.error.code).toBeDefined();
        expect(typeof response.error.code).toBe('string');
        expect(response.error.code.length).toBeGreaterThan(0);
      });
    });
  });
});
