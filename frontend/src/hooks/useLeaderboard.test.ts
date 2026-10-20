import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLeaderboard } from "./useLeaderboard";
import * as api from "@/lib/api";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getLeaderboard: vi.fn(),
    getLeaderboardSnapshot: vi.fn(),
    getSeasons: vi.fn(),
  };
});

vi.mock("@/hooks/useHookErrorMessage", () => ({
  logHookError: (_err: unknown, ctx: { fallbackMessage: string }) =>
    ctx.fallbackMessage,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGetLeaderboard = vi.mocked(api.getLeaderboard);
const mockGetSnapshot = vi.mocked(api.getLeaderboardSnapshot);
const mockGetSeasons = vi.mocked(api.getSeasons);

function makeEntry(
  rank: number,
  address: string,
  overrides: Partial<api.LeaderboardEntryResponse> = {},
): api.LeaderboardEntryResponse {
  return {
    rank,
    user_id: `uid-${rank}`,
    username: `user${rank}`,
    stellar_address: address,
    reputation_score: 1000 - rank * 10,
    accuracy_rate: "75.0",
    total_winnings_stroops: "0",
    season_points: 1000 - rank * 10,
    rank_delta: null,
    ...overrides,
  };
}

function makeSnapshotEntry(
  rank: number,
  address: string,
  score = 900,
): api.SnapshotRankingEntry {
  return {
    rank,
    user_id: `uid-${rank}`,
    username: `user${rank}`,
    stellar_address: address,
    score,
    captured_at: "2026-07-01T00:00:00.000Z",
  };
}

function makeSeason(
  id: string,
  name: string,
  isActive = false,
): api.SeasonListItem {
  return {
    id,
    season_number: 1,
    name,
    starts_at: "2026-01-01T00:00:00.000Z",
    ends_at: "2026-12-31T00:00:00.000Z",
    reward_pool_stroops: "500000000000",
    is_active: isActive,
    is_finalized: false,
  };
}

function makeLeaderboardPage(
  entries: api.LeaderboardEntryResponse[],
): api.PaginatedLeaderboardResponse {
  return { data: entries, total: entries.length, page: 1, limit: 100 };
}

function makeSnapshotPage(
  entries: api.SnapshotRankingEntry[],
): api.SnapshotRankingResponse {
  return {
    data: entries,
    snapshot_date: "2026-07-01T00:00:00.000Z",
    total: entries.length,
    page: 1,
    limit: 100,
  };
}

function makeSeasonsPage(
  seasons: api.SeasonListItem[],
): api.PaginatedSeasonsResponse {
  return { data: seasons, total: seasons.length, page: 1, limit: 50 };
}

// Default happy-path responses
const DEFAULT_ENTRIES = [
  makeEntry(1, "ADDR_A"),
  makeEntry(2, "ADDR_B"),
  makeEntry(3, "ADDR_C"),
];
const DEFAULT_SEASONS = [makeSeason("s1", "Season 1", true)];

function setupDefaults() {
  mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(DEFAULT_ENTRIES));
  mockGetSeasons.mockResolvedValue(makeSeasonsPage(DEFAULT_SEASONS));
  mockGetSnapshot.mockResolvedValue(makeSnapshotPage([]));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial load ───────────────────────────────────────────────────────────

  it("transitions from loading to loaded state on mount", async () => {
    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toHaveLength(3);
    expect(result.current.seasons).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.isEmpty).toBe(false);
  });

  it("calls getLeaderboard without season_id on initial mount", async () => {
    renderHook(() => useLeaderboard());
    await waitFor(() =>
      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.objectContaining({ season_id: undefined }),
        expect.any(Object),
      ),
    );
  });

  it("calls getSeasons on initial mount", async () => {
    renderHook(() => useLeaderboard());
    await waitFor(() => expect(mockGetSeasons).toHaveBeenCalledTimes(1));
  });

  // ── Season switch reloads data ─────────────────────────────────────────────

  it("reloads leaderboard data when seasonId changes", async () => {
    const seasonEntries = [makeEntry(1, "ADDR_X"), makeEntry(2, "ADDR_Y")];

    mockGetLeaderboard
      .mockResolvedValueOnce(makeLeaderboardPage(DEFAULT_ENTRIES)) // initial
      .mockResolvedValueOnce(makeLeaderboardPage(seasonEntries));  // after switch

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Switch to a specific season
    act(() => {
      result.current.setSeasonId("s1");
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Second call should pass the new season_id
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(2);
    expect(mockGetLeaderboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ season_id: "s1" }),
      expect.any(Object),
    );
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.seasonId).toBe("s1");
  });

  it("switches back to all-time when seasonId is set to undefined", async () => {
    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(DEFAULT_ENTRIES));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSeasonId("s1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSeasonId(undefined));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetLeaderboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ season_id: undefined }),
      expect.any(Object),
    );
  });

  it("clears compareDate when the season changes", async () => {
    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    expect(result.current.compareDate).toBe("2026-07-01");

    act(() => result.current.setSeasonId("s1"));
    // compareDate must be cleared immediately
    expect(result.current.compareDate).toBeNull();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it("sets isLoading=true while the fetch is in-flight", async () => {
    // Never resolves — keeps the hook in loading state
    mockGetLeaderboard.mockReturnValue(new Promise(() => {}));
    mockGetSeasons.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLeaderboard());
    expect(result.current.isLoading).toBe(true);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it("reports isEmpty=true when the server returns zero entries", async () => {
    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage([]));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.entries).toHaveLength(0);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it("sets error and clears entries when fetch rejects", async () => {
    mockGetLeaderboard.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.entries).toHaveLength(0);
  });

  // ── Snapshot compare: deltas compute correctly ────────────────────────────

  it("fetches the snapshot when compareDate is set", async () => {
    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));

    await waitFor(() => expect(mockGetSnapshot).toHaveBeenCalledTimes(1));
    expect(mockGetSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-01" }),
      expect.any(Object),
    );
  });

  it("computes positive delta when a user moved up since the snapshot", async () => {
    // Live: ADDR_A is rank 1, ADDR_B is rank 2
    const liveEntries = [
      makeEntry(1, "ADDR_A"),
      makeEntry(2, "ADDR_B"),
    ];
    // Snapshot (older): ADDR_A was rank 3, ADDR_B was rank 1
    const snapEntries = [
      makeSnapshotEntry(1, "ADDR_B"),
      makeSnapshotEntry(3, "ADDR_A"),
    ];

    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(liveEntries));
    mockGetSnapshot.mockResolvedValue(makeSnapshotPage(snapEntries));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));

    // ADDR_A: was rank 3, now rank 1 → delta = 3 - 1 = +2 (moved up)
    expect(result.current.snapshotDeltas.get("ADDR_A")).toBe(2);
    // ADDR_B: was rank 1, now rank 2 → delta = 1 - 2 = -1 (dropped)
    expect(result.current.snapshotDeltas.get("ADDR_B")).toBe(-1);
  });

  it("computes negative delta when a user dropped since the snapshot", async () => {
    const liveEntries = [makeEntry(5, "ADDR_C")];
    const snapEntries = [makeSnapshotEntry(2, "ADDR_C")];

    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(liveEntries));
    mockGetSnapshot.mockResolvedValue(makeSnapshotPage(snapEntries));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));

    // ADDR_C: was rank 2, now rank 5 → delta = 2 - 5 = -3
    expect(result.current.snapshotDeltas.get("ADDR_C")).toBe(-3);
  });

  it("computes zero delta when rank is unchanged since the snapshot", async () => {
    const liveEntries = [makeEntry(1, "ADDR_D")];
    const snapEntries = [makeSnapshotEntry(1, "ADDR_D")];

    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(liveEntries));
    mockGetSnapshot.mockResolvedValue(makeSnapshotPage(snapEntries));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));

    expect(result.current.snapshotDeltas.get("ADDR_D")).toBe(0);
  });

  it("omits delta for users who do not appear in the snapshot", async () => {
    const liveEntries = [makeEntry(1, "ADDR_NEW")];
    const snapEntries = [makeSnapshotEntry(1, "ADDR_OLD")]; // different address

    mockGetLeaderboard.mockResolvedValue(makeLeaderboardPage(liveEntries));
    mockGetSnapshot.mockResolvedValue(makeSnapshotPage(snapEntries));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));

    // ADDR_NEW was not in the snapshot — no delta available
    expect(result.current.snapshotDeltas.has("ADDR_NEW")).toBe(false);
  });

  it("clears snapshot state when compareDate is set to null", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotPage([makeSnapshotEntry(1, "ADDR_A")]),
    );

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));
    expect(result.current.snapshotEntries.length).toBeGreaterThan(0);

    act(() => result.current.setCompareDate(null));

    expect(result.current.snapshotEntries).toHaveLength(0);
    expect(result.current.snapshotDeltas.size).toBe(0);
    expect(result.current.snapshotError).toBeNull();
  });

  it("sets snapshotError when snapshot fetch rejects", async () => {
    mockGetSnapshot.mockRejectedValue(new Error("snapshot unavailable"));

    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCompareDate("2026-07-01"));
    await waitFor(() => expect(result.current.isSnapshotLoading).toBe(false));

    expect(result.current.snapshotError).toBeTruthy();
    expect(result.current.snapshotDeltas.size).toBe(0);
  });

  // ── refetch ────────────────────────────────────────────────────────────────

  it("refetch reloads leaderboard data", async () => {
    const { result } = renderHook(() => useLeaderboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = mockGetLeaderboard.mock.calls.length;

    act(() => result.current.refetch());
    await waitFor(() =>
      expect(mockGetLeaderboard.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});

// ---------------------------------------------------------------------------
// computeSnapshotDeltas — pure-function unit tests
// ---------------------------------------------------------------------------

describe("computeSnapshotDeltas", () => {
  it("returns positive delta for improved rank (rank number decreased)", () => {
    const baseline: api.SnapshotRankingEntry[] = [
      makeSnapshotEntry(3, "ADDR_A"),
      makeSnapshotEntry(1, "ADDR_B"),
    ];
    const current: api.SnapshotRankingEntry[] = [
      makeSnapshotEntry(1, "ADDR_A"),
      makeSnapshotEntry(2, "ADDR_B"),
    ];

    const deltas = api.computeSnapshotDeltas(baseline, current);

    // ADDR_A: was 3, now 1 → 3 - 1 = +2
    expect(deltas.get("ADDR_A")).toBe(2);
    // ADDR_B: was 1, now 2 → 1 - 2 = -1
    expect(deltas.get("ADDR_B")).toBe(-1);
  });

  it("returns zero delta when rank is unchanged", () => {
    const baseline = [makeSnapshotEntry(4, "ADDR_X")];
    const current = [makeSnapshotEntry(4, "ADDR_X")];

    const deltas = api.computeSnapshotDeltas(baseline, current);
    expect(deltas.get("ADDR_X")).toBe(0);
  });

  it("omits entries not present in baseline", () => {
    const baseline: api.SnapshotRankingEntry[] = [];
    const current = [makeSnapshotEntry(1, "ADDR_NEW")];

    const deltas = api.computeSnapshotDeltas(baseline, current);
    expect(deltas.has("ADDR_NEW")).toBe(false);
  });

  it("handles empty current list", () => {
    const baseline = [makeSnapshotEntry(1, "ADDR_A")];
    const current: api.SnapshotRankingEntry[] = [];

    const deltas = api.computeSnapshotDeltas(baseline, current);
    expect(deltas.size).toBe(0);
  });

  it("handles multiple users correctly in a single pass", () => {
    const baseline = [
      makeSnapshotEntry(1, "A"),
      makeSnapshotEntry(2, "B"),
      makeSnapshotEntry(3, "C"),
    ];
    const current = [
      makeSnapshotEntry(2, "A"), // dropped 1
      makeSnapshotEntry(1, "B"), // improved 1
      makeSnapshotEntry(3, "C"), // unchanged
    ];

    const deltas = api.computeSnapshotDeltas(baseline, current);

    expect(deltas.get("A")).toBe(-1);
    expect(deltas.get("B")).toBe(1);
    expect(deltas.get("C")).toBe(0);
  });
});
