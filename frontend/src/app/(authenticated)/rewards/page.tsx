"use client";

import { useState } from "react";
import RewardSources from "@/component/rewards/RewardSources";
import RewardHistoryTable, {
  RewardHistoryEntry,
} from "@/component/rewards/RewardHistoryTable";

const MOCK_ENTRIES: RewardHistoryEntry[] = [
  {
    id: "1",
    sourceIcon: "🏆",
    sourceName: "Crypto Cup Q1",
    type: "competition",
    amount: "$120.00",
    status: "claimed",
    date: "Mar 24, 2026",
  },
  {
    id: "2",
    sourceIcon: "📈",
    sourceName: "BTC Price Prediction",
    type: "prediction",
    amount: "$45.50",
    status: "claimed",
    date: "Mar 20, 2026",
  },
  {
    id: "3",
    sourceIcon: "🎁",
    sourceName: "March Airdrop",
    type: "airdrop",
    amount: "50 XLM",
    status: "processing",
    date: "Mar 18, 2026",
  },
  {
    id: "4",
    sourceIcon: "👥",
    sourceName: "Referral Bonus",
    type: "referral",
    amount: "$25.00",
    status: "pending",
    date: "Mar 15, 2026",
  },
  {
    id: "5",
    sourceIcon: "⭐",
    sourceName: "Weekly Bonus",
    type: "bonus",
    amount: "$10.00",
    status: "claimed",
    date: "Mar 10, 2026",
  },
];

export default function RewardsPage() {
  const [entries, setEntries] = useState<RewardHistoryEntry[]>(
    MOCK_ENTRIES.slice(0, 4)
  );
  const [isLoading, setIsLoading] = useState(false);
  const hasMore = entries.length < MOCK_ENTRIES.length;

  function handleLoadMore() {
    setIsLoading(true);
    // Simulate async fetch
    setTimeout(() => {
      setEntries(MOCK_ENTRIES);
      setIsLoading(false);
    }, 800);
  }

  return (
    <div className="space-y-6">
      <RewardSources />
      <RewardHistoryTable
        entries={entries}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoading={isLoading}
      />
    </div>
  );
}
