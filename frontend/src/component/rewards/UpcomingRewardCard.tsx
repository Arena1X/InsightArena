import { ReactNode } from "react";

export interface UpcomingRewardCardProps {
  category: string;
  amount: string;
  settlementLabel: string;
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

export default function UpcomingRewardCard({
  category,
  amount,
  settlementLabel,
  icon,
}: UpcomingRewardCardProps) {
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
        <span>{settlementLabel}</span>
      </div>
    </div>
  );
}
