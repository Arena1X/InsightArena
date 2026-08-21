"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Upload, X, Check, AlertCircle, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/component/ui/button";
import { validators } from "@/lib/validators";
import type { MatchFormData } from "./AddMatchForm";

interface ParsedRow {
  teamA: string;
  teamB: string;
  matchTime: string;
  errors: string[];
}

interface ExistingMatch {
  teamA: string;
  teamB: string;
}

interface BulkMatchUploadProps {
  currentMatchCount: number;
  maxMatches?: number;
  onImport: (matches: MatchFormData[]) => Promise<void>;
  existingMatches?: ExistingMatch[];
}

const MAX_TEAM_NAME = 100;

// Shared validators for bulk match rows
const validateTeamA = validators.compose(
  validators.required("Team A"),
  validators.maxLength(MAX_TEAM_NAME, "Team A"),
);

const validateTeamB = validators.compose(
  validators.required("Team B"),
  validators.maxLength(MAX_TEAM_NAME, "Team B"),
);

function validateMatchTimeRaw(value: string): string | undefined {
  if (!value) return "Match time is required.";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "Invalid ISO 8601 date.";
  if (dt <= new Date()) return "Match time must be in the future.";
  return undefined;
}

function validateDuplicate(
  teamA: string,
  teamB: string,
  existing: ExistingMatch[],
  currentIndex: number,
  allRows: ParsedRow[],
): string | undefined {
  // Check against existing matches in the event
  const lowerA = teamA.toLowerCase().trim();
  const lowerB = teamB.toLowerCase().trim();
  for (const match of existing) {
    if (
      match.teamA.toLowerCase() === lowerA &&
      match.teamB.toLowerCase() === lowerB
    ) {
      return `Duplicate match: "${teamA}" vs "${teamB}" already exists.`;
    }
  }
  // Check against other rows in the same CSV
  for (let i = 0; i < allRows.length; i++) {
    if (i === currentIndex) continue;
    if (
      allRows[i].teamA.toLowerCase().trim() === lowerA &&
      allRows[i].teamB.toLowerCase().trim() === lowerB
    ) {
      return `Duplicate: row ${i + 1} already has "${teamA}" vs "${teamB}".`;
    }
  }
  return undefined;
}

export function parseCSV(
  raw: string,
  existing: ExistingMatch[],
): ParsedRow[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // First pass: parse all rows to build the full list for cross-row duplicate check
  const parsed: { teamA: string; teamB: string; matchTime: string }[] = lines.map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const [teamA = "", teamB = "", matchTime = ""] = cols;
    return { teamA, teamB, matchTime };
  });

  // Second pass: validate each row
  return parsed.map((row, idx) => {
    const errors: string[] = [];

    const teamAErr = validateTeamA(row.teamA);
    if (teamAErr) errors.push(teamAErr);

    const teamBErr = validateTeamB(row.teamB);
    if (teamBErr) errors.push(teamBErr);

    // Cross-check teams are different
    if (row.teamA && row.teamB && row.teamA.toLowerCase() === row.teamB.toLowerCase()) {
      errors.push("Team names must be different.");
    }

    const timeErr = validateMatchTimeRaw(row.matchTime);
    if (timeErr) errors.push(timeErr);

    // Duplicate check
    const dupErr = validateDuplicate(row.teamA, row.teamB, existing, idx, parsed.map((p) => ({
      teamA: p.teamA,
      teamB: p.teamB,
      matchTime: p.matchTime,
      errors: [],
    })));
    if (dupErr) errors.push(dupErr);

    return { ...row, errors };
  });
}

