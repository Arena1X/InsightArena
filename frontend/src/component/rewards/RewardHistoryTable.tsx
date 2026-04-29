"use client";

import RewardStatusBadge, { RewardStatus } from "./RewardStatusBadge";
import RewardTypeBadge, { RewardType } from "./RewardTypeBadge";

export interface RewardHistoryEntry {
  id: string;
  sourceIcon: string;
  sourceName: string;
  type: RewardType;
  amount: string;
  status: RewardStatus;
  date: string;
}

interface RewardHistoryTableProps {
  entries: RewardHistoryEntry[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

const columns = ["Source", "Type", "Amount", "Status", "Date"];

export default function RewardHistoryTable({
  entries,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: RewardHistoryTableProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Section heading */}
      <div className="px-6 py-5 border-b border-white/10">
        <h2 className="text-white font-semibold text-lg">Reward History</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Your previously earned rewards and payout states
        </p>
      </div>

      {/* Scrollable table wrapper */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <p className="text-gray-500 text-sm">No reward history yet</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Rewards you earn will appear here
                  </p>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-white/[0.02] transition-colors duration-150"
                >
                  {/* Source */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-base flex-shrink-0">
                        {entry.sourceIcon}
                      </div>
                      <span className="text-gray-200 text-sm font-medium whitespace-nowrap">
                        {entry.sourceName}
                      </span>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-6 py-4">
                    <RewardTypeBadge type={entry.type} />
                  </td>

                  {/* Amount */}
                  <td className="px-6 py-4">
                    <span className="text-yellow-400 font-semibold text-sm">
                      {entry.amount}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <RewardStatusBadge status={entry.status} />
                  </td>

                  {/* Date */}
                  <td className="px-6 py-4">
                    <span className="text-gray-400 text-sm whitespace-nowrap">
                      {entry.date}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {(hasMore || entries.length > 0) && (
        <div className="px-6 py-5 border-t border-white/10 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading || !hasMore}
            className="px-6 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 text-sm font-medium
              hover:border-orange-500/50 hover:text-orange-400 transition-colors duration-200
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:text-gray-300"
          >
            {isLoading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
