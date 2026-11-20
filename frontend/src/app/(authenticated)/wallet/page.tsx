"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/hooks/useToast";
import { EmptyState } from "@/component/ui/empty-state";

type TxType = "Stake" | "Payout" | "Refund" | "Season Reward";
type TxStatus = "Confirmed" | "Pending";
type TxFilter = "All" | TxType;

interface Transaction {
  id: string;
  date: string;
  type: TxType;
  description: string;
  amount: string;
  status: TxStatus;
}

function getSeedFromAddress(address: string): number {
  let seed = 0;
  for (let i = 0; i < address.length; i++) {
    seed += address.charCodeAt(i);
  }
  return seed;
}
const PLACEHOLDER_ADDRESS =
  "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";

const baseSeed = getSeedFromAddress(PLACEHOLDER_ADDRESS);

const marketPool = [
  "Will XLM close above $0.25?",
  "BTC above $80k — YES won",
  "Argentina wins Copa América?",
  "Ethereum ETF — Market Cancelled",
  "Solana active accounts cross 5M",
  "Stellar Soroban upgrade mainnet deployment",
];

const transactionTypes: TxType[] = ["Stake", "Payout", "Stake", "Refund"];

const TRANSACTIONS: Transaction[] = Array.from({ length: 8 }).map(
  (_, index) => {
    const itemSeed = baseSeed + index * 47;
    const type = transactionTypes[itemSeed % transactionTypes.length];
    const description = marketPool[itemSeed % marketPool.length];

    let amountValue = "";
    if (type === "Payout") amountValue = `+${50 + (itemSeed % 150)} XLM`;
    if (type === "Stake") amountValue = `-${15 + (itemSeed % 45)} XLM`;
    if (type === "Refund") amountValue = `+${20 + (itemSeed % 30)} XLM`;

    const computedDay = 29 - index;
    const deliveryDay = computedDay < 1 ? 1 : computedDay;
    const dateString = `2026-05-${deliveryDay.toString().padStart(2, "0")}`;

    return {
      id: `tx-generated-id-${itemSeed}`,
      date: dateString,
      type,
      description,
      amount: amountValue,
      status: "Confirmed",
    };
  },
);

const TYPE_COLORS: Record<TxType, string> = {
  Stake: "bg-orange-500/20 text-orange-400",
  Payout: "bg-emerald-500/20 text-emerald-400",
  Refund: "bg-blue-500/20 text-blue-400",
  "Season Reward": "bg-yellow-500/20 text-yellow-400",
};

const STATUS_COLORS: Record<TxStatus, string> = {
  Confirmed: "text-emerald-400",
  Pending: "text-yellow-400",
};

const TX_FILTER_OPTIONS: TxFilter[] = [
  "All",
  "Stake",
  "Payout",
  "Refund",
  "Season Reward",
];

function isValidTxFilter(value: string | null): value is TxFilter {
  return (
    value !== null &&
    (TX_FILTER_OPTIONS as string[]).includes(value)
  );
}

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function useTransactionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawType = searchParams.get("type");
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");

  const typeFilter: TxFilter = isValidTxFilter(rawType) ? rawType : "All";
  const dateFrom: string = isValidDate(rawFrom) ? rawFrom : "";
  const dateTo: string = isValidDate(rawTo) ? rawTo : "";

  const updateParams = useCallback(
    (patch: { type?: TxFilter; from?: string; to?: string }) => {
      const next = new URLSearchParams(searchParams.toString());

      const newType = patch.type ?? typeFilter;
      const newFrom = patch.from !== undefined ? patch.from : dateFrom;
      const newTo = patch.to !== undefined ? patch.to : dateTo;

      if (newType === "All") {
        next.delete("type");
      } else {
        next.set("type", newType);
      }

      if (newFrom) {
        next.set("from", newFrom);
      } else {
        next.delete("from");
      }

      if (newTo) {
        next.set("to", newTo);
      } else {
        next.delete("to");
      }

      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams, typeFilter, dateFrom, dateTo],
  );

  const clearFilters = useCallback(() => {
    router.replace("?", { scroll: false });
  }, [router]);

  return { typeFilter, dateFrom, dateTo, updateParams, clearFilters };
}

function applyFilters(
  transactions: Transaction[],
  typeFilter: TxFilter,
  dateFrom: string,
  dateTo: string,
): Transaction[] {
  return transactions.filter((tx) => {
    if (typeFilter !== "All" && tx.type !== typeFilter) return false;
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    return true;
  });
}

