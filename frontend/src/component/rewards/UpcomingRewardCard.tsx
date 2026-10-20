import { ReactNode } from "react";
import { useCountdown } from "@/hooks/useCountdown";

export interface UpcomingRewardCardProps {
  category: string;
  amount: string;
  /**
   * The reward's settlement date/time. Drives a live-ticking countdown via
   * useCountdown rather than a pre-formatted string computed once on render
   * (#1577) - once this passes, the card shows a "Processing" state instead
   * of a stale or negative countdown.
   */
  settlementDate: string | Date | number;
  icon?: ReactNode;
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

function formatSettlement(settlementDate: string | Date | number): string {
  const date =
    typeof settlementDate === "string" || typeof settlementDate === "number"
      ? new Date(settlementDate)
      : settlementDate;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function UpcomingRewardCard({
  category,
  amount,
  settlementDate,
  icon,
}: UpcomingRewardCardProps) {
  const countdown = useCountdown(settlementDate);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col justify-between min-h-[140px] hover:border-white/20 transition-colors">
      {/* Category */}
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider truncate">
          {category}
        </p>
      </div>

      {/* Amount */}
      <p className="text-white text-3xl font-bold mt-3 mb-4">{amount}</p>

      {/* Settlement */}
      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
        <ClockIcon />
        {countdown.isExpired ? (
          <span
            role="status"
            className="text-amber-400 font-medium uppercase tracking-wide"
          >
            Processing
          </span>
        ) : (
          <span>Settles on {formatSettlement(settlementDate)}</span>
        )}
      </div>
    </div>
  );
}
