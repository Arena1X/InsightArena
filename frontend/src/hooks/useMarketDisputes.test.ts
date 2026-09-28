import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { apiClient, ApiError } from "@/lib/api";
import { useMarketDisputes, type CreateDisputeInput } from "./useMarketDisputes";

const MARKET_ID = "market-1";

function buildInput(overrides: Partial<CreateDisputeInput> = {}): CreateDisputeInput {
  return {
    marketId: MARKET_ID,
    category: "incorrect_outcome",
    reason: "This resolution does not match the publicly reported result.",
    evidenceLinks: [],
    ...overrides,
  };
}

describe("useMarketDisputes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("refresh", () => {
    it("loads disputes for the given market and decodes their category", async () => {
      vi.spyOn(apiClient, "get").mockResolvedValue({
        disputes: [
          {
            id: "d1",
            market_id: MARKET_ID,
            reason: "[category:manipulation]\nSomething looks off with the odds.",
            status: "under_review",
            created_at: "2026-08-01T00:00:00Z",
          },
          {
            id: "d2",
            market_id: "other-market",
            reason: "Unrelated dispute",
            status: "pending",
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
      });

      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await result.current.refresh(MARKET_ID);
      });

      expect(result.current.disputes).toHaveLength(1);
      expect(result.current.disputes[0]).toMatchObject({
        id: "d1",
        category: "manipulation",
        reason: "Something looks off with the odds.",
        status: "under_review",
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("defaults to the 'other' category when a dispute has no category tag", async () => {
      vi.spyOn(apiClient, "get").mockResolvedValue({
        disputes: [
          {
            id: "d1",
            market_id: MARKET_ID,
            reason: "Plain reason with no tag.",
            status: "pending",
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
      });

      const { result } = renderHook(() => useMarketDisputes());
      await act(async () => {
        await result.current.refresh(MARKET_ID);
      });

      expect(result.current.disputes[0].category).toBe("other");
      expect(result.current.disputes[0].reason).toBe("Plain reason with no tag.");
    });

    it("silently clears disputes on a 404 (no disputes endpoint / none found) without setting error", async () => {
      vi.spyOn(apiClient, "get").mockRejectedValue(
        new ApiError("Not found", "http", "/disputes", 404),
      );

      const { result } = renderHook(() => useMarketDisputes());
      await act(async () => {
        await result.current.refresh(MARKET_ID);
      });

      expect(result.current.disputes).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("sets an error message for a non-404/401 failure", async () => {
      vi.spyOn(apiClient, "get").mockRejectedValue(
        new ApiError("Server error", "http", "/disputes", 500),
      );

      const { result } = renderHook(() => useMarketDisputes());
      await act(async () => {
        await result.current.refresh(MARKET_ID);
      });

      expect(result.current.error).toBe("Server error");
    });
  });

  describe("submitDispute validation", () => {
    it("rejects an empty reason without touching the network", async () => {
      const postSpy = vi.spyOn(apiClient, "post");
      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(
          result.current.submitDispute(buildInput({ reason: "" })),
        ).rejects.toThrow("A dispute reason is required.");
      });

      expect(postSpy).not.toHaveBeenCalled();
      expect(result.current.disputes).toHaveLength(0);
      expect(result.current.submitError).toBe("A dispute reason is required.");
    });

    it("rejects a reason under 20 characters", async () => {
      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(
          result.current.submitDispute(buildInput({ reason: "too short" })),
        ).rejects.toThrow("Please provide at least 20 characters of detail.");
      });

      expect(result.current.submitError).toBe(
        "Please provide at least 20 characters of detail.",
      );
    });

    it("rejects an invalid evidence URL", async () => {
      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(
          result.current.submitDispute(
            buildInput({ evidenceLinks: ["not-a-url"] }),
          ),
        ).rejects.toThrow(/Invalid evidence link/);
      });

      expect(result.current.submitError).toMatch(/Invalid evidence link/);
    });
  });

  describe("submitDispute optimistic update", () => {
    it("inserts an optimistic dispute immediately, before the network call resolves", async () => {
      let resolvePost: (value: unknown) => void = () => {};
      vi.spyOn(apiClient, "post").mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          }),
      );

      const { result } = renderHook(() => useMarketDisputes());

      act(() => {
        void result.current.submitDispute(buildInput());
      });

      await waitFor(() => expect(result.current.disputes).toHaveLength(1));
      expect(result.current.disputes[0].isOptimistic).toBe(true);
      expect(result.current.disputes[0].status).toBe("pending");
      expect(result.current.submitting).toBe(true);

      await act(async () => {
        resolvePost({
          id: "server-1",
          market_id: MARKET_ID,
          reason: "encoded",
          status: "pending",
          created_at: "2026-08-01T00:00:00Z",
        });
      });

      await waitFor(() => expect(result.current.submitting).toBe(false));
      expect(result.current.disputes).toHaveLength(1);
      expect(result.current.disputes[0].id).toBe("server-1");
      expect(result.current.disputes[0].isOptimistic).toBeFalsy();
      expect(result.current.submitSuccess).toBe("Dispute submitted successfully.");
    });

    it("rolls back the optimistic dispute when the server rejects it", async () => {
      vi.spyOn(apiClient, "post").mockRejectedValue(
        new ApiError("Market is not resolved yet.", "http", "/disputes", 400),
      );

      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(result.current.submitDispute(buildInput())).rejects.toThrow(
          "Market is not resolved yet.",
        );
      });

      // The optimistic row must be gone, not left dangling in a broken state.
      expect(result.current.disputes).toHaveLength(0);
      expect(result.current.submitError).toBe("Market is not resolved yet.");
      expect(result.current.submitting).toBe(false);
    });

    it("rolls back on an unexpected non-ApiError failure", async () => {
      vi.spyOn(apiClient, "post").mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(result.current.submitDispute(buildInput())).rejects.toThrow(
          "boom",
        );
      });

      expect(result.current.disputes).toHaveLength(0);
      expect(result.current.submitError).toBe("boom");
    });

    it("keeps a locally-pending dispute (no rollback) on a network-level failure", async () => {
      vi.spyOn(apiClient, "post").mockRejectedValue(
        new ApiError("Network error", "network", "/disputes"),
      );

      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await result.current.submitDispute(buildInput());
      });

      expect(result.current.disputes).toHaveLength(1);
      expect(result.current.disputes[0].status).toBe("pending");
      expect(result.current.disputes[0].isOptimistic).toBeFalsy();
      expect(result.current.submitError).toBeNull();
      expect(result.current.submitSuccess).toBe("Dispute submitted successfully.");
    });

    it("encodes the category into the posted reason", async () => {
      const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({
        id: "server-1",
        market_id: MARKET_ID,
        reason: "encoded",
        status: "pending",
        created_at: "2026-08-01T00:00:00Z",
      });

      const { result } = renderHook(() => useMarketDisputes());
      await act(async () => {
        await result.current.submitDispute(
          buildInput({ category: "manipulation" }),
        );
      });

      expect(postSpy).toHaveBeenCalledWith(
        "/disputes",
        expect.objectContaining({
          market_id: MARKET_ID,
          reason: expect.stringContaining("[category:manipulation]"),
        }),
      );
    });
  });

  describe("clearStatus", () => {
    it("clears submitError and submitSuccess", async () => {
      vi.spyOn(apiClient, "post").mockRejectedValue(
        new ApiError("failed", "http", "/disputes", 400),
      );
      const { result } = renderHook(() => useMarketDisputes());

      await act(async () => {
        await expect(result.current.submitDispute(buildInput())).rejects.toThrow();
      });
      expect(result.current.submitError).toBe("failed");

      act(() => {
        result.current.clearStatus();
      });

      expect(result.current.submitError).toBeNull();
      expect(result.current.submitSuccess).toBeNull();
    });
  });
});