export default function WalletPage() {
  const { logout } = useWallet();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { typeFilter, dateFrom, dateTo, updateParams, clearFilters } =
    useTransactionFilters();

  const dynamicAvailable = `${(1000 + (baseSeed % 850) + 0.5).toLocaleString(undefined, { minimumFractionDigits: 2 })} XLM`;
  const dynamicStaked = `${(50 + (baseSeed % 200)).toFixed(2)} XLM`;
  const dynamicWinnings = `${(100 + (baseSeed % 500)).toFixed(2)} XLM`;

  const filteredTx = applyFilters(TRANSACTIONS, typeFilter, dateFrom, dateTo);

  const hasActiveFilters =
    typeFilter !== "All" || dateFrom !== "" || dateTo !== "";

  const handleCopy = () => {
    navigator.clipboard.writeText(PLACEHOLDER_ADDRESS).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buildCsv = () => {
    const escapeValue = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Type", "Market / Description", "Amount", "Status"],
      ...filteredTx.map((transaction) => [
        transaction.date,
        transaction.type,
        transaction.description,
        transaction.amount,
        transaction.status,
      ]),
    ];
    return rows.map((row) => row.map(escapeValue).join(",")).join("\r\n");
  };

  const handleExport = async () => {
    if (filteredTx.length === 0) {
      toast.info("There are no transactions in the current filter to export.");
      return;
    }

    setIsExporting(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));

      const blob = new Blob([buildCsv()], {
        type: "text/csv;charset=utf-8;",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `insightarena-transactions-${typeFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Transaction history exported successfully.");
    } catch {
      toast.error("Failed to export transaction history.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Wallet Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm text-white break-all">
            {PLACEHOLDER_ADDRESS}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-white/10 transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy"}
          </button>
          <span className="inline-block rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400">
            Testnet
          </span>
        </div>
        <button
          onClick={logout}
          className="text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Disconnect Wallet
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Available Balance",
            value: dynamicAvailable,
            accent: "text-emerald-400",
          },
          {
            label: "Staked in Predictions",
            value: dynamicStaked,
            accent: "text-orange-400",
          },
          {
            label: "Total Winnings",
            value: dynamicWinnings,
            accent: "text-yellow-400",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1"
          >
            <p className="text-xs text-gray-400">{card.label}</p>
            <p className={`text-xl font-bold ${card.accent}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`https://stellar.expert/explorer/testnet/account/${PLACEHOLDER_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors"
        >
          View on Stellar Explorer ↗
        </Link>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500 transition-colors"
        >
          {isExporting ? "Exporting..." : "Export Transaction History"}
        </button>
      </div>

      {/* Transaction History */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            Transaction History
          </h2>

          {/* Filters */}
          <div
            className="flex flex-col sm:flex-row gap-2 sm:items-end"
            data-testid="transaction-filters"
          >
            {/* Type filter */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="tx-type-filter"
                className="text-xs text-gray-400 sr-only"
              >
                Filter by type
              </label>
              <select
                id="tx-type-filter"
                aria-label="Filter by transaction type"
                value={typeFilter}
                onChange={(e) =>
                  updateParams({ type: e.target.value as TxFilter })
                }
                className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              >
                {TX_FILTER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t === "All" ? "All Types" : t}
                  </option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="tx-date-from"
                className="text-xs text-gray-400"
              >
                From
              </label>
              <input
                id="tx-date-from"
                type="date"
                aria-label="Filter from date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => updateParams({ from: e.target.value })}
                className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="tx-date-to"
                className="text-xs text-gray-400"
              >
                To
              </label>
              <input
                id="tx-date-to"
                type="date"
                aria-label="Filter to date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => updateParams({ to: e.target.value })}
                className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
            </div>

            {/* Clear filters button — only shown when a filter is active */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors self-end"
                aria-label="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <EmptyState
            title="No transactions match"
            description={
              hasActiveFilters
                ? "Try adjusting the type or date range filters."
                : "Your transaction history will appear here."
            }
            secondaryAction={
              hasActiveFilters
                ? { label: "Clear filters", onClick: clearFilters }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Market / Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTx.map((tx) => (
                  <tr key={tx.id} className="bg-black/20 hover:bg-white/5">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[tx.type]}`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">
                      {tx.description}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium whitespace-nowrap ${tx.amount.startsWith("+") ? "text-emerald-400" : "text-gray-300"}`}
                    >
                      {tx.amount}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${STATUS_COLORS[tx.status]}`}
                    >
                      {tx.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
