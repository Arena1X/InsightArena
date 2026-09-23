import { describe, expect, it } from "vitest";

import {
  parseBulkMatchCsv,
  validateBulkMatchRows,
} from "./validators";

const futureKickoff = "2099-06-01T18:00:00.000Z";
const pastKickoff = "2020-01-01T12:00:00.000Z";

describe("bulk match upload validation", () => {
  it("surfaces the right per-row errors for mixed valid and invalid input", () => {
    const rows = parseBulkMatchCsv(
      [
        "Team A,Team B,Match Time",
        `Arsenal,Chelsea,${futureKickoff}`,
        `,Liverpool,${futureKickoff}`,
        `Madrid,Madrid,${futureKickoff}`,
        `Bayern,Dortmund,${pastKickoff}`,
        `Arsenal,Chelsea,${futureKickoff}`,
        "Inter,Milan,not-a-date",
      ].join("\n"),
    );

    const results = validateBulkMatchRows(rows, new Date("2026-01-01T00:00:00.000Z"));

    expect(results).toHaveLength(6);
    expect(results[0].errors).toEqual([]);
    expect(results[1].errors).toContain("Team A is required.");
    expect(results[2].errors).toContain("Team names must be different.");
    expect(results[3].errors).toContain("Kickoff must be in the future.");
    expect(results[4].errors).toContain("Duplicate match.");
    expect(results[5].errors).toContain("Kickoff time is invalid.");
  });
});
