"use client";

import { useState } from "react";

export type TimeRange = "daily" | "weekly" | "monthly" | "all-time";
export type Category = "all" | "crypto" | "sports" | "politics" | "custom";
export type SortBy = "points" | "win-rate" | "predictions";

export interface LeaderboardFiltersState {
  timeRange: TimeRange;
  category: Category;
  sortBy: SortBy;
}

interface LeaderboardFiltersProps {
  onChange?: (filters: LeaderboardFiltersState) => void;
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "All Time", value: "all-time" },
];

const CATEGORIES: { label: string; value: Category }[] = [
  { label: "All", value: "all" },
  { label: "Crypto", value: "crypto" },
  { label: "Sports", value: "sports" },
  { label: "Politics", value: "politics" },
  { label: "Custom", value: "custom" },
];

const SORT_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Points", value: "points" },
  { label: "Win Rate", value: "win-rate" },
  { label: "Predictions", value: "predictions" },
];

export default function LeaderboardFilters({ onChange }: LeaderboardFiltersProps) {
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    timeRange: "weekly",
    category: "all",
    sortBy: "points",
  });

  function update<K extends keyof LeaderboardFiltersState>(
    key: K,
    value: LeaderboardFiltersState[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      {/* Time range pill group */}
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0f172a] p-1">
        {TIME_RANGES.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => update("timeRange", value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filters.timeRange === value
                ? "bg-[#4FD1C5] text-[#0f172a]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Category select */}
      <div className="relative">
        <select
          value={filters.category}
          onChange={(e) => update("category", e.target.value as Category)}
          className="appearance-none rounded-xl border border-white/10 bg-[#0f172a] px-4 py-2 pr-8 text-xs font-medium text-gray-300 transition hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-[#4FD1C5]/50 cursor-pointer"
        >
          {CATEGORIES.map(({ label, value }) => (
            <option key={value} value={value}>
              {label === "All" ? "All Categories" : label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Sort by select */}
      <div className="relative sm:ml-auto">
        <select
          value={filters.sortBy}
          onChange={(e) => update("sortBy", e.target.value as SortBy)}
          className="appearance-none rounded-xl border border-white/10 bg-[#0f172a] px-4 py-2 pr-8 text-xs font-medium text-gray-300 transition hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-[#4FD1C5]/50 cursor-pointer"
        >
          {SORT_OPTIONS.map(({ label, value }) => (
            <option key={value} value={value}>
              Sort: {label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
