import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MarketCard from "./MarketCard";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("../hooks/useCountdown", () => ({
  useCountdown: () => ({
    label: "2d 5h",
    remainingMs: 200_000_000,
    isExpired: false,
  }),
}));

const baseMarket = {
  id: "m1",
  title: "BTC above $100k",
  category: "Crypto",
  probability: 0.65,
  totalStaked: 500,
  closeAt: "2026-12-31T00:00:00Z",
  status: "active",
};

describe("MarketCard stale-odds badge", () => {
  it("shows 'Reconnecting' badge when connectionStatus is disconnected", () => {
    render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="disconnected"
      />,
    );
    const badge = screen.getByTestId("stale-odds-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Reconnecting");
  });

  it("shows 'Reconnecting' badge when connectionStatus is connecting", () => {
    render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="connecting"
      />,
    );
    const badge = screen.getByTestId("stale-odds-badge");
    expect(badge).toHaveTextContent("Reconnecting");
  });

  it("shows 'Stale' badge when isStale is true and connected", () => {
    render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="connected"
        isStale={true}
      />,
    );
    const badge = screen.getByTestId("stale-odds-badge");
    expect(badge).toHaveTextContent("Stale");
  });

  it("does not show badge when connected and not stale", () => {
    render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="connected"
        isStale={false}
      />,
    );
    expect(screen.queryByTestId("stale-odds-badge")).not.toBeInTheDocument();
  });

  it("clears badge on reconnect (connected + not stale)", () => {
    const { rerender } = render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="disconnected"
      />,
    );
    expect(screen.getByTestId("stale-odds-badge")).toBeInTheDocument();

    rerender(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        connectionStatus="connected"
        isStale={false}
      />,
    );
    expect(screen.queryByTestId("stale-odds-badge")).not.toBeInTheDocument();
  });

  it("does not show stale badge in preview mode", () => {
    render(
      <MarketCard
        market={baseMarket}
        onPredict={() => {}}
        preview={true}
        connectionStatus="disconnected"
        isStale={true}
      />,
    );
    expect(screen.queryByTestId("stale-odds-badge")).not.toBeInTheDocument();
  });
});
