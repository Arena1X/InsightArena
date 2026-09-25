import { describe, expect, it } from "vitest";
import {
  buildTableOfContents,
  computePositionPnl,
  filterDocSections,
  positionsToCsv,
  sortLeaderboardWithTieBreak,
  detectTies,
  sumPnlBreakdown,
  fillSparseHistory,
  aggregatePnlByPeriod,
  formatPnlForChart,
  calculatePnlSummary,
  type PortfolioCsvPosition,
  type LeaderboardEntryForTieBreak,
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

// ── Portfolio P/L History Tests (#1581) ────────────────────────────────────

describe("fillSparseHistory", () => {
  it("returns empty array for empty input", () => {
    expect(fillSparseHistory([], "7d")).toEqual([]);
  });

  it("returns single item unchanged", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
    ];
    expect(fillSparseHistory(data, "7d")).toEqual(data);
  });

  it("fills gaps in 7-day range with forward-filled values", () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(today.getDate() - 5);

    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    // Create data with gaps
    const data = [
      {
        date: fiveDaysAgo.toISOString().split("T")[0],
        timestamp: Math.floor(fiveDaysAgo.getTime() / 1000),
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
      {
        date: threeDaysAgo.toISOString().split("T")[0],
        timestamp: Math.floor(threeDaysAgo.getTime() / 1000),
        realized_pnl: 2000,
        unrealized_pnl: 600,
        total_pnl: 2600,
      },
    ];

    const filled = fillSparseHistory(data, "7d");

    // Should have entries for approximately the last 7-8 days
    expect(filled.length).toBeGreaterThanOrEqual(7);
    expect(filled.length).toBeLessThanOrEqual(9);

    // Find indices of our data points
    const firstDataIndex = filled.findIndex((d) => d.date === data[0].date);
    const secondDataIndex = filled.findIndex((d) => d.date === data[1].date);

    expect(firstDataIndex).toBeGreaterThanOrEqual(0);
    expect(secondDataIndex).toBeGreaterThan(firstDataIndex);

    // Days between first and second data point should be forward-filled with first data values
    for (let i = firstDataIndex + 1; i < secondDataIndex; i++) {
      expect(filled[i].realized_pnl).toBe(1000);
      expect(filled[i].unrealized_pnl).toBe(500);
      expect(filled[i].total_pnl).toBe(1500);
    }

    // Days after second data point should have second data values
    for (let i = secondDataIndex + 1; i < filled.length; i++) {
      expect(filled[i].realized_pnl).toBe(2000);
      expect(filled[i].unrealized_pnl).toBe(600);
      expect(filled[i].total_pnl).toBe(2600);
    }
  });

  it("uses zeros for dates before any data exists", () => {
    const today = new Date();
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(today.getDate() - 1);

    const data = [
      {
        date: oneDayAgo.toISOString().split("T")[0],
        timestamp: Math.floor(oneDayAgo.getTime() / 1000),
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
    ];

    const filled = fillSparseHistory(data, "7d");

    // Entries before the data point should have zeros
    const dataIndex = filled.findIndex((d) => d.date === data[0].date);
    for (let i = 0; i < dataIndex; i++) {
      expect(filled[i].realized_pnl).toBe(0);
      expect(filled[i].unrealized_pnl).toBe(0);
      expect(filled[i].total_pnl).toBe(0);
    }
  });

  it("returns data unchanged for 'all' range", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
      {
        date: "2024-01-05",
        timestamp: 1704412800,
        realized_pnl: 2000,
        unrealized_pnl: 600,
        total_pnl: 2600,
      },
    ];

    const filled = fillSparseHistory(data, "all");
    expect(filled).toEqual(data);
  });

  it("handles data in non-chronological order", () => {
    const data = [
      {
        date: "2024-01-05",
        timestamp: 1704412800,
        realized_pnl: 2000,
        unrealized_pnl: 600,
        total_pnl: 2600,
      },
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
    ];

    const filled = fillSparseHistory(data, "7d");

    // Should be sorted chronologically in output
    for (let i = 1; i < filled.length; i++) {
      expect(filled[i].timestamp).toBeGreaterThanOrEqual(filled[i - 1].timestamp);
    }
  });
});

