"use client";

import { useState, useRef } from "react";
import { Upload, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/component/ui/button";

type Outcome = "TEAM_A" | "TEAM_B" | "DRAW";

interface ParsedResult {
  matchId: string;
  outcome: Outcome | null;
  error?: string;
}

interface BatchResultRow {
  matchId: string;
  outcome: Outcome;
}

interface BatchResultSubmissionProps {
  onSubmitBatch: (results: BatchResultRow[]) => Promise<void>;
}

const VALID_OUTCOMES = new Set<string>(["TEAM_A", "TEAM_B", "DRAW"]);

function parseResultCSV(raw: string): ParsedResult[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [matchId = "", outcome = ""] = line.split(",").map((c) => c.trim());
    const errs: string[] = [];

    if (!matchId) errs.push("Match ID is empty");
    const normalizedOutcome = outcome.toUpperCase();
    if (!normalizedOutcome) {
      errs.push("Outcome is missing");
    } else if (!VALID_OUTCOMES.has(normalizedOutcome)) {
      errs.push(`Invalid outcome "${outcome}" — use TEAM_A, TEAM_B, or DRAW`);
    }

    return {
      matchId,
      outcome: VALID_OUTCOMES.has(normalizedOutcome)
        ? (normalizedOutcome as Outcome)
        : null,
      error: errs.length > 0 ? errs.join("; ") : undefined,
    };
  });
}

export default function BatchResultSubmission({
  onSubmitBatch,
}: BatchResultSubmissionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedResult[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSubmitError(null);
    setSubmitSuccess(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setPreview(parseResultCSV(text));
    };
    reader.readAsText(file);
  }

  function handleClear() {
    setPreview(null);
    setFileName(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmitAll() {
    if (!preview) return;

    const valid = preview.filter(
      (r): r is ParsedResult & { outcome: Outcome } =>
        !r.error && r.outcome !== null,
    );

    if (valid.length === 0) {
      setSubmitError("No valid rows to submit.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmitBatch(
        valid.map((r) => ({ matchId: r.matchId, outcome: r.outcome })),
      );
      setSubmitSuccess(true);
      handleClear();
    } catch {
      setSubmitError("Batch submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const validCount = preview?.filter((r) => !r.error && r.outcome).length ?? 0;
  const errorCount = preview?.filter((r) => r.error).length ?? 0;

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Batch Result Submission
        </h3>
        {fileName && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-slate-400">
        Upload a CSV with columns:{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-amber-300">
          Match ID, Outcome (TEAM_A | TEAM_B | DRAW)
        </code>
      </p>

      {!fileName ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 py-8 text-slate-400 transition hover:border-amber-400/40 hover:bg-white/10 hover:text-white"
        >
          <Upload className="h-8 w-8" />
          <span className="text-sm">Click to upload CSV</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <Upload className="h-5 w-5 text-amber-300" />
          <span className="text-sm text-white">{fileName}</span>
        </div>
      )}

      {submitSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          Results submitted successfully.
        </div>
      )}

      {submitError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-emerald-400">✓ {validCount} valid</span>
            {errorCount > 0 && (
              <span className="text-rose-400">✗ {errorCount} errors</span>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-slate-950">
                <tr className="text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-4 py-2">Match ID</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-white/5 ${
                      row.error ? "bg-rose-500/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-white">
                      {row.matchId || (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {row.outcome ?? (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {row.error ? (
                        <span
                          className="text-xs text-rose-400"
                          title={row.error}
                        >
                          ✗ Error
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400">✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSubmitAll}
              disabled={isSubmitting || validCount === 0}
              className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isSubmitting
                ? "Submitting…"
                : `Submit ${validCount} Result${validCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
