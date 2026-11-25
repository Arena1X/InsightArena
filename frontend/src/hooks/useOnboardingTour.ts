"use client";

import { useCallback, useEffect, useState } from "react";

import { getOnboardingStorageKey, isOnboardingTourSupported } from "@/lib/utils";

export interface TourStep {
  id: string;
  /** CSS selector or element id of the element to highlight. */
  target: string;
  title: string;
  description: string;
}

export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: "connect-wallet",
    target: "[data-tour='connect-wallet']",
    title: "Connect your wallet",
    description:
      "Start by connecting your Stellar wallet via Freighter. This lets you place predictions and earn rewards.",
  },
  {
    id: "explore-markets",
    target: "[data-tour='markets-nav']",
    title: "Explore markets",
    description:
      "Browse active prediction markets across sports, crypto, and current events. Each market closes when the event resolves.",
  },
  {
    id: "place-prediction",
    target: "[data-tour='place-prediction']",
    title: "Place a prediction",
    description:
      "Choose YES or NO, enter an amount, and submit. Your prediction is recorded on-chain — no middleman.",
  },
  {
    id: "track-rewards",
    target: "[data-tour='rewards-nav']",
    title: "Track your rewards",
    description:
      "Correct predictions earn you rewards. Head to the Rewards page to claim what you've won.",
  },
];

interface TourState {
  /** Step the user was last on; the tour resumes here. */
  stepIndex: number;
  completed: boolean;
  dismissed: boolean;
  /** Ids of steps the user moved past with Next. */
  seen?: string[];
  /** Ids of steps the user skipped individually. */
  skipped?: string[];
}

const INITIAL_STATE: TourState = { stepIndex: 0, completed: false, dismissed: false };

function stepIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** Returns the first step at or after `from` that the user has not seen or skipped. */
function nextUnhandledIndex(state: TourState, from: number): number {
  const handled = new Set([...(state.seen ?? []), ...(state.skipped ?? [])]);
  let index = from;
  while (index < ONBOARDING_STEPS.length - 1 && handled.has(ONBOARDING_STEPS[index].id)) index++;
  return index;
}

function clampStep(index: unknown): number {
  if (typeof index !== "number" || !Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1);
}

function readState(key: string): TourState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      stepIndex: clampStep(parsed.stepIndex),
      completed: parsed.completed === true,
      dismissed: parsed.dismissed === true,
      seen: stepIds(parsed.seen),
      skipped: stepIds(parsed.skipped),
    };
  } catch {
    return INITIAL_STATE;
  }
}

function writeState(key: string, state: TourState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — silently ignore
  }
}

export interface UseOnboardingTourResult {
  /** True when the tour is open and the viewport can display it. */
  isActive: boolean;
  /** False on viewports too small to show the tour. */
  isSupported: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  /** Opens the tour at the saved step. */
  start: () => void;
  /** Opens the tour from step one, clearing any skip or completion. */
  restart: () => void;
  next: () => void;
  prev: () => void;
  /** Skips only the current step and moves on. */
  skipStep: () => void;
  /** Skips the whole tour (suppresses auto-start until `restart()`). */
  skip: () => void;
  complete: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  isLastStep: boolean;
}

/**
 * Manages the new-user onboarding tour.
 *
 * Progress is persisted per user (keyed by `userId`, e.g. the wallet address)
 * so an interrupted tour resumes at the step the user left. Skipping or
 * completing suppresses future auto-starts until `restart()` is called. The
 * tour never shows on viewports narrower than ONBOARDING_TOUR_MIN_VIEWPORT_PX.
 * Keyboard-accessible: consumers should wire `next` to Enter/ArrowRight and
 * `prev` to ArrowLeft, and `skip` to Escape.
 */
export function useOnboardingTour(userId?: string | null): UseOnboardingTourResult {
  const storageKey = getOnboardingStorageKey(userId);
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    function evaluate() {
      setIsSupported(isOnboardingTourSupported(window.innerWidth));
    }
    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

  // Load this user's progress after hydration and auto-resume unfinished tours.
  useEffect(() => {
    const state = readState(storageKey);
    setStepIndex(nextUnhandledIndex(state, state.stepIndex));
    setIsOpen(!state.completed && !state.dismissed);
  }, [storageKey]);

  const goTo = useCallback(
    (index: number) => {
      setStepIndex(index);
      writeState(storageKey, { ...readState(storageKey), stepIndex: index });
    },
    [storageKey],
  );

  const start = useCallback(() => {
    const state = readState(storageKey);
    writeState(storageKey, { ...state, dismissed: false });
    setStepIndex(state.completed ? 0 : nextUnhandledIndex(state, state.stepIndex));
    setIsOpen(true);
  }, [storageKey]);

  const restart = useCallback(() => {
    writeState(storageKey, INITIAL_STATE);
    setStepIndex(0);
    setIsOpen(true);
  }, [storageKey]);

  const skip = useCallback(() => {
    setIsOpen(false);
    writeState(storageKey, { ...readState(storageKey), dismissed: true });
  }, [storageKey]);

  const complete = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    writeState(storageKey, { stepIndex: 0, completed: true, dismissed: false });
  }, [storageKey]);

  // Records the current step under `field`, then moves to the next one.
  const advance = useCallback(
    (field: "seen" | "skipped") => {
      const state = readState(storageKey);
      const ids = state[field] ?? [];
      const id = ONBOARDING_STEPS[stepIndex].id;
      writeState(storageKey, { ...state, [field]: ids.includes(id) ? ids : [...ids, id] });
      if (stepIndex + 1 >= ONBOARDING_STEPS.length) {
        complete();
        return;
      }
      goTo(stepIndex + 1);
    },
    [complete, goTo, stepIndex, storageKey],
  );

  const next = useCallback(() => advance("seen"), [advance]);
  const skipStep = useCallback(() => advance("skipped"), [advance]);

  const prev = useCallback(() => {
    goTo(Math.max(0, stepIndex - 1));
  }, [goTo, stepIndex]);

  const isActive = isOpen && isSupported;
  const currentStep = isActive ? (ONBOARDING_STEPS[stepIndex] ?? null) : null;

  return {
    isActive,
    isSupported,
    currentStepIndex: stepIndex,
    currentStep,
    totalSteps: ONBOARDING_STEPS.length,
    start,
    restart,
    next,
    prev,
    skipStep,
    skip,
    complete,
    canGoBack: stepIndex > 0,
    canGoNext: stepIndex < ONBOARDING_STEPS.length - 1,
    isLastStep: stepIndex === ONBOARDING_STEPS.length - 1,
  };
}
