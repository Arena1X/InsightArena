"use client";

import { useState, useRef } from "react";
import { Upload, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/component/ui/button";
import type { MatchFormData } from "./AddMatchForm";

interface ParsedRow {
  teamA: string;
  teamB: string;
  matchTime: string;
  multiplier: 1 | 2 | 3;
  error?: string;
}

interface BulkMatchUploadProps {
  currentMatchCount: number;
  maxMatches?: number;
  onImport: (matches: MatchFormData[]) => Promise<void>;
}

function parseCSV(raw: string): ParsedRow[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, idx) => {
    const cols = line.split(",").map((c) => c.trim());
    const [teamA = "", teamB = "", matchTime = "", multiplierValue = "1"] = cols;
    const errors: string[] = [];
    const parsedMultiplier = Number(multiplierValue);
    const multiplier = [1, 2, 3].includes(parsedMultiplier)
      ? (parsedMultiplier as 1 | 2 | 3)
      : 1;

    if (!teamA) errors.push("Team A is empty");
    if (!teamB) errors.push("Team B is empty");
    if (teamA && teamB && teamA.toLowerCase() === teamB.toLowerCase())
      errors.push("Team names must be different");
    if (!matchTime) {
      errors.push("Match time is missing");
    } else {
      const dt = new Date(matchTime);
      if (isNaN(dt.getTime())) errors.push("Invalid ISO 8601 date");
      else if (dt <= new Date()) errors.push("Match time must be in the future");
    }
    if (multiplierValue && !["1", "2", "3"].includes(multiplierValue)) {
      errors.push("Multiplier must be 1, 2, or 3");
    }

    return {
      teamA,
      teamB,
      matchTime,
      multiplier,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  });
}

export default function BulkMatchUpload({
  currentMatchCount,
  maxMatches = 100,
  onImport,
}: BulkMatchUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportError(null);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows);
    };
    reader.readAsText(file);
  }

  function handleClear() {
    setPreview(null);
    setFileName(null);
    setImportError(null);
    setImportSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImportAll() {
    if (!preview) return;

    const valid = preview.filter((r) => !r.error);
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
          multiplier: r.multiplier,
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

  const validCount = preview?.filter((r) => !r.error).length ?? 0;
  const errorCount = preview?.filter((r) => r.error).length ?? 0;

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
          Team A, Team B, Match Time (ISO 8601), Multiplier (optional)
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
                  <th className="px-4 py-2">Team A</th>
                  <th className="px-4 py-2">Team B</th>
                  <th className="px-4 py-2">Match Time</th>
                  <th className="px-4 py-2">Multiplier</th>
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
                    <td className="px-4 py-2 text-white">
                      {row.teamA || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-2 text-white">
                      {row.teamB || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">
                      {row.matchTime || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {row.multiplier}×
                    </td>
                    <td className="px-4 py-2">
                      {row.error ? (
                        <span className="text-xs text-rose-400" title={row.error}>
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
