"use client";

import { useRef, useState } from "react";
import {
  Upload,
  X,
  Check,
  AlertCircle,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/component/ui/button";
import { ConfirmDialog } from "@/component/ui/confirm-dialog";

type Outcome = "TEAM_A" | "TEAM_B" | "DRAW";

interface ParsedResult {
  id: string;
  matchId: string;
  outcome: Outcome | null;
  source?: string;
  error?: string;
}

export interface BatchResultRow {
  matchId: string;
  outcome: Outcome;
  source?: string;
}

export interface BatchResultOutcome {
  matchId: string;
  success: boolean;
  error?: string;
}

interface BatchResultSubmissionProps {
  onSubmitBatch: (results: BatchResultRow[]) => Promise<BatchResultOutcome[]>;
}

type ItemStatus = "pending" | "submitting" | "confirmed" | "failed";

const VALID_OUTCOMES = new Set<string>(["TEAM_A", "TEAM_B", "DRAW"]);
const OUTCOME_OPTIONS: Outcome[] = ["TEAM_A", "TEAM_B", "DRAW"];
const CONFIRM_BATCH_THRESHOLD = 5;

let rowSeq = 0;

function nextRowId() {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

function parseResultCSV(raw: string): ParsedResult[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [matchId = "", outcome = "", source = ""] = line
      .split(",")
      .map((c) => c.trim());
    const errs: string[] = [];

    if (!matchId) errs.push("Match ID is empty");
    const normalizedOutcome = outcome.toUpperCase();
    if (!normalizedOutcome) {
      errs.push("Outcome is missing");
    } else if (!VALID_OUTCOMES.has(normalizedOutcome)) {
      errs.push(`Invalid outcome "${outcome}" — use TEAM_A, TEAM_B, or DRAW`);
    }

    return {
      id: nextRowId(),
      matchId,
      outcome: VALID_OUTCOMES.has(normalizedOutcome)
        ? (normalizedOutcome as Outcome)
        : null,
      source: source || undefined,
      error: errs.length > 0 ? errs.join("; ") : undefined,
    };
  });
}

const STATUS_CONTENT: Record<
  ItemStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "text-slate-400" },
  submitting: { label: "Submitting…", className: "text-sky-300" },
  confirmed: { label: "Confirmed", className: "text-emerald-400" },
  failed: { label: "Failed", className: "text-rose-400" },
};

