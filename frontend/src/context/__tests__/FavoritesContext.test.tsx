import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { FavoritesProvider, useFavorites } from "../FavoritesContext";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getFavoriteBookmarks: vi.fn(),
  addFavoriteBookmark: vi.fn(),
  removeFavoriteBookmark: vi.fn(),
}));

vi.mock("../WalletContext", () => ({
  useWallet: () => ({
    address: "GTESTADDRESS",
    token: "test-token",
  }),
}));

const mockGet = vi.mocked(api.getFavoriteBookmarks);
const mockAdd = vi.mocked(api.addFavoriteBookmark);
const mockRemove = vi.mocked(api.removeFavoriteBookmark);

function wrapper({ children }: { children: ReactNode }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}

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
