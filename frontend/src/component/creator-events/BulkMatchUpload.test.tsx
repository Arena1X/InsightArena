import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BulkMatchUpload, { parseCSV } from "./BulkMatchUpload";

const futureTime = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const pastTime = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe("parseCSV", () => {
  it("parses valid rows without errors", () => {
    const csv = `Green Lions,Blue Sharks,${futureTime()}`;
    const rows = parseCSV(csv, []);

    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0]).toMatchObject({ teamA: "Green Lions", teamB: "Blue Sharks" });
  });

  it("flags missing team names", () => {
    const rows = parseCSV(`,Blue Sharks,${futureTime()}`, []);

    expect(rows[0].errors).toContain("Team A is required.");
  });

  it("flags empty match time", () => {
    const rows = parseCSV("Green Lions,Blue Sharks,", []);

    expect(rows[0].errors).toContain("Match time is required.");
  });

  it("flags invalid ISO 8601 dates", () => {
    const rows = parseCSV("Green Lions,Blue Sharks,not-a-date", []);

    expect(rows[0].errors).toContain("Invalid ISO 8601 date.");
  });

  it("flags match times in the past", () => {
    const rows = parseCSV(`Green Lions,Blue Sharks,${pastTime()}`, []);

    expect(rows[0].errors).toContain("Match time must be in the future.");
  });

  it("flags identical team names", () => {
    const rows = parseCSV(`Same Team,Same Team,${futureTime()}`, []);

    expect(rows[0].errors).toContain("Team names must be different.");
  });

  it("flags rows that duplicate existing matches", () => {
    const existing = [{ teamA: "Green Lions", teamB: "Blue Sharks" }];
    const rows = parseCSV(`Green Lions,Blue Sharks,${futureTime()}`, existing);

    expect(rows[0].errors).toContain(
      'Duplicate match: "Green Lions" vs "Blue Sharks" already exists.',
    );
  });

  it("flags duplicate rows within the same file", () => {
    const csv = `Red Hawks,White Wolves,${futureTime()}\nRed Hawks,White Wolves,${futureTime()}`;
    const rows = parseCSV(csv, []);

    expect(rows[1].errors).toContain('Duplicate: row 1 already has "Red Hawks" vs "White Wolves".');
  });

  it("enforces the max team name length", () => {
    const longTeam = "A".repeat(101);
    const rows = parseCSV(`${longTeam},Blue Sharks,${futureTime()}`, []);

    expect(rows[0].errors.some((e) => e.includes("Team A must be at most 100"))).toBe(true);
  });

  it("yields per-row errors for a mixed valid/invalid file", () => {
    const csv = [
      `Green Lions,Blue Sharks,${futureTime()}`, // valid
      `,Blue Sharks,${futureTime()}`,            // missing team A
      `Red Hawks,red hawks,${futureTime()}`,     // identical team names
    ].join("\n");

    const rows = parseCSV(csv, []);

    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain("Team A is required.");
    expect(rows[2].errors).toContain("Team names must be different.");
  });
});

describe("BulkMatchUpload", () => {
  const onImport = vi.fn().mockResolvedValue(undefined);

  function uploadFile(container: HTMLElement, content: string) {
    const file = new File([content], "matches.csv", { type: "text/csv" });
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("File input not found");
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("renders the file upload prompt", () => {
    render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    expect(screen.getByText("Bulk Add Matches")).toBeInTheDocument();
    expect(screen.getByText("Click to upload CSV")).toBeInTheDocument();
  });

  it("shows valid and error counts after uploading a mixed file", async () => {
    const { container } = render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    const csv = [
      `Green Lions,Blue Sharks,${futureTime()}`,
      `,Blue Sharks,${futureTime()}`,
    ].join("\n");
    uploadFile(container, csv);

    await waitFor(() => expect(screen.getByText(/1 valid/)).toBeInTheDocument());
    expect(screen.getByText(/1 error/)).toBeInTheDocument();
  });

  it("shows per-row error messages in the table", async () => {
    const { container } = render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    uploadFile(container, `,Blue Sharks,${futureTime()}`);

    await waitFor(() =>
      expect(screen.getAllByText(/Team A is required/).length).toBeGreaterThan(0),
    );
  });

  it("provides an edit action for invalid rows and allows fixing them", async () => {
    const { container } = render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    const csv = [
      `Green Lions,Blue Sharks,${futureTime()}`,
      `,Blue Sharks,${futureTime()}`,
    ].join("\n");
    uploadFile(container, csv);

    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));

    // Find the edit button (pencil icon) — it only renders for invalid rows
    const editButtons = await screen.findAllByTitle("Edit row");
    expect(editButtons).toHaveLength(1);
    fireEvent.click(editButtons[0]);

    // The row enters editing mode with input fields
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    // Fix team A
    fireEvent.change(inputs[0], { target: { value: "Fixed Lions" } });

    // Save
    fireEvent.click(screen.getByTitle("Save"));

    // Error should disappear, valid count becomes 2
    await waitFor(() => expect(screen.getByText(/2 valid/)).toBeInTheDocument());
    expect(screen.queryByText("Team A is required.")).not.toBeInTheDocument();
  });

  it("imports only valid rows when a mixed file is submitted", async () => {
    const { container } = render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    const csv = [
      `Green Lions,Blue Sharks,${futureTime()}`,
      `,Blue Sharks,${futureTime()}`,
    ].join("\n");
    uploadFile(container, csv);

    await waitFor(() => expect(screen.getByText(/1 valid/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/^Import 1 Match/));

    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith([
        { teamA: "Green Lions", teamB: "Blue Sharks", matchTime: expect.any(String) },
      ]),
    );
  });

  it("disables the import button when there are no valid rows", async () => {
    const { container } = render(<BulkMatchUpload currentMatchCount={0} onImport={onImport} />);

    uploadFile(container, `,Blue Sharks,${futureTime()}`);

    await waitFor(() => expect(screen.getByText(/0 valid/)).toBeInTheDocument());

    const importButton = screen.getByText(/^Import 0 Matches/);
    expect(importButton).toBeDisabled();
  });
});