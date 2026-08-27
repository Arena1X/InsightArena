"use client";

import { useMemo, useState } from "react";
import { Button } from "@/component/ui/button";
import type { CreateDisputeInput } from "@/hooks/useMarketDisputes";

type Props = {
  marketId: string;
  marketTitle: string;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: string | null;
  onSubmit: (input: CreateDisputeInput) => Promise<unknown>;
  onCancel?: () => void;
};

export default function DisputeForm({
  marketId,
  marketTitle,
  submitting,
  submitError,
  submitSuccess,
  onSubmit,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const [evidenceLinks, setEvidenceLinks] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => reason.trim().length >= 20 && !submitting,
    [reason, submitting],
  );

  function addEvidenceLink() {
    const value = evidenceDraft.trim();
    if (!value) return;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setLocalError("Evidence must be an http(s) URL.");
        return;
      }
    } catch {
      setLocalError("Evidence must be a valid URL.");
      return;
    }
    if (evidenceLinks.includes(value)) {
      setLocalError("That evidence link was already added.");
      return;
    }
    setEvidenceLinks((prev) => [...prev, value]);
    setEvidenceDraft("");
    setLocalError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (reason.trim().length < 20) {
      setLocalError("Please provide at least 20 characters explaining the dispute.");
      return;
    }
    try {
      await onSubmit({
        marketId,
        reason: reason.trim(),
        evidenceLinks,
      });
      setReason("");
      setEvidenceLinks([]);
      setEvidenceDraft("");
    } catch {
      // surfaced via submitError
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-orange-300/80">
          Raise dispute
        </p>
        <h3 className="mt-2 text-lg font-semibold text-white">{marketTitle}</h3>
        <p className="mt-1 text-sm text-gray-400">
          Contest the resolved outcome and attach supporting evidence links.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-gray-300">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Explain why the resolution is incorrect (min 20 characters)"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none ring-orange-500/40 focus:ring"
        />
        <span className="text-xs text-gray-500">{reason.trim().length}/1000</span>
      </label>

      <div className="space-y-2">
        <span className="text-sm text-gray-300">Evidence links</span>
        <div className="flex gap-2">
          <input
            type="url"
            value={evidenceDraft}
            onChange={(e) => setEvidenceDraft(e.target.value)}
            placeholder="https://example.com/proof"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none ring-orange-500/40 focus:ring"
          />
          <Button
            type="button"
            variant="outline"
            className="border-white/10 text-gray-200"
            onClick={addEvidenceLink}
          >
            Add
          </Button>
        </div>
        {evidenceLinks.length > 0 && (
          <ul className="space-y-1 text-sm text-gray-300">
            {evidenceLinks.map((link) => (
              <li
                key={link}
                className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2"
              >
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-orange-300 hover:underline"
                >
                  {link}
                </a>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-white"
                  onClick={() =>
                    setEvidenceLinks((prev) => prev.filter((l) => l !== link))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(localError || submitError) && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {localError || submitError}
        </p>
      )}
      {submitSuccess && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {submitSuccess}
        </p>
      )}

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="border-white/10 text-gray-300"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit dispute"}
        </Button>
      </div>
    </form>
  );
}
