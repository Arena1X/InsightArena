"use client";

import { useMemo, useState } from "react";

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

type SortKey = "source" | "type" | "amount" | "status" | "date";
type SortDirection = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
}

const columns: ColumnDef[] = [
  { key: "source", label: "Source" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
  { key: "date", label: "Date" },
];

const DEFAULT_SORT: { key: SortKey; direction: SortDirection } = {
  key: "date",
  direction: "desc",
};

const EMPTY_PLACEHOLDER = "—";

function parseAmount(amount: string): number {
  const parsed = Number.parseFloat(String(amount).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(date: string): number {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortValue(entry: RewardHistoryEntry, key: SortKey): string | number {
  switch (key) {
    case "amount":
      return parseAmount(entry.amount);
    case "date":
      return parseDate(entry.date);
    case "source":
      return entry.sourceName ?? "";
    case "type":
      return entry.type ?? "";
    case "status":
      return entry.status ?? "";
    default:
      return "";
  }
}

function compareEntries(
  a: RewardHistoryEntry,
  b: RewardHistoryEntry,
  key: SortKey,
  direction: SortDirection,
): number {
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);

  let result: number;
  if (typeof aValue === "number" && typeof bValue === "number") {
    result = aValue - bValue;
  } else {
    result = String(aValue).localeCompare(String(bValue), undefined, {
      sensitivity: "base",
    });
  }

  if (result === 0) {
    // Stable tie-breaker so equal values keep a deterministic order.
    result = a.id.localeCompare(b.id);
  }

  return direction === "asc" ? result : -result;
}

function escapeCsvCell(value: string): string {
  const safe = value ?? "";
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildCsv(rows: RewardHistoryEntry[]): string {
  const header = columns.map((col) => col.label).join(",");
  const body = rows.map((entry) =>
    [
      entry.sourceName ?? "",
      entry.type ?? "",
      entry.amount ?? "",
      entry.status ?? "",
      entry.date ?? "",
    ]
      .map((cell) => escapeCsvCell(String(cell)))
      .join(","),
  );
  return [header, ...body].join("\n");
}

export default function RewardHistoryTable({
  entries,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: RewardHistoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT.direction,
  );

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      compareEntries(a, b, sortKey, sortDirection),
    );
  }, [entries, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const handleExportCsv = () => {
    const csv = buildCsv(sortedEntries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reward-history.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Section heading */}
      <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white font-semibold text-lg">Reward History</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Your previously earned rewards and payout states
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={sortedEntries.length === 0}
          className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 text-sm font-medium
            hover:border-orange-500/50 hover:text-orange-400 transition-colors duration-200
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:text-gray-300"
        >
          Export CSV
        </button>
      </div>

      {/* Scrollable table wrapper */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => {
                const isActive = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      aria-sort={
                        isActive
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-orange-400 transition-colors duration-150"
                    >
                      {col.label}
                      <span aria-hidden="true" className="text-[10px]">
                        {isActive ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <p className="text-gray-500 text-sm">No reward history yet</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Rewards you earn will appear here
                  </p>
                </td>
              </tr>
            ) : (
              sortedEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-white/[0.02] transition-colors duration-150"
                >
                  {/* Source */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-base flex-shrink-0">
                        {entry.sourceIcon || EMPTY_PLACEHOLDER}
                      </div>
                      <span className="text-gray-200 text-sm font-medium whitespace-nowrap">
                        {entry.sourceName || EMPTY_PLACEHOLDER}
                      </span>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-6 py-4">
                    {entry.type ? (
                      <RewardTypeBadge type={entry.type} />
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {EMPTY_PLACEHOLDER}
                      </span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-6 py-4">
                    <span className="text-yellow-400 font-semibold text-sm">
                      {entry.amount || EMPTY_PLACEHOLDER}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    {entry.status ? (
                      <RewardStatusBadge status={entry.status} />
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {EMPTY_PLACEHOLDER}
                      </span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="px-6 py-4">
                    <span className="text-gray-400 text-sm whitespace-nowrap">
                      {entry.date || EMPTY_PLACEHOLDER}
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
