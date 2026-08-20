"use client";

import { useEffect, useState } from "react";

function getOnlineStatus(): boolean {
  if (typeof window === "undefined") return true;
  return window.navigator.onLine;
}

/**
 * Tracks browser connectivity via the `online` / `offline` events.
 *
 * SSR-safe: defaults to `true` while there is no `window`.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(getOnlineStatus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Re-sync in case the state changed between render and effect.
    setIsOnline(window.navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}