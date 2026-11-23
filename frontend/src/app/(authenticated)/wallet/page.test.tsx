import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Track the latest URL replace call so we can assert on it.
const mockReplace = vi.fn();
let mockSearchParamsString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GTEST_ADDRESS",
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderPage(initialSearch = "") {
  mockSearchParamsString = initialSearch;
  // Re-import after updating the mock state so the component reads fresh params.
  const { default: WalletPage } = await import("./page");
  render(<WalletPage />);
}

function getTableRows() {
  const tbody = document.querySelector("tbody");
  if (!tbody) return [];
  return within(tbody).getAllByRole("row");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WalletPage — transaction filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSearchParamsString = "";
  });

  // ── 1. Filtering by type narrows the list ─────────────────────────────────

  it("filtering by type narrows the transaction list", async () => {
    const user = userEvent.setup();
    await renderPage();

    const allRows = getTableRows();
    expect(allRows.length).toBeGreaterThan(0);

    const select = screen.getByRole("combobox", {
      name: /filter by transaction type/i,
    });

    await user.selectOptions(select, "Payout");

    // mockReplace should have been called with a URL containing type=Payout
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("type=Payout"),
      expect.anything(),
    );
  });

  it("renders only Payout rows when type=Payout is in the URL", async () => {
    await renderPage("type=Payout");

    const rows = getTableRows();
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row) => {
      expect(within(row).getByText("Payout")).toBeInTheDocument();
    });
  });

  it("renders only Stake rows when type=Stake is in the URL", async () => {
    await renderPage("type=Stake");

    const rows = getTableRows();
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row) => {
      expect(within(row).getByText("Stake")).toBeInTheDocument();
    });
  });

  it("shows the full list when type=All (default)", async () => {
    await renderPage();

    // The seed-generated list has 8 entries — verify at least several appear.
    const rows = getTableRows();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  // ── 2. Date range filter applies correctly ────────────────────────────────

  it("date range filter narrows the list to matching dates", async () => {
    // The generated transactions span 2026-05-01 to 2026-05-29.
    // A tight window should exclude most of them.
    await renderPage("from=2026-05-28&to=2026-05-29");

    const rows = getTableRows();
    // Only the two most-recent transactions (index 0 and 1 → May 29 and May 28) match.
    expect(rows.length).toBeLessThan(8);
    rows.forEach((row) => {
      const dateCell = within(row).getAllByRole("cell")[0];
      const date = dateCell.textContent ?? "";
      expect(date >= "2026-05-28").toBe(true);
      expect(date <= "2026-05-29").toBe(true);
    });
  });

  it("shows the empty state when date range matches no transactions", async () => {
    // A date range far in the future with no transactions.
    await renderPage("from=2030-01-01&to=2030-01-02");

    expect(screen.getByText(/no transactions match/i)).toBeInTheDocument();
  });

  it("setting a from date calls router.replace with from param", async () => {
    const user = userEvent.setup();
    await renderPage();

    const fromInput = screen.getByLabelText(/filter from date/i);
    await user.type(fromInput, "2026-05-25");

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("from=2026-05-25"),
      expect.anything(),
    );
  });

  it("setting a to date calls router.replace with to param", async () => {
    const user = userEvent.setup();
    await renderPage();

    const toInput = screen.getByLabelText(/filter to date/i);
    await user.type(toInput, "2026-05-27");

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("to=2026-05-27"),
      expect.anything(),
    );
  });

  // ── 3. Filters are reflected in the URL ──────────────────────────────────

  it("selecting a type writes type to the URL query string", async () => {
    const user = userEvent.setup();
    await renderPage();

    const select = screen.getByRole("combobox", {
      name: /filter by transaction type/i,
    });
    await user.selectOptions(select, "Refund");

    expect(mockReplace).toHaveBeenLastCalledWith(
      expect.stringMatching(/[?&]type=Refund/),
      expect.anything(),
    );
  });

  it("selecting 'All Types' removes the type param from the URL", async () => {
    const user = userEvent.setup();
    await renderPage("type=Stake");

    const select = screen.getByRole("combobox", {
      name: /filter by transaction type/i,
    });
    await user.selectOptions(select, "All Types");

    const lastCall = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain("type=");
  });

  it("URL params are correctly parsed on page load — type filter pre-selected", async () => {
    await renderPage("type=Refund");

    const select = screen.getByRole("combobox", {
      name: /filter by transaction type/i,
    }) as HTMLSelectElement;

    expect(select.value).toBe("Refund");
  });

  it("URL params are correctly parsed on page load — date inputs pre-filled", async () => {
    await renderPage("from=2026-05-10&to=2026-05-20");

    const fromInput = screen.getByLabelText(/filter from date/i) as HTMLInputElement;
    const toInput = screen.getByLabelText(/filter to date/i) as HTMLInputElement;

    expect(fromInput.value).toBe("2026-05-10");
    expect(toInput.value).toBe("2026-05-20");
  });

  // ── 4. Clear filters button ───────────────────────────────────────────────

  it("shows a clear button when filters are active and clears them on click", async () => {
    const user = userEvent.setup();
    await renderPage("type=Stake&from=2026-05-01");

    const clearBtn = screen.getByRole("button", { name: /clear all filters/i });
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);

    // router.replace called with empty search (just "?")
    expect(mockReplace).toHaveBeenLastCalledWith("?", expect.anything());
  });

  it("does not show the clear button when no filters are active", async () => {
    await renderPage();
    expect(
      screen.queryByRole("button", { name: /clear all filters/i }),
    ).not.toBeInTheDocument();
  });

  // ── 5. Combining type + date filters ─────────────────────────────────────

  it("combining type and date filters applies both constraints", async () => {
    // Stake transactions exist on various dates; restrict to a narrow range.
    await renderPage("type=Stake&from=2026-05-20&to=2026-05-29");

    const rows = getTableRows();
    if (rows.length > 0) {
      rows.forEach((row) => {
        expect(within(row).getByText("Stake")).toBeInTheDocument();
        const dateCell = within(row).getAllByRole("cell")[0];
        const date = dateCell.textContent ?? "";
        expect(date >= "2026-05-20").toBe(true);
        expect(date <= "2026-05-29").toBe(true);
      });
    } else {
      // No matching rows → empty state should be shown
      expect(screen.getByText(/no transactions match/i)).toBeInTheDocument();
    }
  });
});
