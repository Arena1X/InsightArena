import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { FavoritesProvider, useFavorites } from "../FavoritesContext";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getFavoriteBookmarks: vi.fn(),
  addFavoriteBookmark: vi.fn(),
  removeFavoriteBookmark: vi.fn(),
}));

let mockWallet = { address: "GTESTADDRESS" as string | null, token: "test-token" as string | null };

vi.mock("../WalletContext", () => ({
  useWallet: () => mockWallet,
}));

const mockGet = vi.mocked(api.getFavoriteBookmarks);
const mockAdd = vi.mocked(api.addFavoriteBookmark);
const mockRemove = vi.mocked(api.removeFavoriteBookmark);

function wrapper({ children }: { children: ReactNode }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}

afterEach(() => {
  mockWallet = { address: "GTESTADDRESS", token: "test-token" };
});

describe("FavoritesContext optimistic sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    mockAdd.mockResolvedValue({
      id: "bookmark-1",
      market: { id: "market-1" },
    });
    mockRemove.mockResolvedValue({ success: true });
  });

  it("ends in the correct final state after rapid toggles", async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleFavorite("market-1");
      result.current.toggleFavorite("market-1");
      result.current.toggleFavorite("market-1");
    });

    expect(result.current.isFavorite("market-1")).toBe(true);

    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(result.current.isFavorite("market-1")).toBe(true);
  });

  it("rolls back the optimistic toggle when the API fails", async () => {
    mockAdd.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleFavorite("market-1");
    });
    expect(result.current.isFavorite("market-1")).toBe(true);

    await waitFor(() => expect(result.current.isFavorite("market-1")).toBe(false));
  });
});

describe("FavoritesContext merge logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAdd.mockImplementation(async (id) => ({
      id: `bk-${id}`,
      market: { id },
    }));
    mockRemove.mockResolvedValue({ success: true });
  });

  it("merges local and server favorites into a union on login", async () => {
    window.localStorage.setItem(
      "insightarena.favorites.GTESTADDRESS",
      JSON.stringify(["local-1", "shared"]),
    );

    mockGet.mockResolvedValue({
      data: [
        { id: "bk-shared", market: { id: "shared" } },
        { id: "bk-server-1", market: { id: "server-1" } },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });

    const { result } = renderHook(() => useFavorites(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFavorite("local-1")).toBe(true);
    expect(result.current.isFavorite("shared")).toBe(true);
    expect(result.current.isFavorite("server-1")).toBe(true);

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        "local-1",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        }),
      ),
    );
  });

  it("does not re-upload items already on the server", async () => {
    window.localStorage.setItem(
      "insightarena.favorites.GTESTADDRESS",
      JSON.stringify(["shared"]),
    );

    mockGet.mockResolvedValue({
      data: [{ id: "bk-shared", market: { id: "shared" } }],
      total: 1,
      page: 1,
      limit: 50,
    });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("persists merged set to localStorage", async () => {
    window.localStorage.setItem(
      "insightarena.favorites.GTESTADDRESS",
      JSON.stringify(["local-1"]),
    );

    mockGet.mockResolvedValue({
      data: [{ id: "bk-server-1", market: { id: "server-1" } }],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderHook(() => useFavorites(), { wrapper });

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("insightarena.favorites.GTESTADDRESS") ?? "[]",
      );
      expect(stored).toEqual(expect.arrayContaining(["local-1", "server-1"]));
      expect(stored).toHaveLength(2);
    });
  });
});

describe("FavoritesContext unauthenticated fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockWallet = { address: null, token: null };
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  });

  it("uses local-only storage without calling the API", async () => {
    window.localStorage.setItem(
      "insightarena.favorites.guest",
      JSON.stringify(["m1", "m2"]),
    );

    const { result } = renderHook(() => useFavorites(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFavorite("m1")).toBe(true);
    expect(result.current.isFavorite("m2")).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("persists toggles to localStorage without API calls", async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleFavorite("m1");
    });

    expect(result.current.isFavorite("m1")).toBe(true);
    const stored = JSON.parse(
      window.localStorage.getItem("insightarena.favorites.guest") ?? "[]",
    );
    expect(stored).toContain("m1");
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
