import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormValidation } from "./useFormValidation";
import type { AsyncValidatorFn, ValidatorFn } from "./useFormValidation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves after `ms` milliseconds.
 * With ms=0 we use a real microtask (queueMicrotask) so it settles even under
 * fake timers without needing to advance the clock.
 * With ms>0 we use setTimeout so fake-timer advancement controls it.
 */
function delay(ms: number): Promise<void> {
  if (ms === 0) {
    return new Promise<void>((resolve) => queueMicrotask(resolve));
  }
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Builds a sync required validator for test use. */
const required =
  (fieldName = "Field"): ValidatorFn =>
  (value: any) =>
    !value || String(value).trim() === ""
      ? `${fieldName} is required.`
      : undefined;

/**
 * Async validator that resolves to an error when value equals `takenValue`.
 * resolveAfterMs=0 → settles in the microtask queue (no fake-timer needed).
 * resolveAfterMs>0 → uses setTimeout so vi.advanceTimersByTime controls it.
 */
function makeTakenCheck(
  takenValue: string,
  errorMsg = "Already taken.",
  resolveAfterMs = 0
): AsyncValidatorFn {
  return async (value: any, signal: AbortSignal) => {
    await delay(resolveAfterMs);
    if (signal.aborted) return undefined;
    return value === takenValue ? errorMsg : undefined;
  };
}

/** Async validator that rejects (simulates a network error). */
function makeFailingAsyncValidator(resolveAfterMs = 0): AsyncValidatorFn {
  return async (_value: any, signal: AbortSignal) => {
    await delay(resolveAfterMs);
    if (signal.aborted) return undefined;
    throw new Error("Network error");
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useFormValidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Flush all pending timers so nothing leaks into the next test.
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Existing sync behaviour (regression guard)
  // -------------------------------------------------------------------------

  describe("sync validation (regression)", () => {
    it("initialises with the provided values and no errors", () => {
      const { result } = renderHook(() =>
        useFormValidation({ initialValues: { name: "Alice" } })
      );
      expect(result.current.values.name).toBe("Alice");
      expect(result.current.errors.name).toBeUndefined();
      expect(result.current.pending.name).toBe(false);
    });

    it("validateField returns false and sets error when a sync rule fails", () => {
      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          validators: { name: [required("Name")] },
        })
      );

      let valid: boolean;
      act(() => {
        valid = result.current.validateField("name");
      });

      expect(valid!).toBe(false);
      expect(result.current.errors.name).toBe("Name is required.");
    });

    it("validateField returns true and clears error when all sync rules pass", () => {
      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "Alice" },
          validators: { name: [required("Name")] },
        })
      );

      let valid: boolean;
      act(() => {
        valid = result.current.validateField("name");
      });

      expect(valid!).toBe(true);
      expect(result.current.errors.name).toBeUndefined();
    });

    it("validateAll returns false when any field fails sync validation", () => {
      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "", email: "alice@example.com" },
          validators: {
            name: [required("Name")],
            email: [required("Email")],
          },
        })
      );

      let valid: boolean;
      act(() => {
        valid = result.current.validateAll();
      });

      expect(valid!).toBe(false);
      expect(result.current.errors.name).toBe("Name is required.");
      expect(result.current.errors.email).toBeUndefined();
    });

    it("reset restores initial values and clears errors", () => {
      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          validators: { name: [required("Name")] },
        })
      );

      act(() => {
        result.current.setState("name", "Alice");
        result.current.validateField("name");
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.values.name).toBe("");
      expect(result.current.errors.name).toBeUndefined();
      expect(result.current.pending.name).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Async validator resolves → field state updates correctly
  // -------------------------------------------------------------------------

  describe("async validator resolves", () => {
    it("sets pending=true while async validator is in-flight", async () => {
      // resolveAfterMs=100 → needs timer advancement to complete.
      const asyncValidator = makeTakenCheck("taken", "Already taken.", 100);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "taken" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      let promise: Promise<boolean>;
      act(() => {
        promise = result.current.validateFieldAsync("name");
      });

      // Before the 100 ms async work completes the field should be pending.
      expect(result.current.pending.name).toBe(true);
      expect(result.current.errors.name).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
        await promise!;
      });

      expect(result.current.pending.name).toBe(false);
      expect(result.current.errors.name).toBe("Already taken.");
    });

    it("sets error when async validator resolves with an error message", async () => {
      // resolveAfterMs=0 → settles via microtask, no timer needed.
      const asyncValidator = makeTakenCheck("taken");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "taken" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      await act(async () => {
        await result.current.validateFieldAsync("name");
      });

      expect(result.current.errors.name).toBe("Already taken.");
      expect(result.current.pending.name).toBe(false);
    });

    it("clears error when async validator resolves valid", async () => {
      const asyncValidator = makeTakenCheck("taken");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "available" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      await act(async () => {
        await result.current.validateFieldAsync("name");
      });

      expect(result.current.errors.name).toBeUndefined();
      expect(result.current.pending.name).toBe(false);
    });

    it("surfaces network-level errors as a field error", async () => {
      const asyncValidator = makeFailingAsyncValidator();

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "anything" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      await act(async () => {
        await result.current.validateFieldAsync("name");
      });

      expect(result.current.errors.name).toBe("Network error");
      expect(result.current.pending.name).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Async validator cancellation on rapid input changes
  // -------------------------------------------------------------------------

  describe("async validator cancellation on rapid input changes", () => {
    it("cancels in-flight async validation when a newer call arrives", async () => {
      const calls: string[] = [];

      // resolveAfterMs=200 so we can fire two before either completes.
      const slowValidator: AsyncValidatorFn = async (value, signal) => {
        await delay(200);
        if (signal.aborted) return undefined;
        calls.push(value as string);
        return value === "taken" ? "Already taken." : undefined;
      };

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          asyncValidators: { name: [slowValidator] },
          asyncDebounceMs: 0,
        })
      );

      let p1: Promise<boolean>;
      let p2: Promise<boolean>;

      act(() => {
        result.current.setState("name", "taken");
      });
      act(() => {
        p1 = result.current.validateFieldAsync("name");
      });

      // Immediately fire a second one — this should abort p1.
      act(() => {
        result.current.setState("name", "free");
        p2 = result.current.validateFieldAsync("name");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await Promise.allSettled([p1!, p2!]);
      });

      // Only the second ("free") call should have resolved into state.
      expect(calls).toEqual(["free"]);
      expect(result.current.errors.name).toBeUndefined();
      expect(result.current.pending.name).toBe(false);
    });

    it("does not write stale results after signal is aborted", async () => {
      // Validator that ignores the abort signal on purpose.
      // The hook itself checks signal.aborted after the await, so results from
      // the aborted call must never reach state.
      const ignorantValidator: AsyncValidatorFn = async (value, _signal) => {
        await delay(100);
        return "error from stale call";
      };

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          asyncValidators: { name: [ignorantValidator] },
          asyncDebounceMs: 0,
        })
      );

      let p1: Promise<boolean>;
      let p2: Promise<boolean>;

      act(() => {
        result.current.setState("name", "first");
      });
      act(() => {
        p1 = result.current.validateFieldAsync("name");
      });

      // Immediately supersede — aborts p1.
      act(() => {
        result.current.setState("name", "second");
      });
      act(() => {
        p2 = result.current.validateFieldAsync("name");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
        await Promise.allSettled([p1!, p2!]);
      });

      // p1 was aborted, so its result is discarded.
      // p2 is NOT aborted: it resolved "error from stale call" for "second".
      // The state should reflect only p2's outcome — exactly one error entry.
      expect(result.current.errors.name).toBe("error from stale call");
      expect(result.current.pending.name).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Debouncing via setState
  // -------------------------------------------------------------------------

  describe("debounced async validation on setState", () => {
    it("does not fire async validators before the debounce delay elapses", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => undefined);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 300,
        })
      );

      act(() => {
        result.current.setState("name", "hello");
      });

      // Advance only 200 ms — debounce has NOT fired yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(asyncValidator).not.toHaveBeenCalled();
    });

    it("fires async validator once after the debounce delay", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => undefined);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 300,
        })
      );

      act(() => {
        result.current.setState("name", "hello");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        // Drain the microtask queue so the async validator settles.
        await Promise.resolve();
      });

      expect(asyncValidator).toHaveBeenCalledTimes(1);
      expect(asyncValidator).toHaveBeenCalledWith(
        "hello",
        expect.any(AbortSignal)
      );
    });

    it("resets debounce timer on each keystroke and fires only once", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => undefined);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 300,
        })
      );

      act(() => {
        result.current.setState("name", "h");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        result.current.setState("name", "he");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        result.current.setState("name", "hel");
      });

      // 300 ms after the last keystroke.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();
      });

      expect(asyncValidator).toHaveBeenCalledTimes(1);
      expect(asyncValidator).toHaveBeenCalledWith(
        "hel",
        expect.any(AbortSignal)
      );
    });

    it("does not run async validators when sync validation fails after debounce", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => undefined);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          validators: { name: [required("Name")] },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 300,
        })
      );

      // Value is empty — sync required will fail.
      act(() => {
        result.current.setState("name", "");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();
      });

      // Sync failed → async should never have run.
      expect(asyncValidator).not.toHaveBeenCalled();
      expect(result.current.errors.name).toBe("Name is required.");
    });
  });

  // -------------------------------------------------------------------------
  // Sync + async aggregation
  // -------------------------------------------------------------------------

  describe("sync + async error aggregation", () => {
    it("shows sync error without running async when sync fails", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => "async error");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "" },
          validators: { name: [required("Name")] },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      let valid: boolean;
      await act(async () => {
        valid = await result.current.validateFieldAsync("name");
      });

      expect(valid!).toBe(false);
      expect(result.current.errors.name).toBe("Name is required.");
      expect(asyncValidator).not.toHaveBeenCalled();
    });

    it("runs async only after all sync validators pass", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => "async error");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "Alice" },
          validators: { name: [required("Name")] },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      let valid: boolean;
      await act(async () => {
        valid = await result.current.validateFieldAsync("name");
      });

      expect(valid!).toBe(false);
      expect(asyncValidator).toHaveBeenCalledOnce();
      expect(result.current.errors.name).toBe("async error");
    });

    it("validateAllAsync resolves false when any field has an async error", async () => {
      const takenCheck = makeTakenCheck("taken");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "taken", email: "alice@example.com" },
          asyncValidators: { name: [takenCheck] },
          asyncDebounceMs: 0,
        })
      );

      let valid: boolean;
      await act(async () => {
        valid = await result.current.validateAllAsync();
      });

      expect(valid!).toBe(false);
      expect(result.current.errors.name).toBe("Already taken.");
    });

    it("validateAllAsync resolves true when all fields pass", async () => {
      const takenCheck = makeTakenCheck("taken");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "available", email: "alice@example.com" },
          asyncValidators: { name: [takenCheck] },
          asyncDebounceMs: 0,
        })
      );

      let valid: boolean;
      await act(async () => {
        valid = await result.current.validateAllAsync();
      });

      expect(valid!).toBe(true);
      expect(result.current.errors.name).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // isValid reflects pending and error state
  // -------------------------------------------------------------------------

  describe("isValid", () => {
    it("is false while a field has a pending async validation", async () => {
      const asyncValidator = makeTakenCheck("taken", "Already taken.", 100);

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "taken" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      let promise: Promise<boolean>;
      act(() => {
        promise = result.current.validateFieldAsync("name");
      });

      // Mid-flight: isValid must be false because pending=true.
      expect(result.current.isValid).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
        await promise!;
      });

      // After resolution there's an error → still false.
      expect(result.current.isValid).toBe(false);
    });

    it("is true when no errors and no pending validations", async () => {
      const asyncValidator = makeTakenCheck("taken");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "available" },
          asyncValidators: { name: [asyncValidator] },
          asyncDebounceMs: 0,
        })
      );

      await act(async () => {
        await result.current.validateFieldAsync("name");
      });

      expect(result.current.isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // reset cancels in-flight work
  // -------------------------------------------------------------------------

  describe("reset", () => {
    it("cancels in-flight async validators and clears pending state", async () => {
      const calls: string[] = [];
      const slowValidator: AsyncValidatorFn = async (value, signal) => {
        await delay(200);
        if (signal.aborted) return undefined;
        calls.push("resolved");
        return "error";
      };

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "Alice" },
          asyncValidators: { name: [slowValidator] },
          asyncDebounceMs: 0,
        })
      );

      act(() => {
        result.current.validateFieldAsync("name");
      });

      // Should be pending while in-flight.
      expect(result.current.pending.name).toBe(true);

      // Reset before the async work completes.
      act(() => {
        result.current.reset();
      });

      expect(result.current.pending.name).toBe(false);
      expect(result.current.values.name).toBe("Alice");

      // Advance past the delay — the aborted call must NOT write into state.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();
      });

      expect(calls).toHaveLength(0);
      expect(result.current.errors.name).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // validateOnBlur triggers async validation
  // -------------------------------------------------------------------------

  describe("validateOnBlur with async validators", () => {
    it("runs async validators when setTouched(field, true) is called", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(makeTakenCheck("taken"));

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "taken" },
          asyncValidators: { name: [asyncValidator] },
          validateOnBlur: true,
          asyncDebounceMs: 0,
        })
      );

      // setTouched fires _runAsyncValidators as a fire-and-forget.
      // We need to fully drain microtasks and then let act flush the state
      // update that the async validator schedules.
      await act(async () => {
        result.current.setTouched("name", true);
        // Drain the microtask queue so the zero-delay validator resolves.
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        await new Promise<void>((resolve) => queueMicrotask(resolve));
      });

      expect(result.current.errors.name).toBe("Already taken.");
      expect(asyncValidator).toHaveBeenCalledOnce();
    });

    it("does not run async validators when validateOnBlur is false", async () => {
      const asyncValidator = vi.fn<AsyncValidatorFn>(async () => "error");

      const { result } = renderHook(() =>
        useFormValidation({
          initialValues: { name: "anything" },
          asyncValidators: { name: [asyncValidator] },
          validateOnBlur: false,
          asyncDebounceMs: 0,
        })
      );

      act(() => {
        result.current.setTouched("name", true);
      });

      expect(asyncValidator).not.toHaveBeenCalled();
    });
  });
});
