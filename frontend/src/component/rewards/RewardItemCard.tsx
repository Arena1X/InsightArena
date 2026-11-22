import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import type { WalletRewardItem } from "@/hooks/useRewards";

interface RewardItemCardProps {
  item: WalletRewardItem;
  onRetry?: (itemId: string) => void;
}

export default function RewardItemCard({ item, onRetry }: RewardItemCardProps) {
  const isPending = item.claimStatus === "pending";
  const isSuccess = item.claimStatus === "success";
  const isError = item.claimStatus === "error";
  const canRetry = isError && onRetry;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isSuccess
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isError
            ? "border-rose-500/30 bg-rose-500/5"
            : isPending
              ? "border-orange-500/30 bg-orange-500/5"
              : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white truncate">
            {item.marketTitle}
          </h4>
          <p className="mt-1 text-xs text-gray-400">
            {item.status === "claimable" ? "Ready to claim" : "Vesting"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-sm font-bold text-orange-400">
            {item.amountXlm.toFixed(2)} XLM
          </span>

          {/* Status indicator */}
          {isPending && (
            <span className="flex items-center gap-1.5 text-xs text-orange-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Claiming...
            </span>
          )}

          {isSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Claimed
            </span>
          )}

          {isError && (
            <div className="flex flex-col items-end gap-1">
              <span className="flex items-center gap-1.5 text-xs text-rose-400">
                <XCircle className="h-3.5 w-3.5" />
                Failed
              </span>
              {canRetry && (
                <button
                  onClick={() => onRetry(item.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-rose-300 hover:text-white transition"
                  aria-label="Retry claim"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {isError && item.claimError && (
        <p className="mt-2 text-xs text-rose-300/90">{item.claimError}</p>
      )}
    </div>
  );
}
