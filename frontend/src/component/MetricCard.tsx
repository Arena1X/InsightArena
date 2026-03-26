import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  trend?: "up" | "down";
}

export default function MetricCard({ title, value, trend }: MetricCardProps) {
  const trendIcon =
    trend === "up" ? (
      <TrendingUp className="w-4 h-4 text-emerald-400" />
    ) : trend === "down" ? (
      <TrendingDown className="w-4 h-4 text-red-400" />
    ) : null;

  return (
    <div className="bg-[#0f172a] border border-gray-700/30 rounded-2xl p-5 shadow-sm hover:shadow-lg transition">
      <p className="text-gray-300 text-xs uppercase tracking-wide font-semibold mb-2">
        {title}
      </p>
      <div className="flex items-center gap-2">
        <p className="text-white text-2xl md:text-3xl font-bold">{value}</p>
        {trendIcon}
      </div>
    </div>
  );
}
