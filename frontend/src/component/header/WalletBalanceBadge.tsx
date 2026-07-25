"use client";

import { Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useWalletBalance } from "@/hooks/useWalletBalance";

/**
 * Formats a raw Stellar balance string (7 decimal places) for display.
 * e.g. "1250.0000000" → "1,250.00 XLM"
 */
function formatXlm(raw: string): string {
  const num = parseFloat(raw.replace(/,/g, ""));
  if (isNaN(num)) return "— XLM";
  return (
    num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " XLM"
  );
}

/**
 * Compact badge shown in the header when a wallet is connected.
 * Hides gracefully when disconnected.
 */
export default function WalletBalanceBadge() {
  const { isAuthenticated, address } = useWallet();
  const { xlm, loading } = useWalletBalance(isAuthenticated ? address : null);

  if (!isAuthenticated) return null;

  return (
    <div
      className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111726] px-3 py-2 text-xs font-semibold text-gray-200"
      title="Wallet XLM balance"
      aria-label={`Wallet balance: ${xlm ? formatXlm(xlm) : "loading"}`}
    >
      <Wallet
        className="h-3.5 w-3.5 text-orange-400 shrink-0"
        aria-hidden="true"
      />
      {loading && !xlm ? (
        <span
          className="h-2.5 w-16 animate-pulse rounded-full bg-white/10"
          aria-hidden="true"
        />
      ) : xlm ? (
        <span>{formatXlm(xlm)}</span>
      ) : (
        <span className="text-gray-500">— XLM</span>
      )}
    </div>
  );
}
