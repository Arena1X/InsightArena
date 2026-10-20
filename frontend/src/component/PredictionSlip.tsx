"use client";

import { X, Minus, Plus, ShoppingCart, Loader2, Check } from "lucide-react";
import { usePredictionSlip } from "@/context/PredictionSlipContext";
import { useState } from "react";

export function PredictionSlipFloatingButton() {
  const { itemCount, toggleSlip, isOpen } = usePredictionSlip();

  if (isOpen) return null;

  return (
    <button
      onClick={toggleSlip}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-white shadow-lg hover:bg-orange-400 transition-all"
      aria-label={`Open prediction slip (${itemCount} items)`}
    >
      <ShoppingCart className="h-5 w-5" />
      <span className="font-semibold">{itemCount}</span>
    </button>
  );
}

export function PredictionSlipPanel() {
  const {
    items,
    totalStake,
    totalPayout,
    itemCount,
    isOpen,
    closeSlip,
    removeItem,
    updateAmount,
    clearSlip,
  } = usePredictionSlip();

  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsConfirming(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsConfirming(false);
    setConfirmed(true);
    setTimeout(() => {
      clearSlip();
      setConfirmed(false);
      closeSlip();
    }, 2000);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={closeSlip}
      />

      <div className="fixed bottom-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Prediction Slip
            </h2>
            <p className="text-sm text-slate-400">
              {itemCount} market{itemCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={closeSlip}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Close slip"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-xl font-semibold text-white">
              Predictions Submitted!
            </p>
            <p className="text-slate-400">
              All {itemCount} prediction{itemCount !== 1 ? "s" : ""} have been
              placed successfully.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <ShoppingCart className="h-12 w-12 text-slate-600" />
            <p className="text-lg font-medium text-slate-400">
              Your slip is empty
            </p>
            <p className="text-sm text-slate-500">
              Click &quot;Predict&quot; on any market to add it here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.marketId}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.marketTitle}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-full bg-white/10 px-2 py-0.5">
                          {item.category}
                        </span>
                        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-300">
                          {item.outcome}
                        </span>
                        <span className="text-slate-500">
                          {item.odds.toFixed(2)}x
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.marketId)}
                      className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-white/10 transition"
                      aria-label={`Remove ${item.marketTitle}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() =>
                        updateAmount(item.marketId, item.amount - 10)
                      }
                      className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:border-white/30 hover:text-white transition"
                      aria-label="Decrease stake"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="flex-1">
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) =>
                          updateAmount(
                            item.marketId,
                            parseFloat(e.target.value) || 1,
                          )
                        }
                        className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-center text-sm text-white outline-none focus:border-orange-400"
                        min={1}
                        aria-label="Stake amount"
                      />
                    </div>
                    <button
                      onClick={() =>
                        updateAmount(item.marketId, item.amount + 10)
                      }
                      className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:border-white/30 hover:text-white transition"
                      aria-label="Increase stake"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <span className="w-16 text-right text-sm font-medium text-slate-300">
                      {(item.amount * item.odds).toFixed(0)} XLM
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 px-6 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total Stake</span>
                <span className="font-semibold text-white">
                  {totalStake.toFixed(2)} XLM
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Est. Payout</span>
                <span className="font-semibold text-emerald-400">
                  {totalPayout.toFixed(2)} XLM
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                <span className="text-slate-400">Profit</span>
                <span className="font-semibold text-emerald-400">
                  +{(totalPayout - totalStake).toFixed(2)} XLM
                </span>
              </div>
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="w-full rounded-full bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60 transition mt-2"
              >
                {isConfirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming…
                  </span>
                ) : (
                  `Confirm ${itemCount} Prediction${itemCount !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
