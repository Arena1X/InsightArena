"use client";

import { useState } from "react";
import { Button } from "@/component/ui/button";
import { ConfirmDialog } from "@/component/ui/confirm-dialog";
import type { PendingResolution } from "@/hooks/useOracleDashboard";

type Props = {
  market: PendingResolution;
  onSubmit: (marketId: string, outcome: string) => Promise<{ txHash: string }>;
  onClose: () => void;
};

export default function OracleSubmissionForm({
  market,
  onSubmit,
  onClose,
}: Props) {
  const [outcome, setOutcome] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  function validate(): string | null {
    if (!outcome) return "Select a resolution outcome.";
    if (!market.outcomes.includes(outcome)) {
      return "Outcome is not valid for this market.";
    }
    return null;
  }

  function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(market.marketId, outcome);
      setTxHash(result.txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (txHash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-emerald-500/20 bg-slate-900 p-8 text-center">
          <h3 className="text-xl font-semibold text-white">Resolution submitted</h3>
          <p className="mt-2 text-sm text-slate-400">
            {market.title} resolved as <span className="text-amber-300">{outcome}</span>.
          </p>
          <p className="mt-4 font-mono text-xs text-slate-500">{txHash}</p>
          <Button
            type="button"
            className="mt-6 rounded-full bg-amber-400 px-5 text-slate-950 hover:bg-amber-300"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <form
          onSubmit={handleRequestSubmit}
          className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">
                Submit resolution
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">{market.title}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {market.category} · {market.participantCount} participants
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-200">Outcome</legend>
            {market.outcomes.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                  outcome === option
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    : "border-white/10 text-slate-300 hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={option}
                  checked={outcome === option}
                  onChange={() => setOutcome(option)}
                  className="accent-amber-400"
                />
                {option}
              </label>
            ))}
          </fieldset>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300"
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Review & submit"}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm resolution"
        description={`Submit "${outcome}" for ${market.title}? This cannot be undone from the dashboard.`}
        confirmLabel="Confirm submit"
        cancelLabel="Back"
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
