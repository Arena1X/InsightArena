"use client";

import React, { useEffect, useRef, useState } from "react";
import { computeOrderPreview, FEE_RATE, SLIPPAGE_RATE } from "@/lib/orderPreview";

interface OrderPreviewModalProps {
  marketName: string;
  price: string;
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Initial stake value passed in (may come from an existing slip item) */
  initialStake?: number;
  /** Current market odds (defaults to 1 for a simple price-based market) */
  odds?: number;
  /** Called when the user cancels / closes the modal */
  onCancel: () => void;
  /** Called when the user explicitly confirms the trade */
  onConfirm: (stake: number) => void;
}

const MIN_STAKE = 1;

function formatUSD(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const OrderPreviewModal: React.FC<OrderPreviewModalProps> = ({
  marketName,
  price,
  isOpen,
  initialStake = 10,
  odds = 1,
  onCancel,
  onConfirm,
}) => {
  const [stake, setStake] = useState<number>(initialStake);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset stake whenever the modal opens or the initial value changes
  useEffect(() => {
    if (isOpen) {
      setStake(initialStake);
    }
  }, [isOpen, initialStake]);

  // Focus the stake input when the modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const safeStake = Number.isFinite(stake) && stake >= MIN_STAKE ? stake : MIN_STAKE;
  const preview = computeOrderPreview(safeStake, odds);

  const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setStake(Number.isNaN(val) ? 0 : val);
  };

  const handleConfirm = () => {
    if (safeStake < MIN_STAKE) return;
    onConfirm(safeStake);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Order preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onKeyDown={handleKeyDown}
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-2xl border border-gray-600 bg-[#1a1a2e] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Order Preview</h2>
          <button
            type="button"
            aria-label="Close order preview"
            className="text-gray-400 hover:text-white transition-colors"
            onClick={onCancel}
          >
            ✕
          </button>
        </div>

        {/* Market info */}
        <div className="mb-5 rounded-xl border border-gray-700 bg-[#0d0d1a] px-4 py-3">
          <p className="text-sm text-gray-400">Market</p>
          <p className="text-base font-semibold text-white">{marketName}</p>
          <p className="mt-0.5 text-sm text-gray-300">Current price: {price}</p>
        </div>

        {/* Stake input */}
        <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="order-stake">
          Stake (USD)
        </label>
        <input
          id="order-stake"
          ref={inputRef}
          type="number"
          min={MIN_STAKE}
          step="1"
          value={stake === 0 ? "" : stake}
          onChange={handleStakeChange}
          aria-label="Stake amount"
          className="mb-5 w-full rounded-lg border border-gray-600 bg-[#0d0d1a] px-4 py-2.5 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          placeholder="Enter stake amount"
        />

        {/* Preview breakdown */}
        <div
          role="region"
          aria-label="Order breakdown"
          className="mb-6 space-y-2 rounded-xl border border-gray-700 bg-[#0d0d1a] px-4 py-4 text-sm"
        >
          <PreviewRow label="Stake" value={formatUSD(safeStake)} />
          <PreviewRow
            label={`Platform fee (${(FEE_RATE * 100).toFixed(0)}%)`}
            value={`− ${formatUSD(preview.fee)}`}
            valueClass="text-red-400"
          />
          <PreviewRow
            label={`Est. slippage (${(SLIPPAGE_RATE * 100).toFixed(1)}%)`}
            value={`≈ ${formatUSD(preview.slippage)}`}
            valueClass="text-yellow-400"
          />
          <div className="my-1 border-t border-gray-700" />
          <PreviewRow label="Net stake" value={formatUSD(preview.netStake)} />
          <PreviewRow
            label="Expected payout"
            value={formatUSD(preview.expectedPayout)}
            labelClass="font-semibold text-white"
            valueClass="font-bold text-green-400 text-base"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-600 py-2.5 font-semibold text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={safeStake < MIN_STAKE}
            aria-label="Confirm trade"
            className="flex-1 rounded-lg bg-[#7C3AED] py-2.5 font-bold text-white hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
          >
            Confirm Trade
          </button>
        </div>
      </div>
    </div>
  );
};

interface PreviewRowProps {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}

const PreviewRow: React.FC<PreviewRowProps> = ({
  label,
  value,
  labelClass = "text-gray-400",
  valueClass = "text-white",
}) => (
  <div className="flex justify-between">
    <span className={labelClass}>{label}</span>
    <span className={valueClass}>{value}</span>
  </div>
);

export default OrderPreviewModal;
