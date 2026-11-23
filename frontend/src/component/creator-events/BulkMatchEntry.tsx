"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/component/ui/button";
import {
  parseBulkMatchCsv,
  validateBulkMatchRows,
} from "@/lib/validators";
import type { MatchFormData, PointsMultiplier } from "./AddMatchForm";

export interface BulkEntryRow {
  id: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  multiplier: PointsMultiplier;
  errors: string[];
}

export interface BulkMatchEntryProps {
  currentMatchCount?: number;
  maxMatches?: number;
  existingMatches?: Array<{ teamA: string; teamB: string }>;
  onSubmitValid: (matches: MatchFormData[]) => Promise<void> | void;
  submitLabel?: string;
}

const MULTIPLIER_OPTIONS: PointsMultiplier[] = [1, 2, 3];

let nextRowCounter = 1;
function createEmptyRow(): BulkEntryRow {
  return {
    id: `bulk-entry-row-${nextRowCounter++}`,
    teamA: "",
    teamB: "",
    matchTime: "",
    multiplier: 1,
    errors: [],
  };
}

function isRowEmpty(row: BulkEntryRow): boolean {
  return !row.teamA.trim() && !row.teamB.trim() && !row.matchTime.trim();
}

export default function BulkMatchEntry({
  currentMatchCount = 0,
  maxMatches = 100,
  existingMatches = [],
  onSubmitValid,
  submitLabel = "Submit Matches",
}: BulkMatchEntryProps) {
  const [rows, setRows] = useState<BulkEntryRow[]>(() => [
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function updateRow<K extends keyof Pick<BulkEntryRow, "teamA" | "teamB" | "matchTime" | "multiplier">>(
    id: string,
    field: K,
    value: BulkEntryRow[K],
  ) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, [field]: value, errors: [] } : row,
      ),
    );
    setErrorMessage(null);
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length === 0 ? [createEmptyRow()] : next;
    });
  }

  function handleLoadPaste() {
    const parsed = parseBulkMatchCsv(pasteText);
    if (parsed.length === 0) return;

    const importedRows: BulkEntryRow[] = parsed.map((item) => ({
      id: `bulk-entry-row-${nextRowCounter++}`,
      teamA: item.teamA,
      teamB: item.teamB,
      matchTime: item.matchTime,
      multiplier: 1,
      errors: [],
    }));

    setRows((prev) => {
      const nonEmpty = prev.filter((r) => !isRowEmpty(r));
      return [...nonEmpty, ...importedRows];
    });
    setPasteText("");
    setShowPaste(false);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const activeRows = rows.filter((row) => !isRowEmpty(row));
    const targetRows = activeRows.length > 0 ? activeRows : rows;

    const validated = validateBulkMatchRows(
      targetRows.map((row) => ({
        teamA: row.teamA,
        teamB: row.teamB,
        matchTime: row.matchTime,
      })),
    );

    const existingKeys = new Set(
      existingMatches.map(
        (m) => `${m.teamA.trim().toLowerCase()}|${m.teamB.trim().toLowerCase()}`,
      ),
    );

    const evaluatedRows: BulkEntryRow[] = targetRows.map((row, idx) => {
      const rowErrors = [...validated[idx].errors];
      const pairKey = `${row.teamA.trim().toLowerCase()}|${row.teamB.trim().toLowerCase()}`;
      if (
        row.teamA.trim() &&
        row.teamB.trim() &&
        existingKeys.has(pairKey) &&
        !rowErrors.includes("Match already exists in this event.")
      ) {
        rowErrors.push("Match already exists in this event.");
      }
      return { ...row, errors: rowErrors };
    });

    const validRows = evaluatedRows.filter((row) => row.errors.length === 0);
    const invalidRows = evaluatedRows.filter((row) => row.errors.length > 0);

    if (validRows.length === 0) {
      setRows(invalidRows);
      setErrorMessage(
        `Please fix ${invalidRows.length} invalid row${invalidRows.length === 1 ? "" : "s"} before submitting.`,
      );
      return;
    }

    const remainingCapacity = maxMatches - currentMatchCount;
    if (validRows.length > remainingCapacity) {
      setRows(evaluatedRows);
      setErrorMessage(
        `Only ${Math.max(0, remainingCapacity)} more match(es) can be added (limit: ${maxMatches}).`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitValid(
        validRows.map((row) => ({
          teamA: row.teamA.trim(),
          teamB: row.teamB.trim(),
          matchTime: row.matchTime.trim(),
          multiplier: row.multiplier,
        })),
      );

      if (invalidRows.length > 0) {
        setRows(invalidRows);
        setStatusMessage(
          `Added ${validRows.length} valid match${validRows.length === 1 ? "" : "es"}. ${invalidRows.length} invalid row${invalidRows.length === 1 ? "" : "s"} kept for correction.`,
        );
      } else {
        setRows([createEmptyRow(), createEmptyRow()]);
        setStatusMessage(
          `Added ${validRows.length} match${validRows.length === 1 ? "" : "es"} successfully.`,
        );
      }
    } catch {
      setRows(evaluatedRows);
      setErrorMessage("Failed to submit matches. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="bulk-match-entry-form"
      className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Bulk Match Entry</h3>
          <p className="text-xs text-slate-400">
            Add multiple matches at once. Valid rows will submit while invalid rows remain for correction.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPaste((prev) => !prev)}
            className="border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-white"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            {showPaste ? "Hide Paste" : "Paste Rows"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </Button>
        </div>
      </div>

      {showPaste && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <label
            htmlFor="bulk-entry-paste"
            className="block text-xs font-medium text-slate-300"
          >
            Paste lines as{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-amber-300">
              Team A, Team B, Match Time (ISO 8601)
            </code>
          </label>
          <textarea
            id="bulk-entry-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Team Alpha, Team Beta, 2099-06-01T18:00\nTeam Gamma, Team Delta, 2099-06-02T20:00"}
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleLoadPaste}
              disabled={!pasteText.trim()}
              className="rounded-full bg-amber-400 px-4 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              Load Pasted Rows
            </Button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row, idx) => {
          const hasErrors = row.errors.length > 0;
          return (
            <div
              key={row.id}
              data-testid={`bulk-entry-row-${idx}`}
              className={`space-y-2 rounded-2xl border p-4 transition ${
                hasErrors
                  ? "border-rose-500/40 bg-rose-500/[0.06]"
                  : "border-white/10 bg-slate-950/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Row {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove row ${idx + 1}`}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={row.teamA}
                    onChange={(e) => updateRow(row.id, "teamA", e.target.value)}
                    aria-label={`Bulk row ${idx + 1} Team A`}
                    placeholder="Team A"
                    maxLength={100}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={row.teamB}
                    onChange={(e) => updateRow(row.id, "teamB", e.target.value)}
                    aria-label={`Bulk row ${idx + 1} Team B`}
                    placeholder="Team B"
                    maxLength={100}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="datetime-local"
                    value={row.matchTime}
                    onChange={(e) => updateRow(row.id, "matchTime", e.target.value)}
                    aria-label={`Bulk row ${idx + 1} Match Time`}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div className="sm:col-span-1">
                  <select
                    value={row.multiplier}
                    onChange={(e) =>
                      updateRow(
                        row.id,
                        "multiplier",
                        Number(e.target.value) as PointsMultiplier,
                      )
                    }
                    aria-label={`Bulk row ${idx + 1} Multiplier`}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white outline-none focus:border-amber-400"
                  >
                    {MULTIPLIER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}x
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hasErrors && (
                <div
                  data-testid={`bulk-entry-row-errors-${idx}`}
                  role="alert"
                  className="space-y-0.5 pt-1"
                >
                  {row.errors.map((err) => (
                    <p key={err} className="text-xs text-rose-400">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
            <Check className="h-4 w-4" />
          )}
          {isSubmitting ? "Submitting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
