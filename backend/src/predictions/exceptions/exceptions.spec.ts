import { HttpStatus } from '@nestjs/common';
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
} from './index';

describe('Predictions Domain Exceptions', () => {
  describe('MarketNotFoundException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new MarketNotFoundException('market-123');
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('MARKET_NOT_FOUND');
      expect(response.error.message).toContain('market-123');
      expect(response.error.marketId).toBe('market-123');
    });
  });

  describe('MarketClosedException', () => {
    it('should create exception with correct status and error code', () => {
      const reason = 'Market is closed';
      const exception = new MarketClosedException(reason);
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('MARKET_CLOSED');
      expect(response.error.message).toBe(reason);
    });
  });

  describe('InvalidOutcomeException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new InvalidOutcomeException('Maybe', ['Yes', 'No']);
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('INVALID_OUTCOME');
      expect(response.error.chosenOutcome).toBe('Maybe');
      expect(response.error.validOptions).toEqual(['Yes', 'No']);
      expect(response.error.message).toContain('Maybe');
      expect(response.error.message).toContain('Yes, No');
    });
  });

  describe('DuplicatePredictionException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new DuplicatePredictionException('market-456');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('DUPLICATE_PREDICTION');
      expect(response.error.marketId).toBe('market-456');
      expect(response.error.message).toContain('already submitted');
    });
  });

  describe('PredictionNotFoundException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new PredictionNotFoundException('pred-789');
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('PREDICTION_NOT_FOUND');
      expect(response.error.predictionId).toBe('pred-789');
      expect(response.error.message).toContain('pred-789');
    });
  });

  describe('UnauthorizedPredictionAccessException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new UnauthorizedPredictionAccessException('pred-999');
      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('UNAUTHORIZED_PREDICTION_ACCESS');
      expect(response.error.predictionId).toBe('pred-999');
      expect(response.error.message).toContain('permission');
    });
  });

  describe('PayoutAlreadyClaimedException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new PayoutAlreadyClaimedException('pred-111');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('PAYOUT_ALREADY_CLAIMED');
      expect(response.error.predictionId).toBe('pred-111');
      expect(response.error.message).toContain('already been claimed');
    });
  });

  describe('MarketNotResolvedException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new MarketNotResolvedException('market-222');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('MARKET_NOT_RESOLVED');
      expect(response.error.marketId).toBe('market-222');
      expect(response.error.message).toContain('not yet resolved');
    });
  });

  describe('PredictionNotWonException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new PredictionNotWonException('pred-333');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('PREDICTION_NOT_WON');
      expect(response.error.predictionId).toBe('pred-333');
      expect(response.error.message).toContain('did not win');
    });
  });

  describe('NoClaimableRewardsException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new NoClaimableRewardsException('user-444');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('NO_CLAIMABLE_REWARDS');
      expect(response.error.userId).toBe('user-444');
      expect(response.error.message).toContain('No claimable rewards');
    });
  });

  describe('BatchSizeExceededException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new BatchSizeExceededException(150, 100);
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('BATCH_SIZE_EXCEEDED');
      expect(response.error.actualSize).toBe(150);
      expect(response.error.maxSize).toBe(100);
      expect(response.error.message).toContain('maximum of 100');
    });
  });

  describe('SlippageExceededException', () => {
    it('should create exception with correct status and error code', () => {
      const exception = new SlippageExceededException(
        '3000000',
        '4000000',
        '100',
        '80',
      );
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      const response = exception.getResponse() as any;
      expect(response.error.code).toBe('SLIPPAGE_EXCEEDED');
      expect(response.error.details.expectedPrice).toBe('3000000');
      expect(response.error.details.actualPrice).toBe('4000000');
      expect(response.error.details.expectedShares).toBe('100');
      expect(response.error.details.actualShares).toBe('80');
      expect(response.error.message).toContain('Slippage');
    });
  });

  describe('Exception Response Structure', () => {
    it('should have consistent response structure across all exceptions', () => {
      const exceptions = [
        new MarketNotFoundException('m'),
        new MarketClosedException('closed'),
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
      ];

      exceptions.forEach((exception) => {
        const response = exception.getResponse() as any;
        expect(response).toHaveProperty('success', false);
        expect(response).toHaveProperty('error');
        expect(response.error).toHaveProperty('code');
        expect(response.error).toHaveProperty('statusCode');
        expect(response.error).toHaveProperty('message');
        expect(typeof response.error.code).toBe('string');
        expect(typeof response.error.statusCode).toBe('number');
        expect(typeof response.error.message).toBe('string');
      });
    });

    it('should have unique error codes for different exception types', () => {
      const exceptions = [
        new MarketNotFoundException('m'),
        new MarketClosedException('closed'),
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
      ];

      const codes = exceptions.map(
        (ex) => (ex.getResponse() as any).error.code,
      );
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(exceptions.length);
    });

    it('should map to correct HTTP status codes', () => {
      const statusMappings = [
        {
          exception: new MarketNotFoundException('m'),
          expectedStatus: HttpStatus.NOT_FOUND,
        },
        {
          exception: new PredictionNotFoundException('p'),
          expectedStatus: HttpStatus.NOT_FOUND,
        },
        {
          exception: new UnauthorizedPredictionAccessException('p'),
          expectedStatus: HttpStatus.FORBIDDEN,
        },
        {
          exception: new DuplicatePredictionException('m'),
          expectedStatus: HttpStatus.CONFLICT,
        },
        {
          exception: new PayoutAlreadyClaimedException('p'),
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
          exception: new MarketNotResolvedException('m'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new PredictionNotWonException('p'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new NoClaimableRewardsException('u'),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
        {
          exception: new BatchSizeExceededException(1, 1),
          expectedStatus: HttpStatus.BAD_REQUEST,
        },
      ];

      statusMappings.forEach(({ exception, expectedStatus }) => {
        expect(exception.getStatus()).toBe(expectedStatus);
      });
    });
  });
});
