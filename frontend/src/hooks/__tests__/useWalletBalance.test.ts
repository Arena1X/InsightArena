import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWalletBalance } from "../useWalletBalance";

// Mock the WalletContext
const mockWalletContext = {
    address: null as string | null,
    isAuthenticated: false,
};

vi.mock("@/context/WalletContext", () => ({
    useWallet: () => mockWalletContext,
}));

// Mock the API client
const mockApiGet = vi.fn();
vi.mock("@/lib/api", () => ({
    apiClient: {
        get: (...args: any[]) => mockApiGet(...args),
    },
    ApiError: class ApiError extends Error {
        constructor(message: string) {
            super(message);
            this.name = "ApiError";
        }
    },
}));

// Mock the toast hook
const mockToastError = vi.fn();
vi.mock("../useToast", () => ({
    useToast: () => ({
        error: mockToastError,
    }),
}));

describe("useWalletBalance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockWalletContext.address = null;
        mockWalletContext.isAuthenticated = false;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should return null balance when not authenticated", () => {
        const { result } = renderHook(() => useWalletBalance());

        expect(result.current.balance).toBeNull();
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("should fetch balance when authenticated", async () => {
        const mockBalance = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        mockApiGet.mockResolvedValue(mockBalance);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.balance).toEqual(mockBalance);
        });

        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(mockApiGet).toHaveBeenCalledWith(
            "/wallet/GTEST123/balance",
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it("should handle API errors", async () => {
        const mockError = new Error("API Error");
        mockApiGet.mockRejectedValue(mockError);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.error).toBe("Failed to load wallet balance");
        });

        expect(result.current.balance).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it("should reset balance when account switches", async () => {
        const mockBalance1 = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        const mockBalance2 = {
            address: "GNEW456",
            balance: 2000,
            displayCurrency: "XLM",
        };

        mockApiGet.mockResolvedValueOnce(mockBalance1);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result, rerender } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.balance).toEqual(mockBalance1);
        });

        // Simulate account switch
        mockApiGet.mockResolvedValueOnce(mockBalance2);
        mockWalletContext.address = "GNEW456";

        rerender();

        // Balance should be immediately cleared
        expect(result.current.balance).toBeNull();

        // Then new balance should be fetched
        await waitFor(() => {
            expect(result.current.balance).toEqual(mockBalance2);
        });
    });

    it("should refetch balance on interval", async () => {
        const mockBalance = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        mockApiGet.mockResolvedValue(mockBalance);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        renderHook(() => useWalletBalance());

        // Initial fetch
        await waitFor(() => {
            expect(mockApiGet).toHaveBeenCalledTimes(1);
        });

        // Advance timers by 30 seconds (the refresh interval)
        vi.advanceTimersByTime(30000);

        await waitFor(() => {
            expect(mockApiGet).toHaveBeenCalledTimes(2);
        });
    });

    it("should handle timeout errors gracefully", async () => {
        const abortError = new Error("aborted");
        mockApiGet.mockRejectedValue(abortError);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.error).toBe("Failed to load wallet balance");
        });

        // Toast should not be shown for initial timeout
        expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show toast for subsequent errors", async () => {
        const mockBalance = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        // First fetch succeeds
        mockApiGet.mockResolvedValueOnce(mockBalance);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.balance).toEqual(mockBalance);
        });

        // Second fetch fails
        const networkError = new Error("Network error");
        mockApiGet.mockRejectedValueOnce(networkError);

        vi.advanceTimersByTime(30000);

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith("Failed to load wallet balance");
        });
    });

    it("should support manual refetch", async () => {
        const mockBalance = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        mockApiGet.mockResolvedValue(mockBalance);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(mockApiGet).toHaveBeenCalledTimes(1);
        });

        // Manual refetch
        await result.current.refetch();

        expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    it("should clear balance when disconnecting", async () => {
        const mockBalance = {
            address: "GTEST123",
            balance: 1000,
            displayCurrency: "XLM",
        };

        mockApiGet.mockResolvedValue(mockBalance);
        mockWalletContext.address = "GTEST123";
        mockWalletContext.isAuthenticated = true;

        const { result, rerender } = renderHook(() => useWalletBalance());

        await waitFor(() => {
            expect(result.current.balance).toEqual(mockBalance);
        });

        // Disconnect
        mockWalletContext.address = null;
        mockWalletContext.isAuthenticated = false;

        rerender();

        expect(result.current.balance).toBeNull();
        expect(result.current.error).toBeNull();
    });
});