describe("aggregatePnlByPeriod", () => {
  it("returns empty array for empty input", () => {
    expect(aggregatePnlByPeriod([], 7)).toEqual([]);
  });

  it("returns data unchanged when period is 1 or less", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
      {
        date: "2024-01-02",
        timestamp: 1704153600,
        realized_pnl: 1100,
        unrealized_pnl: 550,
        total_pnl: 1650,
      },
    ];

    expect(aggregatePnlByPeriod(data, 1)).toEqual(data);
    expect(aggregatePnlByPeriod(data, 0)).toEqual(data);
  });

  it("aggregates data into weekly periods", () => {
    const data = Array.from({ length: 14 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      timestamp: 1704067200 + i * 86400,
      realized_pnl: 1000 + i * 100,
      unrealized_pnl: 500 + i * 50,
      total_pnl: 1500 + i * 150,
    }));

    const aggregated = aggregatePnlByPeriod(data, 7);

    // Should have 2 periods (day 1-7, day 8-14)
    expect(aggregated.length).toBe(2);

    // First period should use values from day 7
    expect(aggregated[0].realized_pnl).toBe(1600);
    expect(aggregated[0].unrealized_pnl).toBe(800);

    // Second period should use values from day 14
    expect(aggregated[1].realized_pnl).toBe(2300);
    expect(aggregated[1].unrealized_pnl).toBe(1150);
  });

  it("handles partial final period", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      timestamp: 1704067200 + i * 86400,
      realized_pnl: 1000 + i * 100,
      unrealized_pnl: 500 + i * 50,
      total_pnl: 1500 + i * 150,
    }));

    const aggregated = aggregatePnlByPeriod(data, 7);

    // Should have 2 periods (day 1-7, day 8-10)
    expect(aggregated.length).toBe(2);

    // Second period uses last available day (day 10)
    expect(aggregated[1].realized_pnl).toBe(1900);
  });
});

describe("formatPnlForChart", () => {
  it("formats positive stroops values correctly", () => {
    expect(formatPnlForChart(10_000_000)).toBe("+1.00 XLM");
    expect(formatPnlForChart(50_000_000)).toBe("+5.00 XLM");
    expect(formatPnlForChart(5_000_000)).toBe("+0.50 XLM");
  });

  it("formats negative stroops values correctly", () => {
    expect(formatPnlForChart(-10_000_000)).toBe("-1.00 XLM");
    expect(formatPnlForChart(-50_000_000)).toBe("-5.00 XLM");
  });

  it("formats zero correctly", () => {
    expect(formatPnlForChart(0)).toBe("0.00 XLM");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatPnlForChart(12_345_678)).toBe("+1.23 XLM");
    expect(formatPnlForChart(-12_345_678)).toBe("-1.23 XLM");
  });
});

