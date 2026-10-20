"use client";

import { useState } from "react";
import { X, Loader2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/component/ui/button";
import type { PendingMatch } from "./PendingMatchesList";

type Outcome = "TEAM_A" | "TEAM_B" | "DRAW";

interface SubmitResultFormProps {
  match: PendingMatch;
  onSubmit: (
    matchId: string,
    outcome: Outcome,
    confidenceScore?: number,
    dataSource?: string,
  ) => Promise<{ txHash: string }>;
  onClose: () => void;
}

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: "TEAM_A", label: "Team A Won" },
  { value: "TEAM_B", label: "Team B Won" },
  { value: "DRAW", label: "Draw" },
];

export default function SubmitResultForm({
  match,
  onSubmit,
  onClose,
}: SubmitResultFormProps) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<string>("");
  const [dataSource, setDataSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) {
      setError("Please select an outcome.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const conf = confidenceScore ? parseFloat(confidenceScore) : undefined;
      const result = await onSubmit(
        match.matchId,
        outcome,
        conf,
        dataSource || undefined,
      );
      setTxHash(result.txHash);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Transaction failed. Please retry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (txHash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-emerald-500/20 bg-slate-900 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <h3 className="text-xl font-semibold text-white">Result Submitted</h3>
          <p className="mt-2 text-sm text-slate-400">
            {match.teamA} vs {match.teamB} — outcome recorded on-chain.
          </p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-amber-300 hover:underline"
          >
            View transaction
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Submit Result
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">
              {match.teamA} vs {match.teamB}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">{match.eventTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Outcome selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">Outcome</p>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value)}
                  className={`rounded-2xl border py-3 text-sm font-medium transition ${
                    outcome === opt.value
                      ? "border-amber-400 bg-amber-400/10 text-amber-300"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  {opt.label === "Team A Won"
                    ? match.teamA
                    : opt.label === "Team B Won"
                      ? match.teamB
                      : "Draw"}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence score */}
          <div className="space-y-1">
            <label
              htmlFor="confidence"
              className="block text-sm font-medium text-slate-300"
            >
              Confidence Score{" "}
              <span className="text-slate-500">(optional, 0–100)</span>
            </label>
            <input
              id="confidence"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={confidenceScore}
              onChange={(e) => setConfidenceScore(e.target.value)}
              placeholder="e.g. 95.5"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          {/* Data source */}
          <div className="space-y-1">
            <label
              htmlFor="data-source"
              className="block text-sm font-medium text-slate-300"
            >
              Data Source{" "}
              <span className="text-slate-500">(optional, for audit trail)</span>
            </label>
            <input
              id="data-source"
              type="text"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              placeholder="e.g. https://api.sportsdata.io/..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-white/10 text-slate-300"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !outcome}
              className="flex-1 rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing…
                </>
              ) : (
                "Submit Result"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
