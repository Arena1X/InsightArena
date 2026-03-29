"use client";

import LeaderboardOverview from "@/component/leaderboard/LeaderboardOverview";
import LeaderboardFilters, {
  LeaderboardFiltersState,
} from "@/component/leaderboard/LeaderboardFilters";
import { useState } from "react";

export default function LeaderboardsPage() {
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    timeRange: "weekly",
    category: "all",
    sortBy: "points",
  });

  return (
    <div className="space-y-6">
      <LeaderboardOverview />
      <LeaderboardFilters onChange={setFilters} />
      {/* Ranking table/list goes here — receives `filters` as props */}
    </div>
  );
}
