import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ConnectWalletModal from "../ConnectWalletModal";

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

describe("ConnectWalletModal", () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Default mock implementations
        mockRefreshSupportedWallets.mockResolvedValue([
            {
                id: "freighter",
                name: "Freighter",
                icon: "https://example.com/freighter.png",
                url: "https://www.freighter.app",
                isAvailable: true,
            },
            {
                id: "xbull",
                name: "xBull",
                icon: "https://example.com/xbull.png",
                url: "https://xbull.app",
                isAvailable: false,
            },
        ]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should not render when closed", () => {
        render(
            <ConnectWalletModal
                isOpen={false}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        expect(screen.queryByText("Connect Your Wallet")).not.toBeInTheDocument();
    });

    it("should render wallet options when open", async () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
            expect(screen.getByText("xBull")).toBeInTheDocument();
        });
    });

    it("should show loading state while fetching wallets", () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        // Should show skeleton loaders initially
        const skeletons = screen.getAllByRole("button", { name: "" });
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it("should show install button for unavailable wallets", async () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Install")).toBeInTheDocument();
        });
    });

    it("should handle successful wallet connection", async () => {
        mockFetchAddress.mockResolvedValue({ address: "GTEST123" });

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Connecting wallet...")).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText("Wallet Connected!")).toBeInTheDocument();
        });

        // Success callback should be called after timeout
        vi.advanceTimersByTime(1200);

        await waitFor(() => {
            expect(mockOnSuccess).toHaveBeenCalledWith("GTEST123", "freighter");
        });
    });

    it("should handle user rejection gracefully", async () => {
        mockFetchAddress.mockRejectedValue(new Error("User cancelled the request"));

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Connecting wallet...")).toBeInTheDocument();
        });

        // Should reset to idle state without showing error
        await waitFor(() => {
            expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
            expect(screen.queryByText("Connection Failed")).not.toBeInTheDocument();
        });
    });

    it("should show specific error for not installed wallet", async () => {
        mockFetchAddress.mockRejectedValue(new Error("Wallet not installed"));

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Wallet Not Installed")).toBeInTheDocument();
        });

        expect(screen.getByText("Install Wallet")).toBeInTheDocument();
    });

    it("should show specific error for locked wallet", async () => {
        mockFetchAddress.mockRejectedValue(new Error("Wallet is locked"));

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Wallet Locked")).toBeInTheDocument();
            expect(screen.getByText("Unlock your wallet extension and click retry")).toBeInTheDocument();
        });

        expect(screen.getByText("Retry Connection")).toBeInTheDocument();
    });

    it("should show specific error for wrong network", async () => {
        mockFetchAddress.mockRejectedValue(new Error("Wrong network detected"));

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Wrong Network")).toBeInTheDocument();
            expect(
                screen.getByText("Open your wallet extension and switch to the Stellar Public network")
            ).toBeInTheDocument();
        });
    });

    it("should retry connection on retry button click", async () => {
        mockFetchAddress
            .mockRejectedValueOnce(new Error("Wallet is locked"))
            .mockResolvedValueOnce({ address: "GTEST123" });

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Wallet Locked")).toBeInTheDocument();
        });

        const retryButton = screen.getByText("Retry Connection");
        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(screen.getByText("Connecting wallet...")).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText("Wallet Connected!")).toBeInTheDocument();
        });
    });

    it("should close modal when close button is clicked", async () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
        });

        const closeButton = screen.getByLabelText("Close modal");
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalled();
    });

    it("should not show close button in success state", async () => {
        mockFetchAddress.mockResolvedValue({ address: "GTEST123" });

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Wallet Connected!")).toBeInTheDocument();
        });

        expect(screen.queryByLabelText("Close modal")).not.toBeInTheDocument();
    });

    it("should expand FAQ section", async () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("What is a Stellar wallet?")).toBeInTheDocument();
        });

        const faqButton = screen.getByText("What is a Stellar wallet?");
        fireEvent.click(faqButton);

        await waitFor(() => {
            expect(
                screen.getByText(/A Stellar wallet stores your account keys/)
            ).toBeInTheDocument();
        });
    });

    it("should disable unavailable wallet buttons", async () => {
        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("xBull")).toBeInTheDocument();
        });

        const xbullButton = screen.getByText("xBull").closest("button");
        expect(xbullButton).toBeDisabled();
    });

    it("should handle cancel during connecting state", async () => {
        mockFetchAddress.mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({ address: "GTEST123" }), 5000))
        );

        render(
            <ConnectWalletModal
                isOpen={true}
                onClose={mockOnClose}
                onSuccess={mockOnSuccess}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Freighter")).toBeInTheDocument();
        });

        const freighterButton = screen.getByText("Freighter").closest("button");
        fireEvent.click(freighterButton!);

        await waitFor(() => {
            expect(screen.getByText("Connecting wallet...")).toBeInTheDocument();
        });

        const cancelButton = screen.getByText("Cancel");
        fireEvent.click(cancelButton);

        expect(mockOnClose).toHaveBeenCalled();
    });
});
