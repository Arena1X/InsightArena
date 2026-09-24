/**
 * Tests for ThemeContext — Issue #1562
 *
 * Covers:
 *  1. Persisted theme choice is restored correctly on mount.
 *  2. When mode is "system", the app updates automatically when the OS
 *     prefers-color-scheme media query changes.
 *  3. toggleTheme cycles light → dark → system → light.
 *  4. setTheme persists to localStorage.
 *  5. In system mode the resolved `theme` tracks matchMedia, not storage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from "./ThemeContext";

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

/** Listeners registered via mq.addEventListener("change", …) */
let mediaChangeListeners: Array<(e: Partial<MediaQueryListEvent>) => void> = [];

/**
 * Creates a reusable mock for window.matchMedia.
 * @param prefersDark   Initial value of `(prefers-color-scheme: dark)`.
 */
function mockMatchMedia(prefersDark: boolean) {
  mediaChangeListeners = [];

  const mq = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(
      (_type: string, listener: (e: Partial<MediaQueryListEvent>) => void) => {
        mediaChangeListeners.push(listener);
      },
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (e: Partial<MediaQueryListEvent>) => void) => {
        mediaChangeListeners = mediaChangeListeners.filter((l) => l !== listener);
      },
    ),
    dispatchEvent: vi.fn(),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mq),
  });

  return mq;
}

/** Fire a fake `change` event on the matchMedia mock. */
function fireMediaChange(prefersDark: boolean) {
  mediaChangeListeners.forEach((l) => l({ matches: prefersDark }));
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function setStoredMode(mode: string) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

function getStoredMode() {
  return localStorage.getItem(THEME_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  // Default: OS is dark
  mockMatchMedia(true);
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Persistence — stored mode is restored on mount
// ---------------------------------------------------------------------------

describe("persisted theme choice is restored on mount", () => {
  it("restores mode=light and applies light class", async () => {
    setStoredMode("light");

    const { result } = renderHook(() => useTheme(), { wrapper });

    // useEffect runs after render; wait for it
    await act(async () => {});

    expect(result.current.mode).toBe("light");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores mode=dark and applies dark class", async () => {
    setStoredMode("dark");

    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {});

    expect(result.current.mode).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores mode=system and resolves via matchMedia (OS dark)", async () => {
    // OS dark is already mocked in beforeEach
    setStoredMode("system");

    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {});

    expect(result.current.mode).toBe("system");
    expect(result.current.theme).toBe("dark"); // resolved from OS
  });

  it("restores mode=system and resolves via matchMedia (OS light)", async () => {
    mockMatchMedia(false); // OS is light
    setStoredMode("system");

    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {});

    expect(result.current.mode).toBe("system");
    expect(result.current.theme).toBe("light");
  });

  it("defaults to system when nothing is stored", async () => {
    // nothing in localStorage
    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {});

    expect(result.current.mode).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// 2. System mode — reacts to OS changes live
// ---------------------------------------------------------------------------

describe("system mode reacts to OS prefers-color-scheme changes", () => {
  it("switches to light when OS changes to light while in system mode", async () => {
    setStoredMode("system");
    mockMatchMedia(true); // OS starts dark

    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    // OS flips to light
    act(() => fireMediaChange(false));

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("switches to dark when OS changes to dark while in system mode", async () => {
    setStoredMode("system");
    mockMatchMedia(false); // OS starts light

    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    // OS flips to dark
    act(() => fireMediaChange(true));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does NOT change theme when OS changes but mode is light", async () => {
    setStoredMode("light");
    mockMatchMedia(false); // OS is light

    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    // OS flips to dark — should be ignored because mode is explicitly "light"
    act(() => fireMediaChange(true));

    expect(result.current.mode).toBe("light");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does NOT change theme when OS changes but mode is dark", async () => {
    setStoredMode("dark");
    mockMatchMedia(true); // OS is dark

    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    // OS flips to light — should be ignored because mode is explicitly "dark"
    act(() => fireMediaChange(false));

    expect(result.current.mode).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. toggleTheme — cycles light → dark → system → light
// ---------------------------------------------------------------------------

describe("toggleTheme cycles correctly", () => {
  it("cycles light → dark → system → light", async () => {
    setStoredMode("light");

    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});
    expect(result.current.mode).toBe("light");

    // light → dark
    act(() => result.current.toggleTheme());
    expect(result.current.mode).toBe("dark");
    expect(getStoredMode()).toBe("dark");

    // dark → system
    act(() => result.current.toggleTheme());
    expect(result.current.mode).toBe("system");
    expect(getStoredMode()).toBe("system");

    // system → light
    act(() => result.current.toggleTheme());
    expect(result.current.mode).toBe("light");
    expect(getStoredMode()).toBe("light");
  });
});

// ---------------------------------------------------------------------------
// 4. setTheme — explicit set persists to localStorage
// ---------------------------------------------------------------------------

describe("setTheme persists to localStorage", () => {
  it("persists light", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    act(() => result.current.setTheme("light"));

    expect(result.current.mode).toBe("light");
    expect(getStoredMode()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists dark", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    act(() => result.current.setTheme("dark"));

    expect(result.current.mode).toBe("dark");
    expect(getStoredMode()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists system", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {});

    act(() => result.current.setTheme("system"));

    expect(result.current.mode).toBe("system");
    expect(getStoredMode()).toBe("system");
  });
});
