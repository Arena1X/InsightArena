"use client";

import { useEffect, useState } from "react";
import { X, Check, AlertCircle, ExternalLink } from "lucide-react";

type ModalStep = "idle" | "connecting" | "success" | "error";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (address: string, token: string) => void;
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
  const [connectedAddress, setConnectedAddress] = useState("");
  const [expandedFaq, setExpandedFaq] = useState(false);

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
    setConnectedAddress("");
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleWalletSelect = async (walletId: string) => {
    setStep("connecting");

    try {
      const { StellarWalletsKit } =
        await import("@creit-tech/stellar-wallets-kit/sdk");

      StellarWalletsKit.setWallet(walletId);
      const { address } = await StellarWalletsKit.fetchAddress();

      setConnectedAddress(address);
      setStep("success");

      // Let WalletContext handle the redirect via onSuccess
      setTimeout(() => {
        onSuccess(address, `wallet_${address}`);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("reject") ||
        msg.toLowerCase().includes("user closed") ||
        msg.toLowerCase().includes("denied")
      ) {
        resetModal();
        return;
      }
      setError(msg || "Connection failed. Please try again.");
      setStep("error");
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
                      className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                        wallet.isAvailable
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
                Connection Failed
              </h3>
              <p className="mt-2 text-sm text-[#9aa4bc]">{error}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setError("");
                  setStep("idle");
                }}
                className="flex-1 rounded-xl bg-[#4FD1C5]/10 border border-[#4FD1C5]/40 px-4 py-3 text-sm font-medium text-[#4FD1C5] hover:bg-[#4FD1C5]/20 transition"
              >
                Try Again
              </button>
              <a
                href="https://www.freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl border border-white/10 bg-[#0f172a] px-4 py-3 text-center text-sm font-medium text-white hover:bg-white/5 transition"
              >
                Get a Wallet
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
