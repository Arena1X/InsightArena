/**
 * Shared validation utilities for forms.
 *
 * Two categories:
 *  - `validators`      — synchronous, return `string | undefined`
 *  - `asyncValidators` — asynchronous, receive an AbortSignal, return
 *                        `Promise<string | undefined>`
 */

import type { AsyncValidatorFn, ValidatorFn } from "@/hooks/useFormValidation";

// ---------------------------------------------------------------------------
// Sync validators
// ---------------------------------------------------------------------------

export const validators = {
  /**
   * Required field validator.
   */
  required:
    (fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (!value || (typeof value === "string" && !value.trim())) {
        return `${fieldName} is required.`;
      }
      return undefined;
    },

  /**
   * Minimum length validator.
   */
  minLength:
    (min: number, fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (!value) return undefined;
      if (String(value).length < min) {
        return `${fieldName} must be at least ${min} characters.`;
      }
      return undefined;
    },

  /**
   * Maximum length validator.
   */
  maxLength:
    (max: number, fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (!value) return undefined;
      if (String(value).length > max) {
        return `${fieldName} must be at most ${max} characters.`;
      }
      return undefined;
    },

  /**
   * Email format validator. Can be used directly (not a factory).
   */
  email: (value: any): string | undefined => {
    if (!value) return undefined;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) {
      return "Please enter a valid email address.";
    }
    return undefined;
  },

  /**
   * Numeric value validator.
   */
  number:
    (fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (value === "" || value === null || value === undefined) return undefined;
      if (isNaN(Number(value))) {
        return `${fieldName} must be a valid number.`;
      }
      return undefined;
    },

  /**
   * Minimum numeric value validator.
   */
  minValue:
    (min: number, fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (value === "" || value === null || value === undefined) return undefined;
      const num = Number(value);
      if (isNaN(num) || num < min) {
        return `${fieldName} must be at least ${min}.`;
      }
      return undefined;
    },

  /**
   * Maximum numeric value validator.
   */
  maxValue:
    (max: number, fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (value === "" || value === null || value === undefined) return undefined;
      const num = Number(value);
      if (isNaN(num) || num > max) {
        return `${fieldName} must be at most ${max}.`;
      }
      return undefined;
    },

  /**
   * Regex pattern validator.
   */
  pattern:
    (regex: RegExp, fieldName = "This field"): ValidatorFn =>
    (value: any): string | undefined => {
      if (!value) return undefined;
      if (!regex.test(String(value))) {
        return `${fieldName} format is invalid.`;
      }
      return undefined;
    },

  /**
   * Identity wrapper — pass through a custom validator function as-is.
   */
  custom: (fn: ValidatorFn): ValidatorFn => fn,

  /**
   * Run multiple validators in order; return the first error encountered.
   */
  compose:
    (...validatorFns: ValidatorFn[]): ValidatorFn =>
    (value: any): string | undefined => {
      for (const validator of validatorFns) {
        const error = validator(value);
        if (error) return error;
      }
      return undefined;
    },
} as const;

// ---------------------------------------------------------------------------
// Async validators
// ---------------------------------------------------------------------------

export const asyncValidators = {
  /**
   * Checks uniqueness by calling a provided async lookup function.
   *
   * The lookup receives the current value and must resolve to `true` when the
   * value is already taken. It also receives the AbortSignal so it can cancel
   * an underlying fetch if the validation is superseded.
   *
   * @example
   * asyncValidators.unique(
   *   (name, signal) => checkEventNameTaken(name, signal),
   *   "Event name"
   * )
   */
  unique:
    (
      lookupFn: (value: any, signal: AbortSignal) => Promise<boolean>,
      fieldName = "This value"
    ): AsyncValidatorFn =>
    async (value: any, signal: AbortSignal): Promise<string | undefined> => {
      if (!value && value !== 0) return undefined;
      const isTaken = await lookupFn(value, signal);
      if (signal.aborted) return undefined;
      return isTaken ? `${fieldName} is already taken.` : undefined;
    },

  /**
   * Wraps any async check function as a validator.
   *
   * `checkFn` should resolve to an error string when invalid, or `undefined`
   * when valid. The AbortSignal is forwarded so network requests can be
   * cancelled.
   *
   * @example
   * asyncValidators.custom(async (value, signal) => {
   *   const ok = await verifyCode(value, signal);
   *   return ok ? undefined : "Invalid verification code.";
   * })
   */
  custom:
    (checkFn: AsyncValidatorFn): AsyncValidatorFn =>
    (value: any, signal: AbortSignal) =>
      checkFn(value, signal),

  /**
   * Compose multiple async validators, running them in series.
   * Stops and returns the first error encountered.
   *
   * Sync validators can be mixed in by wrapping them with `asyncValidators.fromSync`.
   */
  compose:
    (...fns: AsyncValidatorFn[]): AsyncValidatorFn =>
    async (value: any, signal: AbortSignal): Promise<string | undefined> => {
      for (const fn of fns) {
        if (signal.aborted) return undefined;
        const error = await fn(value, signal);
        if (error) return error;
      }
      return undefined;
    },

  /**
   * Lift a synchronous validator into an async validator so it can be used
   * inside `asyncValidators.compose` or directly in `asyncValidators` config.
   *
   * @example
   * asyncValidators.fromSync(validators.required("Username"))
   */
  fromSync:
    (syncFn: ValidatorFn): AsyncValidatorFn =>
    async (value: any, _signal: AbortSignal): Promise<string | undefined> =>
      syncFn(value),
} as const;

