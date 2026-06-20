"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/component/ui/button";

export interface MatchFormData {
  teamA: string;
  teamB: string;
  matchTime: string;
  multiplier: 1 | 2 | 3;
}

interface AddMatchFormProps {
  onAddMatch: (data: MatchFormData) => Promise<void>;
}

const MAX_TEAM_NAME = 100;

function nowPlusOneHour(): string {
  const d = new Date(Date.now() + 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export default function AddMatchForm({ onAddMatch }: AddMatchFormProps) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [matchTime, setMatchTime] = useState(nowPlusOneHour());
  const [multiplier, setMultiplier] = useState<MatchFormData["multiplier"]>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<MatchFormData & { form: string }>>({});

  function validate(): boolean {
    const errs: typeof errors = {};
    const trimA = teamA.trim();
    const trimB = teamB.trim();

    if (!trimA) errs.teamA = "Team A name is required.";
    else if (trimA.length > MAX_TEAM_NAME)
      errs.teamA = `Team A name must be ${MAX_TEAM_NAME} characters or fewer.`;

    if (!trimB) errs.teamB = "Team B name is required.";
    else if (trimB.length > MAX_TEAM_NAME)
      errs.teamB = `Team B name must be ${MAX_TEAM_NAME} characters or fewer.`;

    if (trimA && trimB && trimA.toLowerCase() === trimB.toLowerCase())
      errs.form = "Team names must be different.";

    if (!matchTime) {
      errs.matchTime = "Match date/time is required.";
    } else if (new Date(matchTime) <= new Date()) {
      errs.matchTime = "Match time must be in the future.";
    }

    if (![1, 2, 3].includes(multiplier)) {
      errs.multiplier = "Please select a valid bonus multiplier.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onAddMatch({
        teamA: teamA.trim(),
        teamB: teamB.trim(),
        matchTime,
        multiplier,
      });
      setTeamA("");
      setTeamB("");
      setMatchTime(nowPlusOneHour());
      setMultiplier(1);
      setErrors({});
    } catch {
      setErrors({ form: "Failed to add match. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6"
    >
      <h3 className="text-lg font-semibold text-white">Add Match</h3>

      {errors.form && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {errors.form}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="team-a"
            className="block text-sm font-medium text-slate-300"
          >
            Team A
          </label>
          <input
            id="team-a"
            type="text"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            maxLength={MAX_TEAM_NAME}
            placeholder="Team A name"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          />
          {errors.teamA && (
            <p className="text-xs text-rose-400">{errors.teamA}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="team-b"
            className="block text-sm font-medium text-slate-300"
          >
            Team B
          </label>
          <input
            id="team-b"
            type="text"
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            maxLength={MAX_TEAM_NAME}
            placeholder="Team B name"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          />
          {errors.teamB && (
            <p className="text-xs text-rose-400">{errors.teamB}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="match-time"
          className="block text-sm font-medium text-slate-300"
        >
          Match Date &amp; Time
        </label>
        <input
          id="match-time"
          type="datetime-local"
          value={matchTime}
          min={new Date().toISOString().slice(0, 16)}
          onChange={(e) => setMatchTime(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        />
        {errors.matchTime && (
          <p className="text-xs text-rose-400">{errors.matchTime}</p>
        )}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="match-multiplier"
          className="block text-sm font-medium text-slate-300"
        >
          Bonus Multiplier
        </label>
        <select
          id="match-multiplier"
          value={multiplier}
          onChange={(e) =>
            setMultiplier(Number(e.target.value) as MatchFormData["multiplier"])
          }
          className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        >
          <option value={1}>1× Normal points</option>
          <option value={2}>2× Bonus points</option>
          <option value={3}>3× Bonus points</option>
        </select>
        {errors.multiplier && (
          <p className="text-xs text-rose-400">{errors.multiplier}</p>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isSubmitting ? "Adding…" : "Add Match"}
        </Button>
      </div>
    </form>
  );
}
