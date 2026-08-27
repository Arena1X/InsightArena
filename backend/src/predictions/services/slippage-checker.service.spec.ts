import { SlippageCheckerService } from './slippage-checker.service';
import { SlippageExceededException } from '../exceptions/slippage-exceeded.exception';

describe('SlippageCheckerService', () => {
  let service: SlippageCheckerService;

  beforeEach(() => {
    service = new SlippageCheckerService();
  });

  describe('checkSlippage', () => {
    it('should pass when no slippage bounds are set', () => {
      expect(() => {
        service.checkSlippage(undefined, undefined, '5000000', '2000000');
      }).not.toThrow();
    });

    it('should pass when price is within maxPrice bound', () => {
      expect(() => {
        service.checkSlippage('6000000', undefined, '5000000', '2000000');
      }).not.toThrow();
    });

    it('should pass when price exactly matches maxPrice', () => {
      expect(() => {
        service.checkSlippage('5000000', undefined, '5000000', '2000000');
      }).not.toThrow();
    });

    it('should reject when price exceeds maxPrice', () => {
      expect(() => {
        service.checkSlippage('5000000', undefined, '5000001', '2000000');
      }).toThrow(SlippageExceededException);
    });

    it('should pass when shares are above minSharesOut bound', () => {
      expect(() => {
        service.checkSlippage(undefined, '2000000', '5000000', '2000001');
      }).not.toThrow();
    });

    it('should pass when shares exactly match minSharesOut', () => {
      expect(() => {
        service.checkSlippage(undefined, '2000000', '5000000', '2000000');
      }).not.toThrow();
    });

    it('should reject when shares fall below minSharesOut', () => {
      expect(() => {
        service.checkSlippage(undefined, '2000000', '5000000', '1999999');
      }).toThrow(SlippageExceededException);
    });

    it('should check both price and shares bounds together', () => {
      expect(() => {
        service.checkSlippage('6000000', '1500000', '5000000', '1600000');
      }).not.toThrow();
    });

    it('should reject on price violation when checking both bounds', () => {
      expect(() => {
        service.checkSlippage('4000000', '1500000', '5000000', '1600000');
      }).toThrow(SlippageExceededException);
    });

    it('should reject on shares violation when checking both bounds', () => {
      expect(() => {
        service.checkSlippage('6000000', '1600000', '5000000', '1500000');
      }).toThrow(SlippageExceededException);
    });

    it('should include details in exception for price violation', () => {
      try {
        service.checkSlippage('5000000', undefined, '5000001', '2000000');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SlippageExceededException);
        expect(error.actualPrice).toBe('5000001');
        expect(error.expectedPrice).toBe('5000000');
      }
    });

    it('should include details in exception for shares violation', () => {
      try {
        service.checkSlippage(undefined, '2000000', '5000000', '1999999');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SlippageExceededException);
        expect(error.actualShares).toBe('1999999');
        expect(error.expectedShares).toBe('2000000');
      }
    });
  });
});
