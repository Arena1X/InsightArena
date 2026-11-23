"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, X, Check, AlertCircle, Loader2, Download } from "lucide-react";
import { Button } from "@/component/ui/button";
import {
  parseBulkMatchCsv,
  validateBulkMatchRows,
  type BulkMatchRowResult,
} from "@/lib/validators";
import type { MatchFormData } from "./AddMatchForm";

interface BulkMatchUploadProps {
  currentMatchCount: number;
  maxMatches?: number;
  onImport: (matches: MatchFormData[]) => Promise<void>;
}

function downloadRejectedRows(rows: BulkMatchRowResult[]) {
  const rejected = rows.filter((row) => row.errors.length > 0);
  const csv = [
    "Team A,Team B,Match Time,Errors",
    ...rejected.map((row) =>
      [row.teamA, row.teamB, row.matchTime, row.errors.join("; ")]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "match-upload-errors.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function BulkMatchUpload({
  currentMatchCount,
  maxMatches = 100,
  onImport,
}: BulkMatchUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BulkMatchRowResult[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  function applyRaw(raw: string, label: string) {
    const parsed = validateBulkMatchRows(parseBulkMatchCsv(raw));
    setPreview(parsed);
    setFileName(label);
    setImportError(null);
    setImportSuccess(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      applyRaw(String(ev.target?.result ?? ""), file.name);
    };
    reader.readAsText(file);
  }

  function handlePastePreview() {
    if (!pasteValue.trim()) return;
    applyRaw(pasteValue, "Pasted matches");
  }

  function handleClear() {
    setPreview(null);
    setFileName(null);
    setPasteValue("");
    setImportError(null);
    setImportSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateRow(
    index: number,
    field: keyof Pick<BulkMatchRowResult, "teamA" | "teamB" | "matchTime">,
    value: string,
  ) {
    setPreview((current) => {
      if (!current) return current;
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return validateBulkMatchRows(next);
    });
  }

  function removeRow(index: number) {
    setPreview((current) => {
      if (!current) return current;
      const next = current.filter((_, idx) => idx !== index);
      return next.length === 0 ? null : validateBulkMatchRows(next);
    });
  }

  function removeInvalidRows() {
    setPreview((current) => {
      if (!current) return current;
      const next = current.filter((row) => row.errors.length === 0);
      return next.length === 0 ? null : next;
    });
  }

  async function submitRows(rows: BulkMatchRowResult[]) {
    const remaining = maxMatches - currentMatchCount;
    if (rows.length > remaining) {
      setImportError(
        `Only ${remaining} more match(es) can be added (limit: ${maxMatches}).`,
      );
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      await onImport(
        rows.map((row) => ({
          teamA: row.teamA,
          teamB: row.teamB,
          matchTime: row.matchTime,
        })),
      );
      setImportSuccess(true);
      const remaining_rows = preview?.filter((r) => !rows.includes(r)) ?? [];
      if (remaining_rows.length === 0) {
        handleClear();
      } else {
        setPreview(validateBulkMatchRows(remaining_rows));
      }
    } catch {
      setImportError("Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportAll() {
    if (!preview) return;
    const invalid = preview.filter((row) => row.errors.length > 0);
    if (invalid.length > 0) {
      setImportError("Remove or fix invalid rows before importing.");
      return;
    }
    await submitRows(preview);
  }

  async function handleImportValidOnly() {
    if (!preview) return;
    const valid = preview.filter((row) => row.errors.length === 0);
    if (valid.length === 0) return;
    await submitRows(valid);
  }

  const validCount = preview?.filter((row) => row.errors.length === 0).length ?? 0;
  const invalidCount = preview?.filter((row) => row.errors.length > 0).length ?? 0;
  const canSubmit = Boolean(preview?.length) && invalidCount === 0 && validCount > 0;
  const canSubmitValidOnly = invalidCount > 0 && validCount > 0;

  const summary = useMemo(() => {
    if (!preview) return null;
    return `${validCount} valid, ${invalidCount} invalid`;
  }, [preview, validCount, invalidCount]);

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
        Upload or paste a CSV with columns:{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-amber-300">
          Team A, Team B, Match Time (ISO 8601)
        </code>
      </p>

      {!fileName ? (
        <div className="space-y-3">
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
          <textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="Or paste CSV rows here…"
            className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none focus:border-amber-400"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handlePastePreview}
              disabled={!pasteValue.trim()}
              className="rounded-full bg-amber-400 px-5 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              Validate paste
            </Button>
          </div>
        </div>
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
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
              invalidCount > 0
                ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            }`}
            role="status"
          >
            <span>{summary}</span>
            <div className="flex flex-wrap gap-2">
              {invalidCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadRejectedRows(preview)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-white hover:bg-white/10"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download errors
                  </button>
                  <button
                    type="button"
                    onClick={removeInvalidRows}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-white hover:bg-white/10"
                  >
                    Remove invalid
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-slate-950">
                <tr className="text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-4 py-2">Team A</th>
                  <th className="px-4 py-2">Team B</th>
                  <th className="px-4 py-2">Match Time</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => {
                  const hasErrors = row.errors.length > 0;
                  return (
                    <tr
                      key={`row-${idx}`}
                      data-testid={`bulk-row-${idx}`}
                      className={`border-b border-white/5 ${
                        hasErrors ? "bg-rose-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2">
                        {hasErrors ? (
                          <input
                            type="text"
                            value={row.teamA}
                            onChange={(e) => updateRow(idx, "teamA", e.target.value)}
                            aria-label={`Row ${idx + 1} Team A`}
                            className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-amber-400"
                          />
                        ) : (
                          <span className="text-white">
                            {row.teamA || <span className="text-slate-500">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {hasErrors ? (
                          <input
                            type="text"
                            value={row.teamB}
                            onChange={(e) => updateRow(idx, "teamB", e.target.value)}
                            aria-label={`Row ${idx + 1} Team B`}
                            className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-amber-400"
                          />
                        ) : (
                          <span className="text-white">
                            {row.teamB || <span className="text-slate-500">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {hasErrors ? (
                          <input
                            type="text"
                            value={row.matchTime}
                            onChange={(e) => updateRow(idx, "matchTime", e.target.value)}
                            aria-label={`Row ${idx + 1} Match Time`}
                            placeholder="YYYY-MM-DDTHH:MM"
                            className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 font-mono text-xs text-white outline-none focus:border-amber-400"
                          />
                        ) : (
                          <span className="font-mono text-xs text-slate-300">
                            {row.matchTime || <span className="text-slate-500">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {hasErrors ? (
                          <div className="space-y-1">
                            {row.errors.map((error) => (
                              <p key={error} className="text-xs text-rose-400">
                                {error}
                              </p>
                            ))}
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="text-[11px] text-slate-400 underline hover:text-white"
                            >
                              Remove row
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-400">Valid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {canSubmitValidOnly && (
              <Button
                type="button"
                onClick={handleImportValidOnly}
                disabled={isImporting}
                data-testid="submit-valid-only"
                className="rounded-full border border-amber-400/40 bg-transparent px-6 text-amber-300 hover:bg-amber-400/10 disabled:opacity-60"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Submit {validCount} valid only
              </Button>
            )}
            <Button
              type="button"
              onClick={handleImportAll}
              disabled={isImporting || !canSubmit}
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
