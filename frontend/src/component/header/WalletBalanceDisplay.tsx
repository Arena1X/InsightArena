"use client";

import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useWallet } from "@/context/WalletContext";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

export function WalletBalanceDisplay() {
  const { isAuthenticated } = useWallet();
  const { balance, loading, error, refetch, isRefreshing } = useWalletBalance();

  if (!isAuthenticated) {
    return null;
  }

  const formatBalance = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div
      className="relative flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2"
      title={error || ""}
    >
      {loading && !balance ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#4FD1C5]" />
      ) : error && !balance ? (
        <AlertCircle className="h-4 w-4 text-red-400" />
      ) : null}

      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs text-slate-400">Balance</span>
        <span className="text-sm font-semibold text-white">
          {balance
            ? `${formatBalance(balance.balance)} ${balance.displayCurrency}`
            : "—"}
        </span>
      </div>

      {balance && (
        <button
          onClick={() => refetch()}
          disabled={loading || isRefreshing}
          aria-label="Refresh balance"
          title={isRefreshing ? "Updating..." : "Refresh balance"}
          className="ml-1 text-slate-400 hover:text-white disabled:opacity-50 transition"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading || isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      )}

      {/* Subtle pulse indicator for background refresh */}
      {isRefreshing && balance && (
        <div
          className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#4FD1C5] animate-pulse"
          aria-hidden="true"
          title="Updating balance..."
        />
      )}
    </div>
  );
}
