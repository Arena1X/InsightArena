"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn, isRouteContentPending, subscribeRouteContentPending } from "@/lib/utils";

/** Navigations that resolve within this window never show the bar. */
const SHOW_DELAY_MS = 150;
/** How long the bar holds at 100% before it fades away. */
const FINISH_HOLD_MS = 200;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(0);

  const isNavigating = useRef(false);
  // True once the URL has settled on the destination route, even if its
  // loading.tsx fallback is still mounted (content not actually ready yet).
  const routeSettled = useRef(true);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const previousRouteKey = useRef(routeKey);

  useEffect(() => {
    function clearAllTimers() {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (trickleTimer.current) clearInterval(trickleTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showTimer.current = null;
      trickleTimer.current = null;
      hideTimer.current = null;
    }

    function start() {
      // A new navigation cancels and resets any in-flight one, rather than
      // letting a stale trickle silently continue (or jumping to complete).
      clearAllTimers();
      isNavigating.current = true;
      routeSettled.current = false;
      setValue(0);

      showTimer.current = setTimeout(() => {
        setVisible(true);
        if (reducedMotion) {
          setValue(100);
          return;
        }
        setValue(20);
        trickleTimer.current = setInterval(() => {
          setValue((current) => (current >= 90 ? current : current + (90 - current) * 0.15));
        }, 250);
      }, SHOW_DELAY_MS);
    }

    function finishNow() {
      isNavigating.current = false;
      if (showTimer.current) clearTimeout(showTimer.current);
      if (trickleTimer.current) clearInterval(trickleTimer.current);
      showTimer.current = null;
      trickleTimer.current = null;

      setValue(100);
      hideTimer.current = setTimeout(
        () => {
          setVisible(false);
          setValue(0);
        },
        reducedMotion ? 0 : FINISH_HOLD_MS,
      );
    }

    function finish() {
      if (!isNavigating.current) return;
      routeSettled.current = true;
      // The URL commits before a slow destination's loading.tsx unmounts —
      // don't call it "done" until that content-pending signal clears too.
      if (isRouteContentPending()) return;
      finishNow();
    }

    const unsubscribeContentPending = subscribeRouteContentPending((pending) => {
      if (!pending && isNavigating.current && routeSettled.current) {
        finishNow();
      }
    });

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args: Parameters<History["pushState"]>) => {
      start();
      return originalPushState(...args);
    };
    window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      start();
      return originalReplaceState(...args);
    };
    window.addEventListener("popstate", start);

    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      finish();
    }

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", start);
      unsubscribeContentPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, reducedMotion]);

  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (trickleTimer.current) clearInterval(trickleTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[250] h-[3px] bg-transparent"
      role="progressbar"
      aria-label="Page loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r from-orange-500 to-[#4FD1C5]",
          !reducedMotion && "transition-[width] duration-300 ease-out",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
