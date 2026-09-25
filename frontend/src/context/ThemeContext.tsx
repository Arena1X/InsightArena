"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
type Theme = "light" | "dark"; // resolved value

interface ThemeContextValue {
  /** The user's chosen mode: "light", "dark", or "system". */
  mode: ThemeMode;
  /** The resolved (applied) theme — always "light" or "dark". */
  theme: Theme;
  /** Cycles light → dark → system → light and persists the choice. */
  toggleTheme: () => void;
  /** Explicitly set a mode (persisted). */
  setTheme: (mode: ThemeMode) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
  toggleSidebarCollapsed: () => {},
});

export const THEME_STORAGE_KEY = "insightarena.theme.v1";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "insightarena.sidebar-collapsed.v1";

const CYCLE: ThemeMode[] = ["light", "dark", "system"];

// ---------------------------------------------------------------------------
// Pure helpers (no side-effects, safe to call on server)
// ---------------------------------------------------------------------------

function readStoredMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage unavailable (private browsing, sandboxed iframe, etc.)
  }
  return null;
}

function persistMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore write failures
  }
}

function getSystemPreference(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") return getSystemPreference();
  return mode;
}

function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function readStoredSidebarCollapsed(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // storage unavailable
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with "system" as the SSR-safe default; hydration script handles the
  // visual state before React takes over, so there is no flash.
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  // Restore persisted mode on first client render.
  useEffect(() => {
    const stored = readStoredMode();
    const initial = stored ?? "system";
    setModeState(initial);
    applyThemeToDocument(resolveTheme(initial));
  }, []);

  // Restore sidebar preference.
  useEffect(() => {
    const stored = readStoredSidebarCollapsed();
    if (stored !== null) setSidebarCollapsedState(stored);
  }, []);

  // Listen for OS-level theme changes; only apply when mode is "system".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // Re-read mode inside the handler so we always get the latest value.
      setModeState((currentMode) => {
        if (currentMode === "system") {
          applyThemeToDocument(e.matches ? "dark" : "light");
        }
        // State value itself doesn't change — only the DOM class does.
        return currentMode;
      });
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setModeState(next);
    applyThemeToDocument(resolveTheme(next));
    persistMode(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      const idx = CYCLE.indexOf(prev);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      applyThemeToDocument(resolveTheme(next));
      persistMode(next);
      return next;
    });
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Derive the resolved theme for consumers that only care about light/dark.
  const theme: Theme = resolveTheme(mode);

  const value = useMemo(
    () => ({
      mode,
      theme,
      toggleTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
    }),
    [
      mode,
      theme,
      toggleTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
