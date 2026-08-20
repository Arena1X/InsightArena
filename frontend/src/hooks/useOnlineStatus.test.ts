import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useOnlineStatus } from "./useOnlineStatus";

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function fireOffline() {
  window.dispatchEvent(new Event("offline"));
}

function fireOnline() {
  window.dispatchEvent(new Event("online"));
}

describe("useOnlineStatus", () => {
  beforeEach(() => {
    setNavigatorOnline(true);
  });

  afterEach(() => {
    // Restore listeners by firing nothing more; each renderHook cleans up.
  });

  it("starts online when navigator.onLine is true", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("flips to false when the offline event fires", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => fireOffline());
    expect(result.current).toBe(false);
  });

  it("flips back to true when the online event fires", () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => fireOffline());
    expect(result.current).toBe(false);

    act(() => fireOnline());
    expect(result.current).toBe(true);
  });

  it("re-syncs to the current navigator.onLine on mount even if events were missed", () => {
    setNavigatorOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });
});