export default function BulkMatchUpload({
  currentMatchCount,
  maxMatches = 100,
  onImport,
  existingMatches = [],
}: BulkMatchUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ teamA: string; teamB: string; matchTime: string } | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportError(null);
    setImportSuccess(false);
    setEditingIndex(null);
    setEditValues(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text, existingMatches);
      setPreview(rows);
    };
    reader.readAsText(file);
  }, [existingMatches]);

  function handleClear() {
    setPreview(null);
    setFileName(null);
    setImportError(null);
    setImportSuccess(false);
    setEditingIndex(null);
    setEditValues(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function startEdit(row: ParsedRow, idx: number) {
    setEditingIndex(idx);
    setEditValues({ teamA: row.teamA, teamB: row.teamB, matchTime: row.matchTime });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValues(null);
  }

  function confirmEdit() {
    if (editingIndex === null || !editValues || !preview) return;

    const updated = [...preview];
    updated[editingIndex] = {
      teamA: editValues.teamA,
      teamB: editValues.teamB,
      matchTime: editValues.matchTime,
      errors: [], // will be re-validated
    };

    // Re-validate the entire list after edit
    const revalidated = updated.map((row, idx) => {
      const errors: string[] = [];

      const teamAErr = validateTeamA(row.teamA);
      if (teamAErr) errors.push(teamAErr);

      const teamBErr = validateTeamB(row.teamB);
      if (teamBErr) errors.push(teamBErr);

      if (row.teamA && row.teamB && row.teamA.toLowerCase() === row.teamB.toLowerCase()) {
        errors.push("Team names must be different.");
      }

      const timeErr = validateMatchTimeRaw(row.matchTime);
      if (timeErr) errors.push(timeErr);

      const dupErr = validateDuplicate(
        row.teamA, row.teamB, existingMatches, idx,
        updated.map((p) => ({ teamA: p.teamA, teamB: p.teamB, matchTime: p.matchTime, errors: [] })),
      );
      if (dupErr) errors.push(dupErr);

      return { ...row, errors };
    });

    setPreview(revalidated);
    setEditingIndex(null);
    setEditValues(null);
  }

  async function handleImportAll() {
    if (!preview) return;

    const valid = preview.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setImportError("No valid rows to import.");
      return;
    }

    const remaining = maxMatches - currentMatchCount;
    if (valid.length > remaining) {
      setImportError(
        `Only ${remaining} more match(es) can be added (limit: ${maxMatches}).`,
      );
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      await onImport(
        valid.map((r) => ({
          teamA: r.teamA,
          teamB: r.teamB,
          matchTime: r.matchTime,
        })),
      );
      setImportSuccess(true);
      handleClear();
    } catch {
      setImportError("Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  const validCount = useMemo(
    () => preview?.filter((r) => r.errors.length === 0).length ?? 0,
    [preview],
  );
  const errorCount = useMemo(
    () => preview?.filter((r) => r.errors.length > 0).length ?? 0,
    [preview],
  );
  const hasErrors = errorCount > 0;

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Bulk Add Matches</h3>
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
          Team A, Team B, Match Time (ISO 8601)
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

      {importSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          Matches imported successfully.
        </div>
      )}

      {importError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {importError}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          {hasErrors && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
              <AlertCircle className="mr-2 inline-block h-4 w-4" />
              {errorCount} row{errorCount !== 1 ? "s" : ""} ha{errorCount === 1 ? "s" : "ve"} errors.
              Fix the errors or submit only the valid rows.
            </div>
          )}

          <div className="flex items-center gap-4 text-sm">
            <span className="text-emerald-400">✓ {validCount} valid</span>
            {hasErrors && (
              <span className="text-rose-400">✗ {errorCount} error{errorCount !== 1 ? "s" : ""}</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950">
                <tr className="text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Team A</th>
                  <th className="px-4 py-2">Team B</th>
                  <th className="px-4 py-2">Match Time</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-white/5 ${
                      row.errors.length > 0 ? "bg-rose-500/5" : ""
                    }`}
                  >
                    {editingIndex === idx && editValues ? (
                      <>
                        <td className="px-4 py-2 text-xs text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editValues.teamA}
                            onChange={(e) =>
                              setEditValues((prev) => prev ? { ...prev, teamA: e.target.value } : null)
                            }
                            maxLength={MAX_TEAM_NAME}
                            className="w-full rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 text-xs text-white outline-none focus:border-amber-400"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editValues.teamB}
                            onChange={(e) =>
                              setEditValues((prev) => prev ? { ...prev, teamB: e.target.value } : null)
                            }
                            maxLength={MAX_TEAM_NAME}
                            className="w-full rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 text-xs text-white outline-none focus:border-amber-400"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editValues.matchTime}
                            onChange={(e) =>
                              setEditValues((prev) => prev ? { ...prev, matchTime: e.target.value } : null)
                            }
                            placeholder="2026-01-01T12:00:00Z"
                            className="w-full rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 font-mono text-xs text-white outline-none focus:border-amber-400"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs text-amber-400">Editing</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={confirmEdit}
                              className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10"
                              title="Save"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded p-1 text-slate-400 hover:bg-white/10"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-xs text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2 text-white">
                          {row.teamA || <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-2 text-white">
                          {row.teamB || <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-300">
                          {row.matchTime || <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            {row.errors.length > 0 ? (
                              row.errors.map((err, i) => (
                                <span
                                  key={i}
                                  className="block max-w-[200px] truncate text-xs text-rose-400"
                                  title={err}
                                >
                                  ✗ {err}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-emerald-400">✓ OK</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {row.errors.length > 0 && (
                            <button
                              type="button"
                              onClick={() => startEdit(row, idx)}
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                              title="Edit row"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            {hasErrors && validCount > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleImportAll}
                disabled={isImporting}
                className="rounded-full border border-white/20 px-5 text-sm text-white hover:bg-white/10"
              >
                {isImporting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Submit {validCount} Valid Row{validCount !== 1 ? "s" : ""} Only
              </Button>
            )}
            <Button
              type="button"
              onClick={handleImportAll}
              disabled={isImporting || validCount === 0}
              className="rounded-full bg-amber-400 px-6 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isImporting
                ? "Importing…"
                : `Import ${validCount} Match${validCount !== 1 ? "es" : ""}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}