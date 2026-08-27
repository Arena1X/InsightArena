// frontend/src/component/ActivePrediction.tsx
"use client";

import React from "react";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import {
  estimateCashOut,
  formatPnlXlm,
  formatXlm,
} from "@/lib/utils";

type Prediction = {
  id: string;
  marketId: string;
  category: string;
  market: string;
  stance: "Yes" | "No";
  status: string;
  timeRemaining: string;
  /** Stake in XLM */
  stake: number;
  /** Entry implied price 0–1 for the chosen side */
  entryOdds: number;
  marketLocked?: boolean;
};

const predictions: Prediction[] = [
  {
    id: "1",
    marketId: "btc-95k-friday",
    category: "Crypto",
    market: "BTC above $95,000 by Friday",
    stance: "Yes",
    status: "Live",
    timeRemaining: "Ends in 19h",
    stake: 50,
    entryOdds: 0.55,
    marketLocked: false,
  },
  {
    id: "2",
    marketId: "spx-4500-friday",
    category: "Finance",
    market: "S&P 500 above 4500 by Friday",
    stance: "No",
    status: "Live",
    timeRemaining: "Ends in 12h",
    stake: 40,
    entryOdds: 0.48,
    marketLocked: true,
  },
];

function PredictionCard({ p }: { p: Prediction }) {
  const { odds, status: oddsStatus } = useLiveOdds(
    p.marketLocked ? null : p.marketId,
  );

  const live =
    odds && Number.isFinite(odds.yesOdds) && Number.isFinite(odds.noOdds)
      ? { yes: odds.yesOdds, no: odds.noOdds }
      : null;

  const estimate = estimateCashOut({
    stake: p.stake,
    stance: p.stance,
    entryOdds: p.entryOdds,
    live,
    marketLocked: p.marketLocked,
  });

  return (
    <div className="min-w-[250px] bg-gray-50 rounded-lg p-4 flex flex-col gap-2 shadow-sm">
      <span className="text-xs font-medium text-gray-500">{p.category}</span>
      <h3 className="font-bold text-md">{p.market}</h3>
      <span className="text-sm">Prediction: {p.stance}</span>
      <span className="text-sm text-gray-600">Stake: {formatXlm(p.stake)}</span>

      <div className="flex items-center gap-2 text-sm">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>{p.status}</span>
        <span className="ml-auto text-gray-500">{p.timeRemaining}</span>
      </div>

      <div className="mt-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Est. value</span>
          <span className="font-semibold text-blue-600">
            {formatXlm(estimate.estimatedValue)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Unrealized P/L</span>
          <span
            className={
              estimate.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"
            }
          >
            {formatPnlXlm(estimate.unrealizedPnl)}
          </span>
        </div>
        {oddsStatus === "polling" || oddsStatus === "connecting" ? (
          <p className="text-xs text-gray-400 mt-1">Updating live odds…</p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!estimate.canExit}
        className={
          estimate.canExit
            ? "mt-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            : "mt-2 rounded-md bg-gray-300 px-3 py-2 text-sm font-medium text-gray-600 cursor-not-allowed"
        }
        title={estimate.exitBlockedReason ?? "Cash out at live estimate"}
      >
        {estimate.canExit ? "Cash out" : "Exit unavailable"}
      </button>
      {!estimate.canExit && estimate.exitBlockedReason ? (
        <p className="text-xs text-amber-700">{estimate.exitBlockedReason}</p>
      ) : null}
    </div>
  );
}

const ActivePrediction: React.FC = () => {
  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Active Predictions</h2>
        <a href="/predictions" className="text-blue-600 hover:underline">
          View All Predictions &gt;
        </a>
      </div>

      <div className="flex gap-4 overflow-x-auto">
        {predictions.map((p) => (
          <PredictionCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
};

export default ActivePrediction;
