import {
  normalizeContractPrediction,
  resolveCorrectness,
} from './prediction.util';
import { ContractPrediction } from '../../contract/contract.service';

describe('prediction.util', () => {
  describe('normalizeContractPrediction', () => {
    it('normalizes snake_case contract fields', () => {
      const result = normalizeContractPrediction({
        prediction_id: 42,
        match_id: 7,
        predicted_outcome: 'TEAM_A',
        predicted_at: 1_700_000_000,
        is_correct: true,
      } as ContractPrediction);

      expect(result).toEqual({
        predictionId: '42',
        matchId: '7',
        predictedOutcome: 'TEAM_A',
        predictedAt: 1_700_000_000,
        isCorrect: true,
        isWithdrawn: false,
      });
    });

    it('normalizes camelCase contract fields', () => {
      const result = normalizeContractPrediction({
        predictionId: 'pred-1',
        matchId: 'match-1',
        chosenOutcome: 'DRAW',
        predictedAt: 1_800_000_000,
      });

      expect(result.predictedOutcome).toBe('DRAW');
      expect(result.isCorrect).toBeNull();
      expect(result.isWithdrawn).toBe(false);
    });

    it('normalizes a withdrawn prediction from either field casing', () => {
      const snakeCase = normalizeContractPrediction({
        prediction_id: 1,
        match_id: 1,
        is_withdrawn: true,
      } as ContractPrediction);
      const camelCase = normalizeContractPrediction({
        predictionId: '1',
        matchId: '1',
        isWithdrawn: true,
      });

      expect(snakeCase.isWithdrawn).toBe(true);
      expect(camelCase.isWithdrawn).toBe(true);
    });
  });

  describe('resolveCorrectness', () => {
    it('returns stored isCorrect when available', () => {
      const normalized = normalizeContractPrediction({
        is_correct: false,
        predicted_outcome: 'TEAM_A',
        match_id: 1,
        prediction_id: 1,
      } as ContractPrediction);

      expect(resolveCorrectness(normalized, true, 'TEAM_B')).toBe(false);
    });

    it('returns null for unresolved matches', () => {
      const normalized = normalizeContractPrediction({
        predicted_outcome: 'TEAM_A',
        match_id: 1,
        prediction_id: 1,
      } as ContractPrediction);

      expect(resolveCorrectness(normalized, false, null)).toBeNull();
    });

    it('compares outcome for resolved matches', () => {
      const normalized = normalizeContractPrediction({
        predicted_outcome: 'TEAM_B',
        match_id: 1,
        prediction_id: 1,
      } as ContractPrediction);

      expect(resolveCorrectness(normalized, true, 'TEAM_B')).toBe(true);
      expect(resolveCorrectness(normalized, true, 'TEAM_A')).toBe(false);
    });
  });
});