describe("calculatePnlSummary", () => {
  it("returns zeros for empty data", () => {
    const summary = calculatePnlSummary([]);

    expect(summary.totalRealized).toBe(0);
    expect(summary.totalUnrealized).toBe(0);
    expect(summary.totalPnl).toBe(0);
    expect(summary.realizedPercentage).toBe(0);
    expect(summary.unrealizedPercentage).toBe(0);
  });

  it("calculates summary from latest data point", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 1000,
        unrealized_pnl: 500,
        total_pnl: 1500,
      },
      {
        date: "2024-01-02",
        timestamp: 1704153600,
        realized_pnl: 2000,
        unrealized_pnl: 800,
        total_pnl: 2800,
      },
    ];

    const summary = calculatePnlSummary(data);

    // Should use values from the last data point
    expect(summary.totalRealized).toBe(2000);
    expect(summary.totalUnrealized).toBe(800);
    expect(summary.totalPnl).toBe(2800);
  });

  it("calculates percentages correctly", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 6000,
        unrealized_pnl: 4000,
        total_pnl: 10000,
      },
    ];

    const summary = calculatePnlSummary(data);

    expect(summary.realizedPercentage).toBe(60);
    expect(summary.unrealizedPercentage).toBe(40);
  });

  it("handles negative total P/L correctly", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: -3000,
        unrealized_pnl: -2000,
        total_pnl: -5000,
      },
    ];

    const summary = calculatePnlSummary(data);

    expect(summary.totalPnl).toBe(-5000);
    expect(summary.realizedPercentage).toBe(60);
    expect(summary.unrealizedPercentage).toBe(40);
  });

  it("handles zero total P/L", () => {
    const data = [
      {
        date: "2024-01-01",
        timestamp: 1704067200,
        realized_pnl: 0,
        unrealized_pnl: 0,
        total_pnl: 0,
      },
    ];

    const summary = calculatePnlSummary(data);

    expect(summary.realizedPercentage).toBe(0);
    expect(summary.unrealizedPercentage).toBe(0);
  });
});

// ── Event Leaderboard Tie-Break Tests (#1549) ──────────────────────────────

describe("sortLeaderboardWithTieBreak", () => {
  it("sorts by points descending as the primary key", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 100, exactScores: 1 },
      { address: "addr2", points: 300, exactScores: 2 },
      { address: "addr3", points: 200, exactScores: 1 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    expect(sorted.map((e) => e.address)).toEqual(["addr2", "addr3", "addr1"]);
    expect(sorted.map((e) => e.points)).toEqual([300, 200, 100]);
  });

  it("breaks ties by exact_scores descending when points are equal", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 1 },
      { address: "addr2", points: 200, exactScores: 3 },
      { address: "addr3", points: 200, exactScores: 2 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    expect(sorted.map((e) => e.address)).toEqual(["addr2", "addr3", "addr1"]);
    expect(sorted.map((e) => e.exactScores)).toEqual([3, 2, 1]);
  });

  it("breaks ties by earliest prediction time when points and exact_scores are equal", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 2, earliestPredictionTime: 1000 },
      { address: "addr2", points: 200, exactScores: 2, earliestPredictionTime: 500 },
      { address: "addr3", points: 200, exactScores: 2, earliestPredictionTime: 1500 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    expect(sorted.map((e) => e.address)).toEqual(["addr2", "addr1", "addr3"]);
    expect(sorted.map((e) => e.earliestPredictionTime)).toEqual([500, 1000, 1500]);
  });

  it("breaks ties by address comparison when all other fields are equal", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "GCZZ...", points: 200, exactScores: 2, earliestPredictionTime: 1000 },
      { address: "GAAA...", points: 200, exactScores: 2, earliestPredictionTime: 1000 },
      { address: "GBBB...", points: 200, exactScores: 2, earliestPredictionTime: 1000 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    expect(sorted.map((e) => e.address)).toEqual(["GAAA...", "GBBB...", "GCZZ..."]);
  });

  it("treats undefined earliestPredictionTime as last (no predictions yet)", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 2, earliestPredictionTime: 1000 },
      { address: "addr2", points: 200, exactScores: 2, earliestPredictionTime: undefined },
      { address: "addr3", points: 200, exactScores: 2, earliestPredictionTime: 500 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    expect(sorted.map((e) => e.address)).toEqual(["addr3", "addr1", "addr2"]);
  });

  it("applies the full tie-break chain in documented order", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "GDZZ...", points: 300, exactScores: 3, earliestPredictionTime: 1000 },
      { address: "GAAA...", points: 300, exactScores: 2, earliestPredictionTime: 500 },
      { address: "GBBB...", points: 300, exactScores: 3, earliestPredictionTime: 800 },
      { address: "GCCC...", points: 200, exactScores: 1, earliestPredictionTime: 100 },
      { address: "GDDD...", points: 300, exactScores: 3, earliestPredictionTime: 800 },
    ];

    const sorted = sortLeaderboardWithTieBreak(entries);

    // Expected order:
    // 1. GBBB... (300 pts, 3 exact, 800 time) vs GDDD... (300 pts, 3 exact, 800 time) → GBBB by address
    // 2. GDDD... (300 pts, 3 exact, 800 time)
    // 3. GDZZ... (300 pts, 3 exact, 1000 time)
    // 4. GAAA... (300 pts, 2 exact, 500 time)
    // 5. GCCC... (200 pts, 1 exact, 100 time)
    expect(sorted.map((e) => e.address)).toEqual([
      "GBBB...",
      "GDDD...",
      "GDZZ...",
      "GAAA...",
      "GCCC...",
    ]);
  });

  it("does not mutate the input array", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 100, exactScores: 1 },
      { address: "addr2", points: 300, exactScores: 2 },
    ];
    const original = [...entries];

    sortLeaderboardWithTieBreak(entries);

    expect(entries).toEqual(original);
  });

  it("returns an empty array for empty input", () => {
    expect(sortLeaderboardWithTieBreak([])).toEqual([]);
  });
});