export default function BatchResultSubmission({
  onSubmitBatch,
}: BatchResultSubmissionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedResult[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, ItemStatus>>({});
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<BatchResultRow[] | null>(
    null,
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSubmitError(null);
    setSubmitSuccess(false);
    setEditingId(null);
    setStatusById({});
    setErrorsById({});

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseResultCSV(text));
    };
    reader.readAsText(file);
  }

  function handleClear() {
    setRows(null);
    setFileName(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    setEditingId(null);
    setStatusById({});
    setErrorsById({});
    setConfirmOpen(false);
    setPendingSubmit(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemoveRow(rowId: string) {
    if (!rows) return;
    setRows((prev) => prev?.filter((r) => r.id !== rowId) ?? null);
    setStatusById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setErrorsById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (editingId === rowId) setEditingId(null);
  }

  function handleUpdateOutcome(rowId: string, outcome: Outcome) {
    if (!rows) return;
    setRows(
      (prev) =>
        prev?.map((r) =>
          r.id === rowId ? { ...r, outcome, error: undefined } : r,
        ) ?? null,
    );
    setStatusById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setErrorsById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setEditingId(null);
  }

  const validCount =
    rows?.filter((r) => !r.error && r.outcome !== null).length ?? 0;
  const errorCount = rows?.filter((r) => r.error).length ?? 0;

  function collectValidRows(): BatchResultRow[] {
    if (!rows) return [];
    return rows
      .filter(
        (r): r is ParsedResult & { outcome: Outcome } =>
          !r.error && r.outcome !== null,
      )
      .map((r) => ({
        matchId: r.matchId,
        outcome: r.outcome,
        source: r.source,
      }));
  }

  async function doSubmit(target: BatchResultRow[]) {
    if (target.length === 0 || !rows) return;

    const targetIds = new Set(target.map((t) => t.matchId));

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setConfirmOpen(false);
    setPendingSubmit(null);

    setStatusById((prev) => {
      const next: Record<string, ItemStatus> = { ...prev };
      rows.forEach((r) => {
        if (targetIds.has(r.matchId)) next[r.id] = "submitting";
      });
      return next;
    });
    setErrorsById((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        if (targetIds.has(r.matchId)) delete next[r.id];
      });
      return next;
    });

    try {
      const outcomes = await onSubmitBatch(target);
      const hasExplicitOutcomes = outcomes.length > 0;
      const outcomeByMatch = new Map<string, BatchResultOutcome>();
      for (const o of outcomes) {
        if (o?.matchId != null) {
          outcomeByMatch.set(o.matchId, o);
        }
      }

      const nextStatus: Record<string, ItemStatus> = {};
      const nextErrors: Record<string, string> = {};
      rows.forEach((r) => {
        if (!targetIds.has(r.matchId)) return;
        if (hasExplicitOutcomes) {
          const outcome = outcomeByMatch.get(r.matchId);
          if (outcome?.success) {
            nextStatus[r.id] = "confirmed";
          } else {
            nextStatus[r.id] = "failed";
            if (outcome?.error) nextErrors[r.id] = outcome.error;
          }
        } else {
          // Legacy callers that resolve without per-item outcomes => all ok.
          nextStatus[r.id] = "confirmed";
        }
      });

      setStatusById((prev) => ({ ...prev, ...nextStatus }));
      setErrorsById((prev) =>
        Object.keys(nextErrors).length > 0
          ? { ...prev, ...nextErrors }
          : prev,
      );

      const failedCount = Object.values(nextStatus).filter(
        (s) => s === "failed",
      ).length;
      const submittedCount = Object.keys(nextStatus).length;

      if (failedCount > 0) {
        setSubmitError(
          `${failedCount} of ${submittedCount} result${submittedCount !== 1 ? "s" : ""} failed to submit. You can retry just the failed items below.`,
        );
      } else {
        setSubmitSuccess(true);
      }
    } catch {
      // Whole-batch failure (network error / rejected promise).
      const nextStatus: Record<string, ItemStatus> = {};
      rows.forEach((r) => {
        if (targetIds.has(r.matchId)) nextStatus[r.id] = "failed";
      });
      const nextErrors: Record<string, string> = {};
      rows.forEach((r) => {
        if (targetIds.has(r.matchId)) {
          nextErrors[r.id] = "Batch submission error. Please retry.";
        }
      });
      setStatusById((prev) => ({ ...prev, ...nextStatus }));
      setErrorsById((prev) => ({ ...prev, ...nextErrors }));
      setSubmitError(
        "Batch submission failed. You can retry the failed items below.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmitAll() {
    if (!rows || isSubmitting) return;
    const valid = collectValidRows();
    if (valid.length === 0) {
      setSubmitError("No valid rows to submit.");
      return;
    }

    // Skip rows already confirmed from a previous pass.
    const target = valid.filter((r) => {
      const byId = rows.find((row) => row.matchId === r.matchId);
      return !byId || statusById[byId.id] !== "confirmed";
    });

    if (target.length === 0) {
      setSubmitError("All rows have already been submitted.");
      return;
    }

    if (target.length >= CONFIRM_BATCH_THRESHOLD) {
      setPendingSubmit(target);
      setConfirmOpen(true);
      return;
    }
    void doSubmit(target);
  }

  function handleRetryFailed() {
    if (!rows || isSubmitting) return;
    const failed = rows
      .filter((r) => statusById[r.id] === "failed" && r.outcome !== null)
      .map((r) => ({
        matchId: r.matchId,
        outcome: r.outcome as Outcome,
        source: r.source,
      }));
    if (failed.length === 0) return;
    void doSubmit(failed);
  }

  const confirmedCount =
    rows?.filter((r) => statusById[r.id] === "confirmed").length ?? 0;
  const failedCount =
    rows?.filter((r) => statusById[r.id] === "failed").length ?? 0;
  const hasFailed = failedCount > 0;
  const totalProgress =
    rows && rows.length > 0
      ? Math.round((confirmedCount / rows.length) * 100)
      : 0;

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
          Match ID, Outcome (TEAM_A | TEAM_B | DRAW), Data Source (optional)
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
          All results submitted successfully.
        </div>
      )}

      {submitError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          {/* Progress header */}
          {(confirmedCount > 0 || failedCount > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {confirmedCount} of {rows.length} confirmed
                  {hasFailed && (
                    <span className="text-rose-400">
                      {" "}
                      · {failedCount} failed
                    </span>
                  )}
                </span>
                <span>{totalProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400/70 transition-all"
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-emerald-400">✓ {validCount} valid</span>
            {errorCount > 0 && (
              <span className="text-rose-400">✗ {errorCount} errors</span>
            )}
            {!isSubmitting && confirmedCount === 0 && (
              <span className="text-slate-400">
                ⏳ {rows.length - (confirmedCount + failedCount)} pending
              </span>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-slate-950">
                <tr className="text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-4 py-2">Match ID</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status: ItemStatus = statusById[row.id] ?? "pending";
                  const isEditing = editingId === row.id;
                  const statusInfo = STATUS_CONTENT[status];
                  return (
                    <tr
                      key={row.id}
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
                        {isEditing ? (
                          <div className="flex flex-wrap gap-1.5">
                            {OUTCOME_OPTIONS.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleUpdateOutcome(row.id, opt)}
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                                  row.outcome === opt
                                    ? "border-amber-400 bg-amber-400/10 text-amber-300"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : (
                          row.outcome ?? (
                            <span className="text-slate-500">—</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {row.source || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${statusInfo.className}`}
                          title={errorsById[row.id]}
                        >
                          {status === "submitting" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {status === "confirmed" && (
                            <Check className="h-3 w-3" />
                          )}
                          {status === "failed" && (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {row.error && status === "pending"
                            ? "Error"
                            : statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {!row.error && status !== "submitting" && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingId(isEditing ? null : row.id)
                              }
                              className="rounded p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
                              aria-label={`Edit outcome for ${row.matchId || row.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {status !== "submitting" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              disabled={isSubmitting}
                              className="rounded p-1 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
                              aria-label={`Remove ${row.matchId || row.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {hasFailed && !isSubmitting && (
              <Button
                type="button"
                onClick={handleRetryFailed}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-6 text-sm text-rose-300 hover:bg-rose-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Retry {failedCount} Failed
              </Button>
            )}
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
                : `Submit ${validCount - confirmedCount} Result${validCount - confirmedCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Submit ${pendingSubmit?.length ?? 0} results?`}
        description={`This batch contains ${pendingSubmit?.length ?? 0} results. Review the table above before confirming — partial failures can be retried individually afterwards.`}
        confirmLabel="Submit batch"
        cancelLabel="Review"
        variant="default"
        onConfirm={() => {
          if (pendingSubmit) void doSubmit(pendingSubmit);
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingSubmit(null);
        }}
      />
    </div>
  );
}