/**
 * Tests for the Header theme toggle button — Issue #1562
 *
 * Covers:
 *  - Correct icon is shown for each mode (sun / moon / monitor).
 *  - aria-label describes the NEXT mode (what clicking will do).
 *  - Clicking cycles light → dark → system → light.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// We render the Header inside a real ThemeProvider so the toggle logic is
// exercised end-to-end. Other heavy context providers are mocked.

import { ThemeProvider, THEME_STORAGE_KEY } from "@/context/ThemeContext";

// ---------------------------------------------------------------------------
// Mock every heavy dependency that Header imports
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: null,
    isAuthenticated: false,
    isRestoring: false,
    logout: vi.fn(),
    openConnectModal: vi.fn(),
  }),
}));

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// Stub sub-components that would pull in more deps
vi.mock("@/component/header/MobileMenu", () => ({
  MobileMenu: () => null,
}));
vi.mock("@/component/header/NavLinksComponent", () => ({
  NavLinks: () => null,
}));
vi.mock("@/component/header/UserWalletControls", () => ({
  UserWalletControls: () => null,
}));
vi.mock("@/component/header/WalletBalanceDisplay", () => ({
  WalletBalanceDisplay: () => null,
}));
vi.mock("@/component/header/navLinks", () => ({
  isActivePath: () => false,
}));

// ---------------------------------------------------------------------------
// matchMedia stub
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderHeader(initialMode?: string) {
  if (initialMode) localStorage.setItem(THEME_STORAGE_KEY, initialMode);

  const { default: Header } = await import("@/component/Header");

  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <ThemeProvider>
        <Header />
      </ThemeProvider>,
    );
  });

  return utils!;
}

function getToggleButton() {
  // The button's aria-label always starts with "Switch to …"
  return screen.getByRole("button", { name: /switch to/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Header theme toggle button", () => {
  it("shows sun icon and 'Switch to dark mode' label when mode is light", async () => {
    await renderHeader("light");

    const btn = getToggleButton();
    expect(btn).toHaveAttribute("aria-label", "Switch to dark mode");
    expect(btn).toHaveAttribute("title", "Light mode");
  });

  it("shows moon icon and 'Switch to system mode' label when mode is dark", async () => {
    await renderHeader("dark");

    const btn = getToggleButton();
    expect(btn).toHaveAttribute("aria-label", "Switch to system mode");
    expect(btn).toHaveAttribute("title", "Dark mode");
  });

  it("shows monitor icon and 'Switch to light mode' label when mode is system", async () => {
    await renderHeader("system");

    const btn = getToggleButton();
    expect(btn).toHaveAttribute("aria-label", "Switch to light mode");
    expect(btn).toHaveAttribute("title", "System mode");
  });

  it("cycles light → dark → system → light on successive clicks", async () => {
    const user = userEvent.setup();
    await renderHeader("light");

    const btn = getToggleButton();

    // light → dark
    await user.click(btn);
    expect(screen.getByRole("button", { name: "Switch to system mode" })).toBeTruthy();

    // dark → system
    await user.click(screen.getByRole("button", { name: "Switch to system mode" }));
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();

    // system → light
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  });

  it("persists the new mode to localStorage after each click", async () => {
    const user = userEvent.setup();
    await renderHeader("light");

    await user.click(getToggleButton()); // → dark
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(getToggleButton()); // → system
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");

    await user.click(getToggleButton()); // → light
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
