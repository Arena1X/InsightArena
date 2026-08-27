import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldValidation {
  value: string | number | boolean;
  touched: boolean;
  error?: string;
  /** True while an async validator is in-flight for this field. */
  pending: boolean;
}

export interface FormValidationState {
  [fieldName: string]: FieldValidation;
}

/** Synchronous validator — returns an error string or undefined. */
export type ValidatorFn = (value: any) => string | undefined;

/**
 * Async validator — receives the current value and an AbortSignal so callers
 * can cancel in-flight network requests when a newer validation supersedes this
 * one. Should return a Promise that resolves to an error string or undefined.
 * Throw / reject if the request itself failed (the hook will silently ignore
 * aborted requests).
 */
export type AsyncValidatorFn = (
  value: any,
  signal: AbortSignal
) => Promise<string | undefined>;

export interface FieldValidator {
  [fieldName: string]: ValidatorFn[];
}

export interface AsyncFieldValidator {
  [fieldName: string]: AsyncValidatorFn[];
}

// ---------------------------------------------------------------------------
// Options & return shape
// ---------------------------------------------------------------------------

interface UseFormValidationOptions {
  initialValues?: Record<string, any>;
  validators?: FieldValidator;
  /** Async validators keyed by field name. Run after all sync validators pass. */
  asyncValidators?: AsyncFieldValidator;
  validateOnBlur?: boolean;
  /**
   * Debounce delay in ms before async validators fire after a value change.
   * Defaults to 300 ms.
   */
  asyncDebounceMs?: number;
}

