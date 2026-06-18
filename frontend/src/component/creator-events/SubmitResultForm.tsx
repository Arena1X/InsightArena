"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/component/ui/button";

interface SubmitResultFormProps {
  teamA: string;
  teamB: string;
  initialResult?: string;
  onSubmit: (homeScore: number, awayScore: number) => Promise<void>;
  onCancel: () => void;
}

export default function SubmitResultForm({
  teamA,
  teamB,
  initialResult,
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

  function validate(): boolean {
    const errs: typeof errors = {};
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);

    if (homeScore.trim() === "") {
      errs.homeScore = "Home score is required.";
    } else if (isNaN(h) || !Number.isInteger(Number(homeScore)) || h < 0 || h > 20) {
      errs.homeScore = "Score must be an integer between 0 and 20.";
    }

    if (awayScore.trim() === "") {
      errs.awayScore = "Away score is required.";
    } else if (isNaN(a) || !Number.isInteger(Number(awayScore)) || a < 0 || a > 20) {
      errs.awayScore = "Score must be an integer between 0 and 20.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const h = parseInt(homeScore, 10);
      const a = parseInt(awayScore, 10);
      await onSubmit(h, a);
      setErrors({});
    } catch {
      setErrors({ form: "Failed to submit result. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl"
    >
      <h3 className="text-lg font-semibold text-white">Submit Match Result</h3>
      <p className="text-sm text-slate-400">
        Enter the final scores for <span className="font-semibold text-white">{teamA}</span> vs{" "}
        <span className="font-semibold text-white">{teamB}</span>.
      </p>

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
          disabled={isSubmitting}
          className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {isSubmitting ? "Submitting…" : "Submit Result"}
        </Button>
      </div>
    </form>
  );
}
