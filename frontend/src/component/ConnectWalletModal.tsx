"use client";

import { useEffect, useState } from "react";
import { X, Check, AlertCircle, ExternalLink } from "lucide-react";

type ModalStep = "idle" | "connecting" | "success" | "error";

type ErrorType =
  | "not_installed"
  | "locked"
  | "user_rejected"
  | "wrong_network"
  | "connection_failed";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (address: string, walletId: string) => void;
}

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  url: string;
  isAvailable: boolean;
}

export default function ConnectWalletModal({
  isOpen,
  onClose,
  onSuccess,
}: ConnectWalletModalProps) {
  const [step, setStep] = useState<ModalStep>("idle");
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [connectedAddress, setConnectedAddress] = useState("");
  const [expandedFaq, setExpandedFaq] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  // Load kit and detect installed wallets (client-only)
  useEffect(() => {
    if (typeof window === "undefined" || !isOpen) return;

    let cancelled = false;

    async function loadWallets() {
      const [
        { StellarWalletsKit },
        { Networks },
        { FreighterModule, FREIGHTER_ID },
        { xBullModule },
        { AlbedoModule },
      ] = await Promise.all([
        import("@creit-tech/stellar-wallets-kit/sdk"),
        import("@creit-tech/stellar-wallets-kit/types"),
        import("@creit-tech/stellar-wallets-kit/modules/freighter"),
        import("@creit-tech/stellar-wallets-kit/modules/xbull"),
        import("@creit-tech/stellar-wallets-kit/modules/albedo"),
      ]);

      StellarWalletsKit.init({
        network: Networks.PUBLIC,
        selectedWalletId: FREIGHTER_ID,
        modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()],
      });

      const supported = await StellarWalletsKit.refreshSupportedWallets();
      if (cancelled) return;

      setWallets(
        supported.map((w) => ({
          id: w.id,
          name: w.name,
          icon: w.icon,
          url: w.url,
          isAvailable: w.isAvailable,
        })),
      );
    }

    loadWallets().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const resetModal = () => {
    setStep("idle");
    setError("");
    setErrorType(null);
    setConnectedAddress("");
    setSelectedWalletId(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleWalletSelect = async (walletId: string) => {
    setStep("connecting");
    setSelectedWalletId(walletId);
    setError("");
    setErrorType(null);

    try {
      const { StellarWalletsKit } =
        await import("@creit-tech/stellar-wallets-kit/sdk");

      StellarWalletsKit.setWallet(walletId);
      const { address } = await StellarWalletsKit.fetchAddress();

      setConnectedAddress(address);
      setStep("success");

      // Let WalletContext handle the redirect via onSuccess
      setTimeout(() => {
        onSuccess(address, walletId);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

      // Categorize errors
      if (msg.includes("cancel") || msg.includes("reject") || msg.includes("user closed") || msg.includes("denied")) {
        // User rejected - reset to idle to let them try again
        resetModal();
        return;
      }

      if (msg.includes("not installed") || msg.includes("not available")) {
        setErrorType("not_installed");
        setError("Wallet extension is not installed");
      } else if (msg.includes("locked")) {
        setErrorType("locked");
        setError("Wallet is locked. Please unlock it and try again.");
      } else if (msg.includes("network") || msg.includes("testnet") || msg.includes("public")) {
        setErrorType("wrong_network");
        setError("Please switch to the Stellar Public network in your wallet");
      } else {
        setErrorType("connection_failed");
        setError(err instanceof Error ? err.message : "Connection failed. Please try again.");
      }

      setStep("error");
    }
  };

  const handleRetry = () => {
    if (selectedWalletId) {
      handleWalletSelect(selectedWalletId);
    } else {
      resetModal();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-[480px] mx-4 rounded-2xl border border-white/10 bg-[#111726] p-8">
        {step !== "success" && (
          <button
            onClick={handleClose}
            aria-label="Close modal"
            className="absolute top-6 right-6 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Wallet selection */}
        {step === "idle" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Connect Your Wallet
              </h2>
              <p className="mt-2 text-sm text-[#9aa4bc]">
                Connect your Stellar wallet to start predicting
              </p>
            </div>

            <div className="space-y-3">
              {wallets.length === 0
                ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[60px] w-full animate-pulse rounded-xl border border-white/5 bg-[#0a0f1a]"
                  />
                ))
                : wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() =>
                      wallet.isAvailable && handleWalletSelect(wallet.id)
                    }
                    disabled={!wallet.isAvailable}
                    className={`w-full rounded-xl border px-4 py-4 text-left transition ${wallet.isAvailable
                      ? "border-white/10 bg-[#0f172a] hover:border-[#4FD1C5]/40 hover:bg-[#0f172a]"
                      : "border-white/5 bg-[#0a0f1a] cursor-not-allowed opacity-50"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {wallet.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={wallet.icon}
                          alt={wallet.name}
                          className="h-8 w-8 rounded-lg object-contain"
                        />
                      )}
                      <span className="flex-1 font-medium text-white">
                        {wallet.name}
                      </span>
                      {!wallet.isAvailable && (
                        <a
                          href={wallet.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-full bg-[#4FD1C5]/10 px-2 py-1 text-xs font-medium text-[#4FD1C5] hover:bg-[#4FD1C5]/20 transition"
                        >
                          Install <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </button>
                ))}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setExpandedFaq(!expandedFaq)}
                className="w-full rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 text-left text-sm font-medium text-white hover:border-[#4FD1C5]/40 transition"
              >
                What is a Stellar wallet?
              </button>
              {expandedFaq && (
                <div className="rounded-xl border border-white/10 bg-[#0a0f1a] px-4 py-3 text-sm text-[#9aa4bc]">
                  A Stellar wallet stores your account keys and lets you sign
                  transactions on the Stellar network. Freighter, xBull, and
                  Albedo are all browser-based options.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connecting */}
        {step === "connecting" && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#4FD1C5]/20 border-t-[#4FD1C5]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Connecting wallet...
              </h3>
              <p className="mt-2 text-sm text-[#9aa4bc]">
                Please approve the connection in your wallet extension
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-400" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Wallet Connected!
              </h3>
              <p className="mt-2 text-sm text-[#4FD1C5] font-mono">
                {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
              </p>
              <p className="mt-4 text-xs text-[#9aa4bc]">
                Redirecting to dashboard...
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white">
                {errorType === "not_installed"
                  ? "Wallet Not Installed"
                  : errorType === "locked"
                    ? "Wallet Locked"
                    : errorType === "wrong_network"
                      ? "Wrong Network"
                      : "Connection Failed"}
              </h3>
              <p className="mt-2 text-sm text-[#9aa4bc]">{error}</p>

              {errorType === "locked" && (
                <p className="mt-3 text-xs text-[#4FD1C5]">
                  Unlock your wallet extension and click retry
                </p>
              )}

              {errorType === "wrong_network" && (
                <p className="mt-3 text-xs text-[#4FD1C5]">
                  Open your wallet extension and switch to the Stellar Public network
                </p>
              )}
            </div>
            <div className="flex gap-3">
              {errorType === "not_installed" ? (
                <>
                  <button
                    onClick={resetModal}
                    className="flex-1 rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition"
                  >
                    Back
                  </button>
                  {selectedWalletId && (
                    <a
                      href={wallets.find(w => w.id === selectedWalletId)?.url || "https://www.freighter.app"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-[#4FD1C5]/10 border border-[#4FD1C5]/40 px-4 py-3 text-center text-sm font-medium text-[#4FD1C5] hover:bg-[#4FD1C5]/20 transition"
                    >
                      Install Wallet
                    </a>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={resetModal}
                    className="flex-1 rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRetry}
                    className="flex-1 rounded-xl bg-[#4FD1C5]/10 border border-[#4FD1C5]/40 px-4 py-3 text-sm font-medium text-[#4FD1C5] hover:bg-[#4FD1C5]/20 transition"
                  >
                    Retry Connection
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