interface UseFormValidationReturn {
  values: Record<string, any>;
  touched: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  /** True when any async validator for a field is in-flight. */
  pending: Record<string, boolean>;
  setState: (field: string, value: any) => void;
  setTouched: (field: string, touched: boolean) => void;
  setFieldError: (field: string, error?: string) => void;
  clearFieldError: (field: string) => void;
  clearErrors: () => void;
  /** Runs sync validators for the field. Returns true if all pass. */
  validateField: (field: string) => boolean;
  /**
   * Runs async validators for the field after sync validators pass.
   * Returns a Promise that resolves to true when the field is valid.
   */
  validateFieldAsync: (field: string) => Promise<boolean>;
  /** Runs sync validators for all fields. Returns true if all pass. */
  validateAll: () => boolean;
  /**
   * Runs sync then async validators for all fields.
   * Resolves to true only when every field is valid.
   */
  validateAllAsync: () => Promise<boolean>;
  reset: () => void;
  /** True when no field has a sync error and no async validation is pending. */
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFormValidation({
  initialValues = {},
  validators = {},
  asyncValidators = {},
  validateOnBlur = true,
  asyncDebounceMs = 300,
}: UseFormValidationOptions): UseFormValidationReturn {
  const [formState, setFormState] = useState<FormValidationState>(() => {
    const initial: FormValidationState = {};
    for (const [key, value] of Object.entries(initialValues)) {
      initial[key] = { value, touched: false, error: undefined, pending: false };
    }
    return initial;
  });

  // Always-current mirror of formState for use in callbacks that close over
  // stale state (e.g. async validators that run after a re-render).
  const formStateRef = useRef<FormValidationState>(formState);
  useEffect(() => {
    formStateRef.current = formState;
  });

  // Eagerly-updated per-field value cache so callers like validateFieldAsync
  // always see the value from the most recent setState call, even when React
  // has not yet committed the next render (i.e. within the same act() block).
  const latestValues = useRef<Record<string, any>>({});
  for (const [k, v] of Object.entries(initialValues)) {
    if (!(k in latestValues.current)) latestValues.current[k] = v;
  }

  // Refs for debounce timers per field (keyed by field name).
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  // Refs for AbortControllers per field so we can cancel in-flight async work.
  const abortControllers = useRef<Record<string, AbortController>>({});

  // ---------------------------------------------------------------------------
  // Sync helpers
  // ---------------------------------------------------------------------------

  const setState = useCallback((field: string, value: any) => {
    setFormState((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        value,
      },
    }));
  }, []);

  const setFieldError = useCallback((field: string, error?: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: { ...prev[field], error },
    }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: { ...prev[field], error: undefined },
    }));
  }, []);

  const clearErrors = useCallback(() => {
    setFormState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], error: undefined };
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Sync validation
  // ---------------------------------------------------------------------------

  const validateField = useCallback(
    (field: string): boolean => {
      const fieldValidators = validators[field] ?? [];
      // Read from latestValues so this always sees the most recent value even
      // if called synchronously after setState in the same act() block.
      const value = latestValues.current[field] ?? formState[field]?.value;

      for (const validator of fieldValidators) {
        const error = validator(value);
        if (error) {
          setFormState((prev) => ({
            ...prev,
            [field]: { ...prev[field], error },
          }));
          return false;
        }
      }

      setFormState((prev) => ({
        ...prev,
        [field]: { ...prev[field], error: undefined },
      }));
      return true;
    },
    [validators, formState]
  );

  const validateAll = useCallback((): boolean => {
    let allValid = true;
    for (const field of Object.keys(validators)) {
      if (!validateField(field)) allValid = false;
    }
    return allValid;
  }, [validators, validateField]);

  // ---------------------------------------------------------------------------
  // Async validation (with cancellation + debouncing)
  // ---------------------------------------------------------------------------

  /**
   * Internal: run async validators for a single field immediately (no debounce).
   * Cancels any previous in-flight call for the same field via AbortController.
   */
  const _runAsyncValidators = useCallback(
    async (field: string, value: any): Promise<boolean> => {
      const fieldAsyncValidators = asyncValidators[field];
      if (!fieldAsyncValidators?.length) return true;

      // Cancel previous in-flight request for this field.
      abortControllers.current[field]?.abort();
      const controller = new AbortController();
      abortControllers.current[field] = controller;
      const { signal } = controller;

      // Mark field as pending.
      setFormState((prev) => ({
        ...prev,
        [field]: { ...prev[field], pending: true },
      }));

      try {
        for (const asyncValidator of fieldAsyncValidators) {
          const error = await asyncValidator(value, signal);
          if (signal.aborted) return false; // superseded — don't touch state
          if (error) {
            setFormState((prev) => ({
              ...prev,
              [field]: { ...prev[field], error, pending: false },
            }));
            return false;
          }
        }

        // All async validators passed.
        setFormState((prev) => ({
          ...prev,
          [field]: { ...prev[field], error: undefined, pending: false },
        }));
        return true;
      } catch (err) {
        // Ignore aborted-request errors silently.
        if (signal.aborted) return false;
        // Re-surface unexpected errors as a field error.
        const message =
          err instanceof Error ? err.message : "Validation failed";
        setFormState((prev) => ({
          ...prev,
          [field]: { ...prev[field], error: message, pending: false },
        }));
        return false;
      }
    },
    [asyncValidators]
  );

  /**
   * Public: run sync then async validators for one field.
   * The async part is NOT debounced here (use validateFieldDebounced for
   * onChange scenarios). This is intended for onBlur / explicit submit checks.
   */
  const validateFieldAsync = useCallback(
    async (field: string): Promise<boolean> => {
      if (debounceTimers.current[field] !== undefined) {
        clearTimeout(debounceTimers.current[field]);
        delete debounceTimers.current[field];
      }

      if (!validateField(field)) return false;
      // latestValues gives us the value written in the most recent setState
      // even before React commits the next render.
      const value = latestValues.current[field] ?? formState[field]?.value;
      return _runAsyncValidators(field, value);
    },
    [validateField, formState, _runAsyncValidators]
  );

  /**
   * Public: run sync then async validators for ALL fields.
   * Runs all fields concurrently once sync passes.
   */
  const validateAllAsync = useCallback(async (): Promise<boolean> => {
    for (const timer of Object.values(debounceTimers.current)) {
      clearTimeout(timer);
    }
    debounceTimers.current = {};

    if (!validateAll()) return false;

    const results = await Promise.all(
      Object.keys({ ...validators, ...asyncValidators }).map((field) => {
        const value = latestValues.current[field] ?? formState[field]?.value;
        return _runAsyncValidators(field, value);
      })
    );
    return results.every(Boolean);
  }, [validateAll, validators, asyncValidators, formState, _runAsyncValidators]);

  // ---------------------------------------------------------------------------
  // setTouched — triggers validation (sync + debounced async) on blur
  // ---------------------------------------------------------------------------

  const setTouched = useCallback(
    (field: string, touched: boolean) => {
      setFormState((prev) => ({
        ...prev,
        [field]: { ...prev[field], touched },
      }));

      if (validateOnBlur && touched) {
        const syncPassed = validateField(field);
        if (syncPassed && asyncValidators[field]?.length) {
          const value = latestValues.current[field] ?? formState[field]?.value;
          _runAsyncValidators(field, value);
        }
      }
    },
    [validateOnBlur, validateField, asyncValidators, formState, _runAsyncValidators]
  );

  // ---------------------------------------------------------------------------
  // setState variant that also triggers debounced async validation
  // ---------------------------------------------------------------------------

  /**
   * Override setState to additionally schedule a debounced async validation
   * whenever the field has async validators configured.
   */
  const setStateWithAsyncValidation = useCallback(
    (field: string, value: any) => {
      // Eagerly update the value cache so subsequent reads in the same
      // synchronous call stack see the latest value.
      latestValues.current[field] = value;

      // Update value in state.
      setFormState((prev) => ({
        ...prev,
        [field]: { ...prev[field], value },
      }));

      if (!asyncValidators[field]?.length) return;

      // Cancel any existing debounce timer for this field.
      if (debounceTimers.current[field] !== undefined) {
        clearTimeout(debounceTimers.current[field]);
      }

      // Also abort the previous in-flight async call immediately so it doesn't
      // resolve into stale state while the debounce is counting down.
      abortControllers.current[field]?.abort();

      // Clear pending state while debounce is counting down.
      setFormState((prev) => ({
        ...prev,
        [field]: { ...prev[field], pending: false },
      }));

      // Schedule async validators after the debounce delay.
      debounceTimers.current[field] = setTimeout(() => {
        delete debounceTimers.current[field];

        // Run sync validators first; only proceed to async if sync passes.
        const fieldValidators = validators[field] ?? [];
        let syncError: string | undefined;
        for (const validator of fieldValidators) {
          const err = validator(value);
          if (err) {
            syncError = err;
            break;
          }
        }

        if (syncError) {
          setFormState((prev) => ({
            ...prev,
            [field]: { ...prev[field], error: syncError, pending: false },
          }));
          return;
        }

        // Sync is clean — run async.
        _runAsyncValidators(field, value);
      }, asyncDebounceMs);
    },
    [asyncValidators, validators, asyncDebounceMs, _runAsyncValidators]
  );

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    for (const controller of Object.values(abortControllers.current)) {
      controller.abort();
    }
    abortControllers.current = {};

    for (const timer of Object.values(debounceTimers.current)) {
      clearTimeout(timer);
    }
    debounceTimers.current = {};

    // Reset the eager value cache to initial values.
    latestValues.current = { ...initialValues };

    setFormState((prev) => {
      const next: FormValidationState = {};
      for (const key of Object.keys(prev)) {
        next[key] = {
          value: initialValues[key] ?? "",
          touched: false,
          error: undefined,
          pending: false,
        };
      }
      return next;
    });
  }, [initialValues]);

  // ---------------------------------------------------------------------------
  // Derived memos
  // ---------------------------------------------------------------------------

  const values = useMemo(() => {
    const vals: Record<string, any> = {};
    for (const [key, state] of Object.entries(formState)) {
      vals[key] = state.value;
    }
    return vals;
  }, [formState]);

  const touched = useMemo(() => {
    const t: Record<string, boolean> = {};
    for (const [key, state] of Object.entries(formState)) {
      t[key] = state.touched;
    }
    return t;
  }, [formState]);

  const errors = useMemo(() => {
    const e: Record<string, string | undefined> = {};
    for (const [key, state] of Object.entries(formState)) {
      e[key] = state.error;
    }
    return e;
  }, [formState]);

  const pending = useMemo(() => {
    const p: Record<string, boolean> = {};
    for (const [key, state] of Object.entries(formState)) {
      p[key] = state.pending ?? false;
    }
    return p;
  }, [formState]);

  const isValid = useMemo(() => {
    return Object.values(formState).every(
      (state) => !state.error && !state.pending
    );
  }, [formState]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    values,
    touched,
    errors,
    pending,
    setState: setStateWithAsyncValidation,
    setTouched,
    setFieldError,
    clearFieldError,
    clearErrors,
    validateField,
    validateFieldAsync,
    validateAll,
    validateAllAsync,
    reset,
    isValid,
  };
}
