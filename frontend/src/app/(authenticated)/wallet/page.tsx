"use client";

import { useState } from "react";
import Link from "next/link";

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

const PLACEHOLDER_ADDRESS = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";

const TRANSACTIONS: Transaction[] = [
  { id: "1", date: "2025-06-10", type: "Stake", description: "Will XLM close above $0.25?", amount: "-50 XLM", status: "Confirmed" },
  { id: "2", date: "2025-06-09", type: "Payout", description: "BTC above $80k — YES won", amount: "+120 XLM", status: "Confirmed" },
  { id: "3", date: "2025-06-08", type: "Stake", description: "Argentina wins Copa América?", amount: "-30 XLM", status: "Confirmed" },
  { id: "4", date: "2025-06-07", type: "Refund", description: "Ethereum ETF — Market Cancelled", amount: "+30 XLM", status: "Confirmed" },
  { id: "5", date: "2025-06-06", type: "Season Reward", description: "Season 7 top-100 finish", amount: "+200 XLM", status: "Confirmed" },
  { id: "6", date: "2025-06-05", type: "Stake", description: "US Fed rate cut Sept?", amount: "-25 XLM", status: "Pending" },
  { id: "7", date: "2025-06-04", type: "Payout", description: "GPT-5 before July — YES won", amount: "+60 XLM", status: "Confirmed" },
  { id: "8", date: "2025-06-03", type: "Stake", description: "OpenAI GPT-5 release", amount: "-40 XLM", status: "Confirmed" },
];

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

function truncateAddress(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function WalletPage() {
  const [copied, setCopied] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TxFilter>("All");

  const handleCopy = () => {
    navigator.clipboard.writeText(PLACEHOLDER_ADDRESS).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTx = typeFilter === "All"
    ? TRANSACTIONS
    : TRANSACTIONS.filter((t) => t.type === typeFilter);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Wallet Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm text-white break-all">{PLACEHOLDER_ADDRESS}</span>
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
        <button className="text-sm text-red-400 hover:text-red-300 transition-colors">
          Disconnect Wallet
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Available Balance", value: "1,240.50 XLM", accent: "text-emerald-400" },
          { label: "Staked in Predictions", value: "145.00 XLM", accent: "text-orange-400" },
          { label: "Total Winnings", value: "380.00 XLM", accent: "text-yellow-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
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
        <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed" disabled>
          Export Transaction History
        </button>
      </div>

      {/* Transaction History */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Transaction History</h2>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TxFilter)}
            className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
          >
            {["All", "Stake", "Payout", "Refund", "Season Reward"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

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
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{tx.date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[tx.type]}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">{tx.description}</td>
                  <td className={`px-4 py-3 font-medium whitespace-nowrap ${tx.amount.startsWith("+") ? "text-emerald-400" : "text-gray-300"}`}>
                    {tx.amount}
                  </td>
                  <td className={`px-4 py-3 font-medium ${STATUS_COLORS[tx.status]}`}>
                    {tx.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTx.length === 0 && (
            <div className="py-10 text-center text-gray-400 text-sm">No transactions match the filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}
