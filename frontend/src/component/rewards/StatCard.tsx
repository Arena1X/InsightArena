import { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: string;
  supportingText?: string;
  icon?: ReactNode;
  valueColor?: string; // Tailwind text color class, defaults to white
}

export default function StatCard({
  label,
  value,
  supportingText,
  icon,
  valueColor = "text-white",
}: StatCardProps) {
  return (
    <div className="bg-[#0f172a] border border-gray-700/30 rounded-2xl p-5 flex flex-col justify-between min-h-[110px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider leading-tight">
          {label}
        </p>
        {icon && (
          <span className="text-gray-500 flex-shrink-0">{icon}</span>
        )}
      </div>
      <div className="mt-3">
        <p className={`text-2xl font-bold leading-none ${valueColor}`}>
          {value}
        </p>
        {supportingText && (
          <p className="text-gray-500 text-xs mt-1.5">{supportingText}</p>
        )}
      </div>
    </div>
  );
}