describe("detectTies", () => {
  it("detects tied participants with identical points and exact_scores", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 2 },
      { address: "addr2", points: 200, exactScores: 2 },
      { address: "addr3", points: 100, exactScores: 1 },
    ];

    const ties = detectTies(entries);

    expect(ties.has("addr1")).toBe(true);
    expect(ties.has("addr2")).toBe(true);
    expect(ties.has("addr3")).toBe(false);
  });

  it("marks all participants in a three-way tie as tied", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 2 },
      { address: "addr2", points: 200, exactScores: 2 },
      { address: "addr3", points: 200, exactScores: 2 },
    ];

    const ties = detectTies(entries);

    expect(ties.size).toBe(3);
    expect(ties.has("addr1")).toBe(true);
    expect(ties.has("addr2")).toBe(true);
    expect(ties.has("addr3")).toBe(true);
  });

  it("does not mark participants with same points but different exact_scores as tied", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 3 },
      { address: "addr2", points: 200, exactScores: 2 },
      { address: "addr3", points: 200, exactScores: 1 },
    ];

    const ties = detectTies(entries);

    expect(ties.size).toBe(0);
  });

  it("returns empty set when all participants have unique point + exact_score combinations", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 300, exactScores: 3 },
      { address: "addr2", points: 200, exactScores: 2 },
      { address: "addr3", points: 100, exactScores: 1 },
    ];

    const ties = detectTies(entries);

    expect(ties.size).toBe(0);
  });

  it("handles multiple separate tie groups correctly", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 300, exactScores: 3 },
      { address: "addr2", points: 300, exactScores: 3 },
      { address: "addr3", points: 200, exactScores: 2 },
      { address: "addr4", points: 200, exactScores: 2 },
      { address: "addr5", points: 100, exactScores: 1 },
    ];

    const ties = detectTies(entries);

    expect(ties.size).toBe(4);
    expect(ties.has("addr1")).toBe(true);
    expect(ties.has("addr2")).toBe(true);
    expect(ties.has("addr3")).toBe(true);
    expect(ties.has("addr4")).toBe(true);
    expect(ties.has("addr5")).toBe(false);
  });

  it("returns empty set for empty input", () => {
    expect(detectTies([])).toEqual(new Set());
  });

  it("returns empty set for single participant", () => {
    const entries: LeaderboardEntryForTieBreak[] = [
      { address: "addr1", points: 200, exactScores: 2 },
    ];

    const ties = detectTies(entries);

    expect(ties.size).toBe(0);
  });
});
