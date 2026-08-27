import { describe, expect, it } from "vitest";
import {
  buildTableOfContents,
  computePositionPnl,
  filterDocSections,
  positionsToCsv,
  sumPnlBreakdown,
  type PortfolioCsvPosition,
} from "./utils";

describe("computePositionPnl", () => {
  it("treats a settled winning position's P&L as fully realized", () => {
    const result = computePositionPnl({ pnl: "50000000", status: "settled" });
    expect(result).toEqual({ realized: 50_000_000, unrealized: 0 });
  });

  it("treats a settled losing position's P&L as fully realized (negative)", () => {
    const result = computePositionPnl({ pnl: "-20000000", status: "settled" });
    expect(result).toEqual({ realized: -20_000_000, unrealized: 0 });
  });

  it("treats an open position's P&L as fully unrealized", () => {
    const result = computePositionPnl({ pnl: "15000000", status: "open" });
    expect(result).toEqual({ realized: 0, unrealized: 15_000_000 });
  });

  it("treats an open position with a negative mark-to-market as unrealized", () => {
    const result = computePositionPnl({ pnl: "-5000000", status: "open" });
    expect(result).toEqual({ realized: 0, unrealized: -5_000_000 });
  });

  it("falls back to 0 for a non-numeric pnl value", () => {
    const result = computePositionPnl({ pnl: "not-a-number", status: "open" });
    expect(result).toEqual({ realized: 0, unrealized: 0 });
  });
});

describe("sumPnlBreakdown", () => {
  it("aggregates realized and unrealized P&L across mixed positions", () => {
    const totals = sumPnlBreakdown([
      { pnl: "50000000", status: "settled" }, // realized win
      { pnl: "-20000000", status: "settled" }, // realized loss
      { pnl: "15000000", status: "open" }, // unrealized gain
      { pnl: "-5000000", status: "open" }, // unrealized loss
    ]);

    expect(totals).toEqual({
      realized: 30_000_000, // 50M - 20M
      unrealized: 10_000_000, // 15M - 5M
    });
  });

  it("returns zeros for an empty position list", () => {
    expect(sumPnlBreakdown([])).toEqual({ realized: 0, unrealized: 0 });
  });
});

describe("positionsToCsv", () => {
  function buildPosition(
    overrides: Partial<PortfolioCsvPosition> = {},
  ): PortfolioCsvPosition {
    return {
      market_title: "BTC above $95,000",
      outcome: "Yes",
      status: "settled",
      stake: "100000000",
      current_value: "150000000",
      pnl: "50000000",
      placed_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-05T00:00:00Z",
      ...overrides,
    };
  }

  it("includes the expected header columns", () => {
    const csv = positionsToCsv([buildPosition()]);
    const [header] = csv.split("\n");
    expect(header).toBe(
      [
        "Market",
        "Outcome",
        "Status",
        "Stake (XLM)",
        "Current Value (XLM)",
        "Realized P&L (XLM)",
        "Unrealized P&L (XLM)",
        "Total P&L (XLM)",
        "Placed At",
        "Resolved At",
      ].join(","),
    );
  });

  it("writes a data row with correctly converted XLM amounts for a settled position", () => {
    const csv = positionsToCsv([buildPosition()]);
    const [, row] = csv.split("\n");
    expect(row).toBe(
      '"BTC above $95,000",Yes,settled,10.00,15.00,5.00,0.00,5.00,2026-01-01T00:00:00Z,2026-01-05T00:00:00Z',
    );
  });

  it("writes an open position's P&L into the unrealized column", () => {
    const csv = positionsToCsv([
      buildPosition({
        status: "open",
        pnl: "20000000",
        resolved_at: null,
      }),
    ]);
    const [, row] = csv.split("\n");
    expect(row).toBe(
      '"BTC above $95,000",Yes,open,10.00,15.00,0.00,2.00,2.00,2026-01-01T00:00:00Z,',
    );
  });

  it("escapes values containing commas or quotes", () => {
    const csv = positionsToCsv([
      buildPosition({ market_title: 'Market, with "quotes"' }),
    ]);
    const [, row] = csv.split("\n");
    expect(row.startsWith('"Market, with ""quotes"""')).toBe(true);
  });

  it("produces one row per position, in order", () => {
    const csv = positionsToCsv([
      buildPosition({ market_title: "Market A" }),
      buildPosition({ market_title: "Market B", status: "open" }),
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("Market A");
    expect(lines[2]).toContain("Market B");
  });
});

const docSections = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Learn the basics of the platform.",
    content: "Welcome! You'll need a compatible wallet to begin.",
  },
  {
    id: "wallet-connection",
    title: "Wallet Connection",
    description: "Connect your digital wallet.",
    content: "Download a supported wallet and click connect.",
  },
  {
    id: "trading-guide",
    title: "How to Trade",
    description: "Step-by-step guide to placing a trade.",
    content: "Select a market, choose an outcome, and stake credits.",
  },
];

describe("buildTableOfContents", () => {
  it("maps each section to a TOC entry with the same id and title, preserving order", () => {
    expect(buildTableOfContents(docSections)).toEqual([
      { id: "getting-started", title: "Getting Started" },
      { id: "wallet-connection", title: "Wallet Connection" },
      { id: "trading-guide", title: "How to Trade" },
    ]);
  });

  it("returns one heading-anchored entry per section, with no extras or omissions", () => {
    const toc = buildTableOfContents(docSections);
    expect(toc).toHaveLength(docSections.length);
    expect(toc.map((entry) => entry.id)).toEqual(
      docSections.map((section) => section.id)
    );
  });

  it("returns an empty list for an empty input", () => {
    expect(buildTableOfContents([])).toEqual([]);
  });
});

describe("filterDocSections", () => {
  it("returns every section when the query is empty or whitespace", () => {
    expect(filterDocSections(docSections, "")).toEqual(docSections);
    expect(filterDocSections(docSections, "   ")).toEqual(docSections);
  });

  it("matches case-insensitively against the title", () => {
    const result = filterDocSections(docSections, "WALLET connection");
    expect(result.map((s) => s.id)).toEqual(["wallet-connection"]);
  });

  it("matches against the description when the title doesn't match", () => {
    const result = filterDocSections(docSections, "digital wallet");
    expect(result.map((s) => s.id)).toEqual(["wallet-connection"]);
  });

  it("matches against the body content when neither title nor description match", () => {
    const result = filterDocSections(docSections, "stake credits");
    expect(result.map((s) => s.id)).toEqual(["trading-guide"]);
  });

  it("returns multiple matches when more than one section matches the query", () => {
    const result = filterDocSections(docSections, "wallet");
    expect(result.map((s) => s.id)).toEqual([
      "getting-started",
      "wallet-connection",
    ]);
  });

  it("returns an empty array when no section matches", () => {
    expect(filterDocSections(docSections, "nonexistent-topic")).toEqual([]);
  });
});
