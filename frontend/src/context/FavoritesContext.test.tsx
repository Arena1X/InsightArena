import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFavorites, FavoritesProvider, mergeFavorites } from "./FavoritesContext";
import { useWallet } from "./WalletContext";

// --- Unit tests for mergeFavorites ---

describe("mergeFavorites", () => {
  it("returns the union of two sets", () => {
    const local = new Set(["a", "b"]);
    const server = new Set(["c", "d"]);
    expect(Array.from(mergeFavorites(local, server)).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("deduplicates overlapping IDs", () => {
    const local = new Set(["a", "b", "c"]);
    const server = new Set(["c", "d", "e"]);
    expect(Array.from(mergeFavorites(local, server)).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("handles empty local set", () => {
    const local = new Set<string>();
    const server = new Set(["a", "b"]);
    expect(Array.from(mergeFavorites(local, server)).sort()).toEqual(["a", "b"]);
  });

  it("handles empty server set", () => {
    const local = new Set(["a", "b"]);
    const server = new Set<string>();
    expect(Array.from(mergeFavorites(local, server)).sort()).toEqual(["a", "b"]);
  });

  it("does not mutate the original sets", () => {
    const local = new Set(["a"]);
    const server = new Set(["b"]);
    const merged = mergeFavorites(local, server);
    expect(Array.from(merged)).toEqual(["a", "b"]);
    expect(Array.from(local)).toEqual(["a"]);
    expect(Array.from(server)).toEqual(["b"]);
  });
});

// --- Integration tests for FavoritesProvider + useFavorites ---

vi.mock("@/lib/api", () => ({
  fetchServerFavorites: vi.fn(),
  addServerFavorite: vi.fn(),
  removeServerFavorite: vi.fn(),
}));

vi.mock("./WalletContext", () => ({
  useWallet: vi.fn(),
}));

import { fetchServerFavorites, addServerFavorite, removeServerFavorite } from "@/lib/api";

const mockedUseWallet = vi.mocked(useWallet);
const mockedFetchServer = vi.mocked(fetchServerFavorites);
const mockedAddServer = vi.mocked(addServerFavorite);
const mockedRemoveServer = vi.mocked(removeServerFavorite);

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockedUseWallet.mockReturnValue({
    address: null,
    isAuthenticated: false,
    isFreighterInstalled: false,
    isAuthenticating: false,
    isRestoring: false,
    user: null,
    token: null,
    authError: null,
    openConnectModal: vi.fn(),
    closeConnectModal: vi.fn(),
    isConnectModalOpen: false,
    authenticate: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useWallet>);
}

function renderFavoritesHook() {
  return renderHook(() => useFavorites(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <FavoritesProvider>{children}</FavoritesProvider>
    ),
  });
}

describe("useFavorites — unauthenticated (guest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockWallet({ address: null, isAuthenticated: false });
  });

  it("starts with an empty set and no sync error", async () => {
    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteIds.size).toBe(0);
    expect(result.current.syncError).toBe(false);
    expect(mockedFetchServer).not.toHaveBeenCalled();
  });

  it("persists added favorites to localStorage", async () => {
    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addFavorite("market-1");
    });

    expect(result.current.favoriteIds.has("market-1")).toBe(true);
    // Should NOT call the server for unauthenticated users
    expect(mockedAddServer).not.toHaveBeenCalled();
  });

  it("removes favorites locally", async () => {
    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addFavorite("market-1");
      result.current.removeFavorite("market-1");
    });

    expect(result.current.favoriteIds.has("market-1")).toBe(false);
  });
});

describe("useFavorites — authenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedFetchServer.mockResolvedValue(new Set());
    mockedAddServer.mockResolvedValue(undefined);
    mockedRemoveServer.mockResolvedValue(undefined);
    mockWallet({
      address: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
      isAuthenticated: true,
    });
  });

  it("loads server favorites on mount and merges with local", async () => {
    // Pre-populate localStorage with a local favorite
    localStorage.setItem(
      "insightarena.favorites.GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
      JSON.stringify(["local-1"]),
    );
    mockedFetchServer.mockResolvedValue(new Set(["server-1", "server-2"]));

    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteIds.has("local-1")).toBe(true);
    expect(result.current.favoriteIds.has("server-1")).toBe(true);
    expect(result.current.favoriteIds.has("server-2")).toBe(true);
    expect(result.current.favoriteIds.size).toBe(3);
  });

  it("calls the server when adding a favorite (optimistic)", async () => {
    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addFavorite("market-1");
    });

    // Optimistic: local state updated immediately
    expect(result.current.favoriteIds.has("market-1")).toBe(true);
    expect(mockedAddServer).toHaveBeenCalledWith("market-1");
  });

  it("rolls back on server failure when adding", async () => {
    mockedAddServer.mockRejectedValue(new Error("network error"));

    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addFavorite("market-1");
    });

    // Optimistic update applied
    expect(result.current.favoriteIds.has("market-1")).toBe(true);

    // Wait for the catch handler to roll back
    await waitFor(() => expect(result.current.favoriteIds.has("market-1")).toBe(false));
    expect(result.current.syncError).toBe(true);
  });

  it("calls the server when removing a favorite (optimistic)", async () => {
    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // First add
    act(() => {
      result.current.addFavorite("market-1");
    });

    // Then remove
    act(() => {
      result.current.removeFavorite("market-1");
    });

    expect(result.current.favoriteIds.has("market-1")).toBe(false);
    expect(mockedRemoveServer).toHaveBeenCalledWith("market-1");
  });

  it("rolls back on server failure when removing", async () => {
    mockedRemoveServer.mockRejectedValue(new Error("network error"));

    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Add first
    act(() => {
      result.current.addFavorite("market-1");
    });

    // Then remove (will fail)
    act(() => {
      result.current.removeFavorite("market-1");
    });

    // Optimistic: removed immediately
    expect(result.current.favoriteIds.has("market-1")).toBe(false);

    // Wait for rollback (re-add)
    await waitFor(() => expect(result.current.favoriteIds.has("market-1")).toBe(true));
    expect(result.current.syncError).toBe(true);
  });

  it("falls back to local-only when the server is unreachable on load", async () => {
    mockedFetchServer.mockRejectedValue(new Error("network error"));

    // Pre-populate localStorage
    localStorage.setItem(
      "insightarena.favorites.GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
      JSON.stringify(["local-1"]),
    );

    const { result } = renderFavoritesHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteIds.has("local-1")).toBe(true);
    expect(result.current.syncError).toBe(true);
  });
});