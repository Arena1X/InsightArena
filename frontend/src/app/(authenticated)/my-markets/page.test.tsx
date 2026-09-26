import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaginatedCreatorMarketsResponse } from "@/lib/api";
import MarketsPage from "./page";

let walletAddress: string | null = "GCREATOR";
const getCreatorMarkets = vi.fn<(address: string) => Promise<PaginatedCreatorMarketsResponse>>();

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({ address: walletAddress }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getCreatorMarkets: (address: string) => getCreatorMarkets(address) };
});

vi.mock("@/hooks/useLiveOdds", () => ({
  useLiveOdds: () => ({ odds: null, pool: null, status: "idle", lastUpdatedAt: null }),
}));

const RESPONSE: PaginatedCreatorMarketsResponse = {
  data: [
    {
      id: "a",
      title: "Older big market",
      total_pool_stroops: "90000000000", // 9,000 XLM
      participant_count: 275,
      is_resolved: true,
      is_cancelled: false,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "b",
      title: "Newer small market",
      total_pool_stroops: "75000000000", // 7,500 XLM
      participant_count: 147,
      is_resolved: false,
      is_cancelled: false,
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
};

function openMyMarketsTab() {
  render(<MarketsPage />);
  fireEvent.click(screen.getByRole("button", { name: "My Markets" }));
}

describe("My Markets creator analytics", () => {
  beforeEach(() => {
    walletAddress = "GCREATOR";
    getCreatorMarkets.mockReset();
    getCreatorMarkets.mockResolvedValue(RESPONSE);
  });

  it("shows per-market metrics and header totals equal to their sum", async () => {
    openMyMarketsTab();

    const rows = await screen.findAllByTestId("creator-market-row");
    expect(rows).toHaveLength(2);
    expect(getCreatorMarkets).toHaveBeenCalledWith("GCREATOR");

    // 9,000 + 7,500 XLM; 275 + 147 participants; 1% of the resolved 9,000 XLM.
    expect(screen.getByTestId("total-volume")).toHaveTextContent("16,500 XLM");
    expect(screen.getByTestId("total-participants")).toHaveTextContent("422");
    expect(screen.getByTestId("total-fees")).toHaveTextContent("90 XLM");
    expect(screen.getByTestId("total-resolved")).toHaveTextContent("1 / 2");

    expect(within(rows[0]).getByText("Resolved")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Open")).toBeInTheDocument();
  });

  it("sorts by volume by default and by recency on request", async () => {
    openMyMarketsTab();

    let rows = await screen.findAllByTestId("creator-market-row");
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "Older big market",
      "Newer small market",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Recent" }));

    rows = screen.getAllByTestId("creator-market-row");
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "Newer small market",
      "Older big market",
    ]);
  });

  it("asks the user to connect a wallet when none is connected", () => {
    walletAddress = null;
    openMyMarketsTab();

    expect(screen.getByText(/connect your wallet to see analytics/i)).toBeInTheDocument();
    expect(getCreatorMarkets).not.toHaveBeenCalled();
  });

  it("shows an error when metrics fail to load", async () => {
    getCreatorMarkets.mockRejectedValue(new Error("boom"));
    openMyMarketsTab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load market metrics/i);
  });
});
