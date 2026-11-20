"use client";

import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/component/ui/confirm-dialog";
import {
  MAX_PLATFORM_FEE_BPS,
  validatePlatformFee,
  validators,
} from "@/lib/validators";

const SAMPLE_STAKE = 100;

const initialHistory = [
  {
    id: 1,
    date: "2026-05-24",
    change: "Platform fee lowered",
    value: "2.5%",
    updatedBy: "admin@insightarena",
  },
  {
    id: 2,
    date: "2026-04-15",
    change: "Creator fee raised",
    value: "1.2%",
    updatedBy: "admin@insightarena",
  },
  {
    id: 3,
    date: "2026-03-02",
    change: "Fee schedule review",
    value: "2.8% / 1.1%",
    updatedBy: "operations",
  },
];

export default function AdminFeesPage() {
  const [platformFee, setPlatformFee] = useState("2.5");
  const [creatorFee, setCreatorFee] = useState("1.2");
  const [history] = useState(initialHistory);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const platformFeeError = validatePlatformFee(platformFee);
  const creatorFeeError = validators.compose(
    validators.number("Creator fee"),
    validators.minValue(0, "Creator fee"),
    validators.maxValue(20, "Creator fee"),
  )(creatorFee);

  const feeSummary = useMemo(
    () => `Platform: ${platformFee}% | Creator: ${creatorFee}%`,
    [creatorFee, platformFee],
  );

  const feePreview = useMemo(() => {
    const platformAmount = SAMPLE_STAKE * (Number(platformFee) / 100);
    const creatorAmount = SAMPLE_STAKE * (Number(creatorFee) / 100);
    const totalFees = platformAmount + creatorAmount;

    return {
      platformAmount: Number.isFinite(platformAmount) ? platformAmount : 0,
      creatorAmount: Number.isFinite(creatorAmount) ? creatorAmount : 0,
      totalFees: Number.isFinite(totalFees) ? totalFees : 0,
      netStake: Number.isFinite(totalFees) ? SAMPLE_STAKE - totalFees : SAMPLE_STAKE,
    };
  }, [creatorFee, platformFee]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (platformFeeError || creatorFeeError) return;
    setIsConfirmOpen(true);
  };

  const handleConfirm = () => {
    setIsConfirmOpen(false);
    alert(`Fees saved: ${feeSummary}`);
  };

  return (
    <section className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-slate-950/90 p-8 shadow-xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400/90">Creator Fees</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Fee management center</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-400">
          Update platform and creator fee percentages safely. All actions are placeholders
          for the current admin flow and audit history.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-white">Current fee settings</h2>
          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200" htmlFor="platform-fee">
                Platform fee percentage
              </label>
              <input
                id="platform-fee"
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={platformFee}
                onChange={(event) => setPlatformFee(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                placeholder="2.5"
                aria-invalid={Boolean(platformFeeError)}
                aria-describedby={platformFeeError ? "platform-fee-error" : undefined}
              />
              {platformFeeError && (
                <p id="platform-fee-error" className="text-sm text-red-400" role="alert">
                  {platformFeeError}
                </p>
              )}
              <p className="text-xs text-gray-500">Maximum: {MAX_PLATFORM_FEE_BPS} bps (5%).</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200" htmlFor="creator-fee">
                Creator fee percentage
              </label>
              <input
                id="creator-fee"
                type="number"
                step="0.1"
                min="0"
                max="20"
                value={creatorFee}
                onChange={(event) => setCreatorFee(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                placeholder="1.2"
                aria-invalid={Boolean(creatorFeeError)}
                aria-describedby={creatorFeeError ? "creator-fee-error" : undefined}
              />
              {creatorFeeError && (
                <p id="creator-fee-error" className="text-sm text-red-400" role="alert">
                  {creatorFeeError}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold text-white">Sample trade preview</h3>
                <span className="text-sm text-gray-400">Stake: ${SAMPLE_STAKE.toFixed(2)}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-400">Platform fee</dt>
                  <dd data-testid="preview-platform-fee" className="text-white">${feePreview.platformAmount.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Creator fee</dt>
                  <dd data-testid="preview-creator-fee" className="text-white">${feePreview.creatorAmount.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Total fees</dt>
                  <dd data-testid="preview-total-fees" className="text-white">${feePreview.totalFees.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Stake after fees</dt>
                  <dd data-testid="preview-net-stake" className="font-semibold text-orange-300">${feePreview.netStake.toFixed(2)}</dd>
                </div>
              </dl>
            </div>

            <button
              type="submit"
              disabled={Boolean(platformFeeError || creatorFeeError)}
              className="inline-flex items-center justify-center rounded-3xl bg-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
            >
              Save fee schedule
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-white">Fee history log</h2>
          <p className="mt-2 text-sm text-gray-400">
            Recent configuration changes recorded for audit and review.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90">
            <table className="min-w-full text-left text-sm text-gray-200">
              <thead className="bg-slate-950/90 text-gray-400">
                <tr>
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Change</th>
                  <th className="px-4 py-4">Value</th>
                  <th className="px-4 py-4">Updated by</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-4 text-white">{entry.date}</td>
                    <td className="px-4 py-4">{entry.change}</td>
                    <td className="px-4 py-4 text-orange-300">{entry.value}</td>
                    <td className="px-4 py-4 text-gray-300">{entry.updatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmOpen}
        title="Confirm fee schedule change"
        description={`Platform fee: ${platformFee}% | Creator fee: ${creatorFee}% | On a $${SAMPLE_STAKE.toFixed(2)} stake, total fees will be $${feePreview.totalFees.toFixed(2)} and $${feePreview.netStake.toFixed(2)} will remain.`}
        confirmLabel="Save fee schedule"
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </section>
  );
}
