import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BatchResultSubmission, {
  type BatchResultOutcome,
  type BatchResultRow,
} from "./BatchResultSubmission";

let CSV_CONTENT = "";

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload:
    | ((this: MockFileReader, ev: { target: MockFileReader }) => void)
    | null = null;

  readAsText(_file: File) {
    // jsdom File lacks .text(); read from the captured CSV stub instead.
    this.result = CSV_CONTENT;
    if (this.onload) {
      this.onload.call(this, { target: this });
    }
  }
}

function renderBatch(onSubmit = vi.fn<(r: BatchResultRow[]) => Promise<BatchResultOutcome[]>>()) {
  const utils = render(<BatchResultSubmission onSubmitBatch={onSubmit} />);
  return { ...utils, onSubmit };
}

function uploadCsv(text: string, name = "results.csv") {
  CSV_CONTENT = text;
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

const CSV_OK = ["mkt-001,TEAM_A,api-1", "mkt-002,TEAM_B,api-2"].join("\n");
const CSV_MIXED = ["mkt-001,TEAM_A", "mkt-002,INVALID"].join("\n");

describe("BatchResultSubmission", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses CSV into a pre-submit review table with valid and error counts", async () => {
    renderBatch();
    uploadCsv(CSV_MIXED);

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
      expect(screen.getByText("mkt-002")).toBeInTheDocument();
      expect(screen.getByText("✓ 1 valid")).toBeInTheDocument();
      expect(screen.getByText("✗ 1 errors")).toBeInTheDocument();
    });

    // Error row shows "Error" status; valid row shows pending.
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("shows source column from the optional CSV third field", async () => {
    renderBatch();
    uploadCsv(CSV_OK);

    await waitFor(() => {
      expect(screen.getByText("api-1")).toBeInTheDocument();
      expect(screen.getByText("api-2")).toBeInTheDocument();
    });
  });

  it("marks a row confirmed on success and failed on failure, then retries only failures", async () => {
    const onSubmit = vi.fn<
      (r: BatchResultRow[]) => Promise<BatchResultOutcome[]>
    >(async (rows) =>
      rows.map((r) =>
        r.matchId === "mkt-001"
          ? { matchId: r.matchId, success: true }
          : { matchId: r.matchId, success: false, error: "rejected by chain" },
      ),
    );
    renderBatch(onSubmit);

    uploadCsv(["mkt-001,TEAM_A", "mkt-002,TEAM_B"].join("\n"));

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
      expect(screen.getByText("mkt-002")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /submit 2 results/i }));

    await waitFor(() => {
      expect(screen.getByText("Confirmed", { selector: "span" })).toBeInTheDocument();
      expect(screen.getByText("Failed", { selector: "span" })).toBeInTheDocument();
    });

    // Partial failure message + retry button.
    expect(
      screen.getByText(/1 of 2 results failed to submit/i),
    ).toBeInTheDocument();

    // Retry should submit ONLY the failed match (mkt-002) — not mkt-001.
    fireEvent.click(screen.getByRole("button", { name: /retry 1 failed/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    const secondCall = onSubmit.mock.calls[1][0];
    expect(secondCall).toHaveLength(1);
    expect(secondCall[0].matchId).toBe("mkt-002");
  });

  it("prevents double submit while a batch is in flight", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onSubmit = vi.fn(async () => {
      await gate;
      return [];
    });
    renderBatch(onSubmit);

    uploadCsv(["mkt-001,TEAM_A"].join("\n"));

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /submit 1 result/i });
    fireEvent.click(submitBtn);
    expect(submitBtn).toBeDisabled();

    await act(async () => {
      release?.();
    });
  });

  it("allows editing the outcome of a row in the review table", async () => {
    renderBatch();
    uploadCsv(["mkt-001,TEAM_A"].join("\n"));

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
    });

    // Enter edit mode.
    fireEvent.click(
      screen.getByRole("button", { name: /edit outcome for mkt-001/i }),
    );

    // Pick DRAW from the inline options.
    fireEvent.click(screen.getByRole("button", { name: "DRAW" }));

    // The row now reflects DRAW.
    await waitFor(() => {
      expect(screen.getByText("DRAW")).toBeInTheDocument();
    });

    // It is still a valid row (1 valid).
    expect(screen.getByText("✓ 1 valid")).toBeInTheDocument();
  });

  it("allows removing a row from the review table", async () => {
    renderBatch();
    uploadCsv(["mkt-001,TEAM_A", "mkt-002,TEAM_B"].join("\n"));

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
      expect(screen.getByText("mkt-002")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /remove mkt-001/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("mkt-001")).not.toBeInTheDocument();
    });
    expect(screen.getByText("mkt-002")).toBeInTheDocument();
    expect(screen.getByText("✓ 1 valid")).toBeInTheDocument();
  });

  it("asks for confirmation before large batches", async () => {
    const onSubmit = vi.fn<
      (r: BatchResultRow[]) => Promise<BatchResultOutcome[]>
    >(async () => []);
    renderBatch(onSubmit);

    // 5 rows triggers the confirmation dialog (CONFIRM_BATCH_THRESHOLD = 5).
    const csv = Array.from(
      { length: 5 },
      (_, i) => `mkt-0${i + 1},TEAM_A`,
    ).join("\n");
    uploadCsv(csv);

    await waitFor(() => {
      expect(screen.getByText("mkt-01")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /submit 5 results/i }));

    // Confirmation dialog shown, submission not yet fired.
    expect(screen.getByText("Submit 5 results?")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Cancel keeps rows and does not submit.
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    expect(onSubmit).not.toHaveBeenCalled();

    // Confirm submits the whole batch.
    fireEvent.click(screen.getByRole("button", { name: /submit 5 results/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit batch/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toHaveLength(5);
  });

  it("shows overall progress bar after partial success", async () => {
    const onSubmit = vi.fn(async (rows: BatchResultRow[]) =>
      rows.map((r) =>
        r.matchId === "mkt-001"
          ? { matchId: r.matchId, success: true }
          : { matchId: r.matchId, success: false, error: "nope" },
      ),
    );
    renderBatch(onSubmit);

    uploadCsv(["mkt-001,TEAM_A", "mkt-002,TEAM_B", "mkt-003,TEAM_A"].join("\n"));

    await waitFor(() => {
      expect(screen.getByText("mkt-001")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /submit 3 results/i }));

    await waitFor(() => {
      expect(screen.getByText("1 of 3 confirmed")).toBeInTheDocument();
      expect(screen.getByText("· 2 failed")).toBeInTheDocument();
    });
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 confirmed")).toBeInTheDocument();
  });
});