// ---------------------------------------------------------------------------
// Market outcome list validator (#1583)
// ---------------------------------------------------------------------------

const MIN_MARKET_OUTCOMES = 2;
const MAX_MARKET_OUTCOMES = 10;

/**
 * Validates a market's outcome list: rejects empty/whitespace-only labels,
 * enforces the 2–10 count bounds, and rejects case-insensitive duplicates
 * (after trimming).
 */
export function validateOutcomes(outcomes: string[]): string | undefined {
  if (outcomes.some((o) => !o.trim())) {
    return "Outcomes cannot be empty.";
  }
  if (outcomes.length < MIN_MARKET_OUTCOMES) {
    return `Add at least ${MIN_MARKET_OUTCOMES} outcomes.`;
  }
  if (outcomes.length > MAX_MARKET_OUTCOMES) {
    return `You can add up to ${MAX_MARKET_OUTCOMES} outcomes.`;
  }
  const normalized = outcomes.map((o) => o.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return "Outcomes must be distinct.";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Creator-event match validators (#1548)
// ---------------------------------------------------------------------------

export type BulkMatchRowInput = {
  teamA: string;
  teamB: string;
  matchTime: string;
};

export type BulkMatchRowResult = BulkMatchRowInput & {
  errors: string[];
};

const MAX_TEAM_NAME = 100;

export function validateTeamName(
  value: string,
  fieldName: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldName} is required.`;
  if (trimmed.length > MAX_TEAM_NAME) {
    return `${fieldName} must be ${MAX_TEAM_NAME} characters or fewer.`;
  }
  return undefined;
}

export function validateDistinctTeams(
  teamA: string,
  teamB: string,
): string | undefined {
  const a = teamA.trim();
  const b = teamB.trim();
  if (a && b && a.toLowerCase() === b.toLowerCase()) {
    return "Team names must be different.";
  }
  return undefined;
}

export function validateKickoffTime(
  matchTime: string,
  now = new Date(),
): string | undefined {
  if (!matchTime.trim()) return "Kickoff time is required.";
  const dt = new Date(matchTime);
  if (Number.isNaN(dt.getTime())) return "Kickoff time is invalid.";
  if (dt <= now) return "Kickoff must be in the future.";
  return undefined;
}

export function validateBulkMatchRow(
  row: BulkMatchRowInput,
  now = new Date(),
): string[] {
  const errors: string[] = [];
  const teamAError = validateTeamName(row.teamA, "Team A");
  const teamBError = validateTeamName(row.teamB, "Team B");
  const distinctError = validateDistinctTeams(row.teamA, row.teamB);
  const kickoffError = validateKickoffTime(row.matchTime, now);

  if (teamAError) errors.push(teamAError);
  if (teamBError) errors.push(teamBError);
  if (distinctError) errors.push(distinctError);
  if (kickoffError) errors.push(kickoffError);
  return errors;
}

export function parseBulkMatchCsv(raw: string): BulkMatchRowInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const firstCols = lines[0].split(",").map((col) => col.trim().toLowerCase());
  const hasHeader =
    firstCols[0]?.includes("team") && firstCols[1]?.includes("team");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cols = line.split(",").map((col) => col.trim());
    return {
      teamA: cols[0] ?? "",
      teamB: cols[1] ?? "",
      matchTime: cols[2] ?? "",
    };
  });
}

export function validateBulkMatchRows(
  rows: BulkMatchRowInput[],
  now = new Date(),
): BulkMatchRowResult[] {
  const seen = new Set<string>();

  return rows.map((row) => {
    const errors = validateBulkMatchRow(row, now);
    const key = [
      row.teamA.trim().toLowerCase(),
      row.teamB.trim().toLowerCase(),
      row.matchTime.trim(),
    ].join("|");
    const isIdentified = row.teamA.trim() && row.teamB.trim() && row.matchTime.trim();

    if (isIdentified) {
      if (seen.has(key)) {
        errors.push("Duplicate match.");
      } else {
        seen.add(key);
      }
    }

    return { ...row, errors };
  });
}
