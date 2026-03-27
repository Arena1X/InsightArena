import { ReactNode } from "react";

export interface RewardSourceRowProps {
  icon: ReactNode;
  label: string;
  amount: string;
  percentage: number; // 0–100
  barColor: string;   // Tailwind bg class e.g. "bg-[#4FD1C5]"
}

export default function RewardSourceRow({
  icon,
  label,
  amount,
  percentage,
  barColor,
}: RewardSourceRowProps) {
  const clampedPct = Math.min(100, Math.max(0, percentage));

  return (
    <div className="flex items-center gap-4 py-3.5 px-5 rounded-xl hover:bg-white/[0.02] transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-lg">
        {icon}
      </div>

      {/* Label + bar */}
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm font-medium mb-2">{label}</p>
        <div className="h-1.5 w-full rounded-full bg-gray-700/50">
          <div
            className={`h-1.5 rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
      </div>

      {/* Amount + pct */}
      <div className="flex-shrink-0 text-right ml-4">
        <p className="text-white text-sm font-semibold">{amount}</p>
        <p className="text-gray-500 text-xs mt-0.5">{clampedPct}%</p>
      </div>
    </div>
  );
}
