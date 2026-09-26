import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getOnboardingStorageKey, isOnboardingTourSupported, ONBOARDING_TOUR_MIN_VIEWPORT_PX } from "@/lib/utils";
import { ONBOARDING_STEPS, useOnboardingTour } from "./useOnboardingTour";

const USER = "GUSER";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function readSaved(userId: string | null = USER) {
  return JSON.parse(localStorage.getItem(getOnboardingStorageKey(userId)) ?? "null");
}

describe("useOnboardingTour", () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1280);
  });

  afterEach(() => {
    setViewportWidth(1024);
  });

  it("auto-starts at step one for a new user", () => {
    const { result } = renderHook(() => useOnboardingTour(USER));

    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(0);
    expect(result.current.currentStep?.id).toBe(ONBOARDING_STEPS[0].id);
  });

  it("resumes at the saved step after being interrupted", () => {
    const first = renderHook(() => useOnboardingTour(USER));
    act(() => first.result.current.next());
    act(() => first.result.current.next());
    expect(first.result.current.currentStepIndex).toBe(2);
    expect(readSaved()).toMatchObject({ stepIndex: 2 });

    // User navigates away mid-tour.
    first.unmount();

    const second = renderHook(() => useOnboardingTour(USER));
    expect(second.result.current.isActive).toBe(true);
    expect(second.result.current.currentStepIndex).toBe(2);
    expect(second.result.current.currentStep?.id).toBe(ONBOARDING_STEPS[2].id);
  });

  it("persists progress per user", () => {
    const alice = renderHook(() => useOnboardingTour("GALICE"));
    act(() => alice.result.current.next());
    alice.unmount();

    const bob = renderHook(() => useOnboardingTour("GBOB"));
    expect(bob.result.current.currentStepIndex).toBe(0);
    bob.unmount();

    const aliceAgain = renderHook(() => useOnboardingTour("GALICE"));
    expect(aliceAgain.result.current.currentStepIndex).toBe(1);
  });

  it("switches to the new user's progress when the user changes", () => {
    localStorage.setItem(getOnboardingStorageKey("GB"), JSON.stringify({ stepIndex: 3, completed: false, dismissed: false }));
    const { result, rerender } = renderHook(({ id }) => useOnboardingTour(id), {
      initialProps: { id: "GA" },
    });
    expect(result.current.currentStepIndex).toBe(0);

    rerender({ id: "GB" });
    expect(result.current.currentStepIndex).toBe(3);
  });

  it("skip suppresses future auto-starts", () => {
    const first = renderHook(() => useOnboardingTour(USER));
    act(() => first.result.current.next());
    act(() => first.result.current.skip());
    expect(first.result.current.isActive).toBe(false);
    expect(readSaved()).toMatchObject({ dismissed: true });
    first.unmount();

    const second = renderHook(() => useOnboardingTour(USER));
    expect(second.result.current.isActive).toBe(false);
    expect(second.result.current.currentStep).toBeNull();
  });

  it("completing the tour suppresses future auto-starts", () => {
    const first = renderHook(() => useOnboardingTour(USER));
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
      act(() => first.result.current.next());
    }
    expect(first.result.current.isActive).toBe(false);
    expect(readSaved()).toMatchObject({ completed: true });
    first.unmount();

    expect(renderHook(() => useOnboardingTour(USER)).result.current.isActive).toBe(false);
  });

  it("restart reopens a skipped tour from step one", () => {
    localStorage.setItem(getOnboardingStorageKey(USER), JSON.stringify({ stepIndex: 2, completed: false, dismissed: true }));
    const { result } = renderHook(() => useOnboardingTour(USER));
    expect(result.current.isActive).toBe(false);

    act(() => result.current.restart());

    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(0);
    expect(readSaved()).toEqual({ stepIndex: 0, completed: false, dismissed: false });
  });

  it("start resumes a skipped tour at the saved step", () => {
    localStorage.setItem(getOnboardingStorageKey(USER), JSON.stringify({ stepIndex: 2, completed: false, dismissed: true }));
    const { result } = renderHook(() => useOnboardingTour(USER));

    act(() => result.current.start());

    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(2);
  });

  it("does not show the tour on small viewports", () => {
    setViewportWidth(ONBOARDING_TOUR_MIN_VIEWPORT_PX - 1);
    const { result } = renderHook(() => useOnboardingTour(USER));

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isActive).toBe(false);
    expect(result.current.currentStep).toBeNull();
    // Hiding for the viewport must not count as a skip.
    expect(readSaved()).toBeNull();
  });

  it("hides on resize to a small viewport and reappears at the same step", () => {
    const { result } = renderHook(() => useOnboardingTour(USER));
    act(() => result.current.next());

    act(() => {
      setViewportWidth(375);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.isActive).toBe(false);

    act(() => {
      setViewportWidth(1280);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(1);
  });

  it("ignores corrupt or out-of-range saved steps", () => {
    localStorage.setItem(getOnboardingStorageKey(USER), JSON.stringify({ stepIndex: 99 }));
    expect(renderHook(() => useOnboardingTour(USER)).result.current.currentStepIndex).toBe(ONBOARDING_STEPS.length - 1);

    localStorage.setItem(getOnboardingStorageKey(USER), "{not json");
    expect(renderHook(() => useOnboardingTour(USER)).result.current.currentStepIndex).toBe(0);
  });
});

describe("onboarding utils", () => {
  it("guards viewports below the minimum width", () => {
    expect(isOnboardingTourSupported(ONBOARDING_TOUR_MIN_VIEWPORT_PX)).toBe(true);
    expect(isOnboardingTourSupported(ONBOARDING_TOUR_MIN_VIEWPORT_PX - 1)).toBe(false);
  });

  it("keys storage per user with an anonymous fallback", () => {
    expect(getOnboardingStorageKey("GABC")).toBe("insightarena.onboarding.v2:GABC");
    expect(getOnboardingStorageKey(null)).toBe("insightarena.onboarding.v2:anonymous");
  });
});
