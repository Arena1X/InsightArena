import { ContractPrediction } from '../../contract/contract.service';

export interface NormalizedPrediction {
  predictionId: string;
  matchId: string;
  predictedOutcome: string;
  predictedAt: number;
  isCorrect: boolean | null;
  isWithdrawn: boolean;
}

export function normalizeContractPrediction(
  prediction: ContractPrediction,
): NormalizedPrediction {
  const raw = prediction as ContractPrediction & Record<string, unknown>;

  const normalizeString = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return fallback;
  };

  const predictionId = normalizeString(
    raw.predictionId ?? raw.prediction_id ?? raw.id,
  );
  const matchId = normalizeString(raw.matchId ?? raw.match_id);
  const predictedOutcome = normalizeString(
    raw.chosenOutcome ?? raw.predictedOutcome ?? raw.predicted_outcome,
  );
  const predictedAt = Number(raw.predictedAt ?? raw.predicted_at ?? 0);
  const isCorrectRaw = raw.isCorrect ?? raw.is_correct;

  let isCorrect: boolean | null = null;
  if (isCorrectRaw === true || isCorrectRaw === false) {
    isCorrect = isCorrectRaw;
  }

  const isWithdrawn = (raw.isWithdrawn ?? raw.is_withdrawn) === true;

  return {
    predictionId,
    matchId,
    predictedOutcome,
    predictedAt,
    isCorrect,
    isWithdrawn,
  };
}

export function resolveCorrectness(
  normalized: NormalizedPrediction,
  matchResolved: boolean,
  matchOutcome: string | null,
): boolean | null {
  if (normalized.isCorrect !== null) {
    return normalized.isCorrect;
  }

  if (!matchResolved || !matchOutcome) {
    return null;
  }

  return matchOutcome === normalized.predictedOutcome;
}
