import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

import BulkMatchUpload from "../BulkMatchUpload";

const futureTime = "2099-06-01T18:00:00.000Z";
const pastTime = "2020-01-01T12:00:00.000Z";

function makeCsv(lines: string[]): string {
  return ["Team A,Team B,Match Time", ...lines].join("\n");
}

function pasteAndValidate(csv: string) {
  const textarea = screen.getByPlaceholderText("Or paste CSV rows here…");
  fireEvent.change(textarea, { target: { value: csv } });
  fireEvent.click(screen.getByText("Validate paste"));
}

describe("BulkMatchUpload", () => {
  let onImport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onImport = vi.fn().mockResolvedValue(undefined);
  });

  it("shows per-row errors for a mixed valid/invalid CSV", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `,Liverpool,${futureTime}`,
        `Madrid,Madrid,${futureTime}`,
        `Bayern,Dortmund,${pastTime}`,
        `Inter,Milan,not-a-date`,
      ]),
    );

    expect(screen.getByText("1 valid, 4 invalid")).toBeInTheDocument();

    const row0 = screen.getByTestId("bulk-row-0");
    expect(row0).toHaveTextContent("Valid");

    expect(screen.getByText("Team A is required.")).toBeInTheDocument();
    expect(screen.getByText("Team names must be different.")).toBeInTheDocument();
    expect(screen.getByText("Kickoff must be in the future.")).toBeInTheDocument();
    expect(screen.getByText("Kickoff time is invalid.")).toBeInTheDocument();
  });

  it("detects duplicate rows", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `Arsenal,Chelsea,${futureTime}`,
      ]),
    );

    expect(screen.getByText("Duplicate match.")).toBeInTheDocument();
    expect(screen.getByText("1 valid, 1 invalid")).toBeInTheDocument();
  });

  it("disables import-all when invalid rows exist", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `,Liverpool,${futureTime}`,
      ]),
    );

    const importAllBtn = screen.getByText("Import 1 Match");
    expect(importAllBtn.closest("button")).toBeDisabled();
  });

  it("enables import-all when all rows are valid", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `Bayern,Dortmund,${futureTime}`,
      ]),
    );

    expect(screen.getByText("2 valid, 0 invalid")).toBeInTheDocument();
    const importBtn = screen.getByText("Import 2 Matches");
    expect(importBtn.closest("button")).not.toBeDisabled();
  });

  it("shows 'submit valid only' button when there is a mix", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `,Liverpool,${futureTime}`,
      ]),
    );

    expect(screen.getByTestId("submit-valid-only")).toBeInTheDocument();
    expect(screen.getByTestId("submit-valid-only")).toHaveTextContent(
      "Submit 1 valid only",
    );
  });

  it("submits only valid rows and keeps invalid rows for editing", async () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `,Liverpool,${futureTime}`,
      ]),
    );

    fireEvent.click(screen.getByTestId("submit-valid-only"));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith([
        { teamA: "Arsenal", teamB: "Chelsea", matchTime: futureTime },
      ]);
    });

    expect(screen.getByText("Matches imported successfully.")).toBeInTheDocument();
    expect(screen.getByText("Team A is required.")).toBeInTheDocument();
  });

  it("allows inline editing of invalid rows to fix errors", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([`,Liverpool,${futureTime}`]),
    );

    expect(screen.getByText("Team A is required.")).toBeInTheDocument();

    const teamAInput = screen.getByLabelText("Row 1 Team A");
    fireEvent.change(teamAInput, { target: { value: "Manchester" } });

    expect(screen.queryByText("Team A is required.")).not.toBeInTheDocument();
    expect(screen.getByText("1 valid, 0 invalid")).toBeInTheDocument();
  });

  it("re-validates after inline edit reveals a new error", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([`,Liverpool,${futureTime}`]),
    );

    const teamAInput = screen.getByLabelText("Row 1 Team A");
    fireEvent.change(teamAInput, { target: { value: "Liverpool" } });

    expect(screen.getByText("Team names must be different.")).toBeInTheDocument();
  });

  it("submits all rows when import-all is clicked and all valid", async () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `Bayern,Dortmund,${futureTime}`,
      ]),
    );

    fireEvent.click(screen.getByText("Import 2 Matches"));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith([
        { teamA: "Arsenal", teamB: "Chelsea", matchTime: futureTime },
        { teamA: "Bayern", teamB: "Dortmund", matchTime: futureTime },
      ]);
    });
  });

  it("blocks import when max match limit would be exceeded", async () => {
    render(
      <BulkMatchUpload currentMatchCount={99} maxMatches={100} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `Bayern,Dortmund,${futureTime}`,
      ]),
    );

    fireEvent.click(screen.getByText("Import 2 Matches"));

    await waitFor(() => {
      expect(screen.getByText(/Only 1 more match/)).toBeInTheDocument();
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it("removes a single invalid row", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([
        `Arsenal,Chelsea,${futureTime}`,
        `,Liverpool,${futureTime}`,
      ]),
    );

    fireEvent.click(screen.getByText("Remove row"));

    expect(screen.queryByText("Team A is required.")).not.toBeInTheDocument();
    expect(screen.getByText("1 valid, 0 invalid")).toBeInTheDocument();
  });

  it("does not show 'submit valid only' when all rows are valid", () => {
    render(
      <BulkMatchUpload currentMatchCount={0} onImport={onImport} />,
    );

    pasteAndValidate(
      makeCsv([`Arsenal,Chelsea,${futureTime}`]),
    );

    expect(screen.queryByTestId("submit-valid-only")).not.toBeInTheDocument();
  });
});
