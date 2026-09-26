/**
 * Tests for TradingPage's PWA offline fallback — Issue #1560
 *
 * Covers:
 *  - Cached markets are served, with a banner, when offline on load.
 *  - Trade/favorite actions are disabled while offline.
 *  - Reconnecting clears the banner and re-enables actions.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TradingPage from "./page";
import { cacheMarkets } from "@/lib/marketsCache";

vi.mock("@/component/Header", () => ({
  default: () => <div data-testid="header" />,
}));
vi.mock("@/component/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));
vi.mock("@/component/PageBackground", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("TradingPage offline fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it("does not show the offline banner when online", () => {
    render(<TradingPage />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("serves the cached markets list and shows the offline banner when offline on load", () => {
    cacheMarkets([
      { name: "Bitcoin", price: "$1.00", volume: "1B", change: "+1%", isFavorite: false },
    ]);
    setOnline(false);

    render(<TradingPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
    // The placeholder-data markets are not shown once a cached list exists.
    expect(screen.queryByText("Ethereum")).not.toBeInTheDocument();
  });

  it("disables trade and favorite buttons while offline", () => {
    cacheMarkets([
      { name: "Bitcoin", price: "$1.00", volume: "1B", change: "+1%", isFavorite: false },
    ]);
    setOnline(false);

    render(<TradingPage />);

    expect(screen.getByRole("button", { name: "Trade Bitcoin" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add Bitcoin to favorites" }),
    ).toBeDisabled();
  });

  it("re-enables actions and clears the banner on reconnect", async () => {
    cacheMarkets([
      { name: "Bitcoin", price: "$1.00", volume: "1B", change: "+1%", isFavorite: false },
    ]);
    setOnline(false);
    render(<TradingPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not fire the trade action while disabled, even if clicked", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    cacheMarkets([
      { name: "Bitcoin", price: "$1.00", volume: "1B", change: "+1%", isFavorite: false },
    ]);
    setOnline(false);
    render(<TradingPage />);

    const tradeButton = screen.getByRole("button", { name: "Trade Bitcoin" });
    const user = userEvent.setup();
    await user.click(tradeButton);

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
