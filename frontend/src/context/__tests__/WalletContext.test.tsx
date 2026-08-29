import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WalletProvider, useWallet } from "../WalletContext";

// Mock Next.js router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock the Stellar Wallets Kit
const mockFetchAddress = vi.fn();
const mockSetWallet = vi.fn();
const mockRefreshSupportedWallets = vi.fn();
const mockInit = vi.fn();

vi.mock("@creit-tech/stellar-wallets-kit/sdk", () => ({
    StellarWalletsKit: {
        init: (...args: any[]) => mockInit(...args),
        setWallet: (...args: any[]) => mockSetWallet(...args),
        fetchAddress: (...args: any[]) => mockFetchAddress(...args),
        refreshSupportedWallets: (...args: any[]) => mockRefreshSupportedWallets(...args),
    },
}));

vi.mock("@creit-tech/stellar-wallets-kit/types", () => ({
    Networks: {
        PUBLIC: "PUBLIC",
        TESTNET: "TESTNET",
    },
}));

vi.mock("@creit-tech/stellar-wallets-kit/modules/freighter", () => ({
    FreighterModule: class { },
    FREIGHTER_ID: "freighter",
}));

vi.mock("@creit-tech/stellar-wallets-kit/modules/xbull", () => ({
    xBullModule: class { },
}));

vi.mock("@creit-tech/stellar-wallets-kit/modules/albedo", () => ({
    AlbedoModule: class { },
}));

// Mock ConnectWalletModal
vi.mock("@/component/ConnectWalletModal", () => ({
    default: () => null,
}));

describe("WalletContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        // Default mock implementations
        mockRefreshSupportedWallets.mockResolvedValue([
            { id: "freighter", name: "Freighter", isAvailable: true },
        ]);
        mockFetchAddress.mockResolvedValue({ address: "GTEST123" });
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    describe("Initialization", () => {
        it("should initialize with disconnected state", () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.address).toBeNull();
            expect(result.current.isRestoring).toBe(true);
        });

        it("should detect installed wallets", async () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.isFreighterInstalled).toBe(true);
        });
    });

    describe("Session Recovery", () => {
        it("should restore session from localStorage on mount", async () => {
            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            mockFetchAddress.mockResolvedValue({ address: "GTEST123" });

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.address).toBe("GTEST123");
            expect(result.current.isAuthenticated).toBe(true);
        });

        it("should clear session if wallet returns different address", async () => {
            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            mockFetchAddress.mockResolvedValue({ address: "GDIFFERENT456" });

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.address).toBeNull();
            expect(result.current.walletError?.type).toBe("account_switched");
            expect(localStorage.getItem("insightarena.wallet.v1")).toBeNull();
        });

        it("should clear corrupted localStorage data", async () => {
            localStorage.setItem("insightarena.wallet.v1", "invalid json{");

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(localStorage.getItem("insightarena.wallet.v1")).toBeNull();
        });

        it("should not restore session with wrong network", async () => {
            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "TESTNET",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.address).toBeNull();
            expect(result.current.walletError?.type).toBe("wrong_network");
            expect(localStorage.getItem("insightarena.wallet.v1")).toBeNull();
        });
    });

    describe("Account Switching Detection", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("should detect account switch and reset state", async () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            // Wait for initialization
            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            // Simulate successful connection
            act(() => {
                result.current.openConnectModal();
            });

            // Mock modal success callback to simulate connection
            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            await act(async () => {
                // Simulate a connected state
                mockFetchAddress.mockResolvedValue({ address: "GTEST123" });
            });

            // Now change the address (simulate account switch in wallet)
            mockFetchAddress.mockResolvedValue({ address: "GNEWACCOUNT456" });

            // Advance timers to trigger the polling check
            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            await waitFor(() => {
                expect(result.current.walletError?.type).toBe("account_switched");
            });

            expect(result.current.address).toBeNull();
            expect(localStorage.getItem("insightarena.wallet.v1")).toBeNull();
        });

        it("should detect wallet lock and reset state", async () => {
            mockFetchAddress.mockResolvedValue({ address: "GTEST123" });

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            // Simulate wallet becoming locked
            mockFetchAddress.mockRejectedValue(new Error("Wallet is locked"));

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            await waitFor(() => {
                expect(result.current.walletError?.type).toBe("locked");
            });

            expect(result.current.address).toBeNull();
        });
    });

    describe("Error Classification", () => {
        it("should classify not_installed error", async () => {
            mockFetchAddress.mockRejectedValue(new Error("Wallet not installed"));

            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.walletError?.type).toBe("not_installed");
            expect(result.current.walletError?.retryable).toBe(false);
        });

        it("should classify locked error", async () => {
            mockFetchAddress.mockRejectedValue(new Error("Wallet is locked"));

            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.walletError?.type).toBe("locked");
            expect(result.current.walletError?.retryable).toBe(true);
        });

        it("should classify user_rejected error and not show it", async () => {
            mockFetchAddress.mockRejectedValue(new Error("User rejected the request"));

            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            // User rejection should not show an error
            expect(result.current.walletError).toBeNull();
        });

        it("should classify wrong_network error", async () => {
            mockFetchAddress.mockRejectedValue(new Error("Wrong network, please switch to PUBLIC"));

            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            expect(result.current.walletError?.type).toBe("wrong_network");
            expect(result.current.walletError?.retryable).toBe(true);
        });
    });

    describe("Actions", () => {
        it("should open and close connect modal", () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            expect(result.current.isConnectModalOpen).toBe(false);

            act(() => {
                result.current.openConnectModal();
            });

            expect(result.current.isConnectModalOpen).toBe(true);

            act(() => {
                result.current.closeConnectModal();
            });

            expect(result.current.isConnectModalOpen).toBe(false);
        });

        it("should clear errors when opening modal", async () => {
            mockFetchAddress.mockRejectedValue(new Error("Wallet is locked"));

            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.walletError).not.toBeNull();
            });

            act(() => {
                result.current.openConnectModal();
            });

            expect(result.current.authError).toBeNull();
        });

        it("should retry connection", async () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.isRestoring).toBe(false);
            });

            await act(async () => {
                await result.current.retry();
            });

            expect(result.current.isConnectModalOpen).toBe(true);
            expect(result.current.walletError).toBeNull();
        });

        it("should clear errors", () => {
            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            // Manually set errors for testing
            act(() => {
                result.current.openConnectModal();
            });

            act(() => {
                result.current.clearError();
            });

            expect(result.current.walletError).toBeNull();
            expect(result.current.authError).toBeNull();
        });

        it("should logout and clear all state", async () => {
            const storedSession = {
                walletId: "freighter",
                address: "GTEST123",
                network: "PUBLIC",
            };
            localStorage.setItem("insightarena.wallet.v1", JSON.stringify(storedSession));

            const { result } = renderHook(() => useWallet(), {
                wrapper: WalletProvider,
            });

            await waitFor(() => {
                expect(result.current.address).toBe("GTEST123");
            });

            act(() => {
                result.current.logout();
            });

            expect(result.current.address).toBeNull();
            expect(result.current.user).toBeNull();
            expect(result.current.token).toBeNull();
            expect(result.current.walletError).toBeNull();
            expect(localStorage.getItem("insightarena.wallet.v1")).toBeNull();
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });
});
