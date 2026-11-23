/**
 * Tests for Bulk match entry for creator events — Issue #2158
 *
 * Covers:
 *  1. Multiple valid rows are added in one submit.
 *  2. Row-level errors are shown for invalid rows.
 *  3. Valid rows submit while invalid ones remain for correction.
 *  4. Integration with MatchManagementPage bulk-entry mode.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BulkMatchEntry from "../BulkMatchEntry";
import MatchManagementPage from "@/app/(authenticated)/creator-events/[id]/matches/page";

const futureTime1 = "2099-06-01T18:00";
const futureTime2 = "2099-06-02T20:00";
const pastTime = "2020-01-01T12:00";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "event-001" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
  }),
}));

vi.mock("@/hooks/useCreatorEvents", () => ({
  useCreatorEvents: () => ({
    submitMatchResult: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("BulkMatchEntry (Issue #2158)", () => {
  let onSubmitValid: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmitValid = vi.fn().mockResolvedValue(undefined);
  });

  it("adds multiple valid rows in one submit", async () => {
    render(<BulkMatchEntry onSubmitValid={onSubmitValid} />);

    fireEvent.change(screen.getByLabelText("Bulk row 1 Team A"), {
      target: { value: "Arsenal" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Team B"), {
      target: { value: "Chelsea" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Match Time"), {
      target: { value: futureTime1 },
    });

    fireEvent.change(screen.getByLabelText("Bulk row 2 Team A"), {
      target: { value: "Bayern" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 2 Team B"), {
      target: { value: "Dortmund" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 2 Match Time"), {
      target: { value: futureTime2 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit Matches" }));

    await waitFor(() => {
      expect(onSubmitValid).toHaveBeenCalledTimes(1);
      expect(onSubmitValid).toHaveBeenCalledWith([
        {
          teamA: "Arsenal",
          teamB: "Chelsea",
          matchTime: futureTime1,
          multiplier: 1,
        },
        {
          teamA: "Bayern",
          teamB: "Dortmund",
          matchTime: futureTime2,
          multiplier: 1,
        },
      ]);
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Added 2 matches successfully.",
    );
  });

  it("shows row-level errors for invalid rows", async () => {
    render(<BulkMatchEntry onSubmitValid={onSubmitValid} />);

    // Row 1: identical team names & past kickoff
    fireEvent.change(screen.getByLabelText("Bulk row 1 Team A"), {
      target: { value: "Madrid" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Team B"), {
      target: { value: "Madrid" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Match Time"), {
      target: { value: pastTime },
    });

    // Row 2: missing Team A
    fireEvent.change(screen.getByLabelText("Bulk row 2 Team B"), {
      target: { value: "Liverpool" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 2 Match Time"), {
      target: { value: futureTime1 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit Matches" }));

    await waitFor(() => {
      expect(screen.getByTestId("bulk-entry-row-errors-0")).toBeInTheDocument();
      expect(screen.getByTestId("bulk-entry-row-errors-1")).toBeInTheDocument();
    });

    expect(onSubmitValid).not.toHaveBeenCalled();

    const row0Errors = screen.getByTestId("bulk-entry-row-errors-0");
    expect(within(row0Errors).getByText("Team names must be different.")).toBeInTheDocument();
    expect(within(row0Errors).getByText("Kickoff must be in the future.")).toBeInTheDocument();

    const row1Errors = screen.getByTestId("bulk-entry-row-errors-1");
    expect(within(row1Errors).getByText("Team A is required.")).toBeInTheDocument();
  });

  it("submits valid rows while keeping invalid rows for correction", async () => {
    render(<BulkMatchEntry onSubmitValid={onSubmitValid} />);

    // Add a 3rd row
    fireEvent.click(screen.getByRole("button", { name: "Add Row" }));

    // Row 1: valid
    fireEvent.change(screen.getByLabelText("Bulk row 1 Team A"), {
      target: { value: "Arsenal" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Team B"), {
      target: { value: "Chelsea" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 1 Match Time"), {
      target: { value: futureTime1 },
    });

    // Row 2: invalid (missing Team A)
    fireEvent.change(screen.getByLabelText("Bulk row 2 Team B"), {
      target: { value: "Liverpool" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 2 Match Time"), {
      target: { value: futureTime2 },
    });

    // Row 3: valid
    fireEvent.change(screen.getByLabelText("Bulk row 3 Team A"), {
      target: { value: "Inter" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 3 Team B"), {
      target: { value: "Milan" },
    });
    fireEvent.change(screen.getByLabelText("Bulk row 3 Match Time"), {
      target: { value: futureTime2 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit Matches" }));

    await waitFor(() => {
      expect(onSubmitValid).toHaveBeenCalledTimes(1);
      expect(onSubmitValid).toHaveBeenCalledWith([
        {
          teamA: "Arsenal",
          teamB: "Chelsea",
          matchTime: futureTime1,
          multiplier: 1,
        },
        {
          teamA: "Inter",
          teamB: "Milan",
          matchTime: futureTime2,
          multiplier: 1,
        },
      ]);
    });

    // Status reports 2 added and 1 invalid row kept
    expect(screen.getByRole("status")).toHaveTextContent(
      "Added 2 valid matches. 1 invalid row kept for correction.",
    );

    // Only the invalid row remains in the form with its error
    expect(screen.getByTestId("bulk-entry-row-0")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-entry-row-1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Bulk row 1 Team B")).toHaveValue("Liverpool");
    expect(screen.getByText("Team A is required.")).toBeInTheDocument();
  });

  it("supports bulk entry mode on MatchManagementPage and adds valid matches to the list", async () => {
    render(<MatchManagementPage />);

    // Switch from Single Match to Bulk Entry tab
    const bulkTab = await screen.findByRole("tab", { name: "Bulk Entry" });
    fireEvent.click(bulkTab);

    // Use Paste Rows to load 2 valid rows and 1 invalid row
    fireEvent.click(screen.getByRole("button", { name: "Paste Rows" }));
    fireEvent.change(screen.getByLabelText(/Paste lines as/i), {
      target: {
        value: [
          `Lions,Tigers,${futureTime1}`,
          `,Hawks,${futureTime2}`,
          `Eagles,Sharks,${futureTime2}`,
        ].join("\n"),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load Pasted Rows" }));

    fireEvent.click(screen.getByRole("button", { name: "Submit Matches" }));

    await waitFor(() => {
      expect(screen.getByText(/5\/100 matches added/)).toBeInTheDocument();
      expect(screen.getByText(/Lions/)).toBeInTheDocument();
      expect(screen.getByText(/Tigers/)).toBeInTheDocument();
      expect(screen.getByText(/Eagles/)).toBeInTheDocument();
      expect(screen.getByText(/Sharks/)).toBeInTheDocument();
    });

    // The invalid row remains for correction
    expect(screen.getByLabelText("Bulk row 1 Team B")).toHaveValue("Hawks");
    expect(screen.getByText("Team A is required.")).toBeInTheDocument();
  });
});
