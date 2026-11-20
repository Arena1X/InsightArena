"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/component/ui/button";
import { validateMatchScore } from "@/lib/validators";

interface SubmitResultFormProps {
  teamA: string;
  teamB: string;
  initialResult?: string;
  isOverdue?: boolean;
  /**
   * True once this match already has a finalized result. Blocks a second
   * submission from silently overwriting it: inputs render read-only and
   * the submit button is replaced with a "result finalized" notice.
   */
  isFinalized?: boolean;
  onSubmit: (homeScore: number, awayScore: number) => Promise<void>;
  onCancel: () => void;
}

export default function SubmitResultForm({
  teamA,
  teamB,
  initialResult,
  isOverdue = false,
  isFinalized = false,
  onSubmit,
  onCancel,
}: SubmitResultFormProps) {
  // Parse initialResult if it matches format "X-Y"
  let initialHome = "";
  let initialAway = "";
  if (initialResult) {
    const parts = initialResult.split("-");
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const a = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(a)) {
        initialHome = h.toString();
        initialAway = a.toString();
      }
    }
  }

  const [homeScore, setHomeScore] = useState(initialHome);
  const [awayScore, setAwayScore] = useState(initialAway);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ homeScore?: string; awayScore?: string; form?: string }>({});
  // Two-step submit: the form's own submit shows a confirmation summary
  // instead of calling onSubmit directly; onSubmit only fires once the
  // user confirms that summary (or cancels back to editing).
  const [pendingConfirmation, setPendingConfirmation] = useState<{ home: number; away: number } | null>(null);

  function validate(): boolean {
    const errs: typeof errors = {};
    const homeError = validateMatchScore(homeScore, `${teamA} score`);
    const awayError = validateMatchScore(awayScore, `${teamB} score`);
    if (homeError) errs.homeScore = homeError;
    if (awayError) errs.awayScore = awayError;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isFinalized || !validate()) return;
    setPendingConfirmation({
      home: parseInt(homeScore, 10),
      away: parseInt(awayScore, 10),
    });
  }

  async function handleConfirm() {
    if (!pendingConfirmation) return;
    setIsSubmitting(true);
    try {
      await onSubmit(pendingConfirmation.home, pendingConfirmation.away);
      setErrors({});
      setPendingConfirmation(null);
    } catch {
      setErrors({ form: "Failed to submit result. Please try again." });
      setPendingConfirmation(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isFinalized) {
    return (
      <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-white">Match Result Finalized</h3>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{teamA}</span>{" "}
          {initialHome || "0"} &ndash; {initialAway || "0"}{" "}
          <span className="font-semibold text-white">{teamB}</span>. This
          result has already been submitted and can no longer be changed.
        </p>
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="rounded-full border-white/10 text-slate-300 hover:border-white/30"
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (pendingConfirmation) {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-white">Confirm Result</h3>
        <p className="text-sm text-slate-400">
          This will finalize the result and cannot be undone.
        </p>
        <p className="rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-center text-lg font-semibold text-white">
          {teamA} {pendingConfirmation.home} &ndash; {pendingConfirmation.away} {teamB}
        </p>
        {errors.form && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
            {errors.form}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingConfirmation(null)}
            disabled={isSubmitting}
            className="rounded-full border-white/10 text-slate-300 hover:border-white/30"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isSubmitting ? "Submitting…" : "Confirm & Submit"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      // The number inputs below keep min/max as a UX hint (spinner
      // behavior, mobile numeric keypad), but noValidate stops the browser's
      // own constraint validation from silently blocking submission before
      // our onSubmit handler runs -- without it, an out-of-range value can
      // prevent the submit event from firing at all, so validateMatchScore's
      // actual error message is never shown to the user.
      noValidate
      className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl"
    >
      <h3 className="text-lg font-semibold text-white">Submit Match Result</h3>
      <p className="text-sm text-slate-400">
        Enter the final scores for <span className="font-semibold text-white">{teamA}</span> vs{" "}
        <span className="font-semibold text-white">{teamB}</span>.
      </p>
      {isOverdue && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          This submission is overdue. Submit the result as soon as possible.
        </p>
      )}

      {errors.form && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {errors.form}
        </p>
      )}

      <div className="grid gap-4 grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="home-score" className="block text-sm font-medium text-slate-300">
            {teamA} Score
          </label>
          <input
            id="home-score"
            type="number"
            min="0"
            max="20"
            step="1"
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            placeholder="0"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          />
          {errors.homeScore && <p className="text-xs text-rose-400">{errors.homeScore}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="away-score" className="block text-sm font-medium text-slate-300">
            {teamB} Score
          </label>
          <input
            id="away-score"
            type="number"
            min="0"
            max="20"
            step="1"
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            placeholder="0"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          />
          {errors.awayScore && <p className="text-xs text-rose-400">{errors.awayScore}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-full border-white/10 text-slate-300 hover:border-white/30"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          Review Result
        </Button>
      </div>
    </form>
  );
}
