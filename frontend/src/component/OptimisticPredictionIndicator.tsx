import React from "react";
import { CheckCircle, AlertCircle, Clock, Loader } from "lucide-react";

export interface OptimisticPredictionIndicatorProps {
  status: "pending" | "confirmed" | "failed" | "timeout";
  amount: number;
  direction: "yes" | "no";
  error?: string;
  onDismiss?: () => void;
  onCheckAgain?: () => void;
}

export function OptimisticPredictionIndicator({
  status,
  amount,
  direction,
  error,
  onDismiss,
  onCheckAgain,
}: OptimisticPredictionIndicatorProps) {
  const isPending = status === "pending";
  const isConfirmed = status === "confirmed";
  const isFailed = status === "failed";
  const isTimeout = status === "timeout";

  let bgColor = "bg-blue-500/10 border-blue-500/50";
  let textColor = "text-blue-300";
  let icon = <Loader size={16} className="animate-spin" />;
  let label = "Placing";

  if (isConfirmed) {
    bgColor = "bg-green-500/10 border-green-500/50";
    textColor = "text-green-300";
    icon = <CheckCircle size={16} />;
    label = "Placed";
  } else if (isFailed) {
    bgColor = "bg-red-500/10 border-red-500/50";
    textColor = "text-red-300";
    icon = <AlertCircle size={16} />;
    label = "Failed";
  } else if (isTimeout) {
    bgColor = "bg-amber-500/10 border-amber-500/50";
    textColor = "text-amber-300";
    icon = <Clock size={16} />;
    label = "Taking longer than expected";
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border ${bgColor} px-3 py-2 text-sm ${textColor}`}
    >
      {icon}
      <div className="flex-1">
        <span className="font-medium">
          {label} {direction.toUpperCase()} prediction
        </span>
        <span className="ml-1">({amount.toFixed(2)} XLM)</span>
      </div>
      {isFailed && error && (
        <div className="text-xs">
          <p>{error}</p>
        </div>
      )}
      {isTimeout && onCheckAgain && (
        <button
          onClick={onCheckAgain}
          className="ml-2 shrink-0 rounded border border-amber-500/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
        >
          Check again
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-2 text-white/50 hover:text-white"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
