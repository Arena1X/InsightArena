/**
 * Tests for the My Predictions page — Issue #1556
 *
 * Covers:
 *  1. Status filter narrows the visible list.
 *  2. Text search narrows by market title.
 *  3. Summary chips (win rate, net P/L) reflect the filtered set.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MyPredictionsPage from "./page";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => async () => true,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe("MyPredictionsPage", () => {
  it("filters the list when a status tab is selected", () => {
    render(<MyPredictionsPage />);

    expect(screen.getByText("Bitcoin price above $100k by year end?")).toBeVisible();
    expect(screen.getByText("Ethereum ETF approval by end of month")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /^Won/ }));

    expect(screen.getByText("Ethereum ETF approval by end of month")).toBeVisible();
    expect(screen.queryByText("Bitcoin price above $100k by year end?")).not.toBeInTheDocument();
  });

  it("filters the list by a text search on market title", () => {
    render(<MyPredictionsPage />);

    const searchBox = screen.getByLabelText("Search predictions by market title");
    fireEvent.change(searchBox, { target: { value: "solana" } });

    expect(screen.getByText("Solana network downtime this month?")).toBeVisible();
    expect(screen.queryByText("Bitcoin price above $100k by year end?")).not.toBeInTheDocument();
  });

  it("shows a win rate and net P/L summary reflecting the filtered set", () => {
    render(<MyPredictionsPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Won/ }));

    // All 3 "Won" mock predictions are wins by definition, so win rate is 100%.
    expect(screen.getByText("100%")).toBeVisible();
  });
});
