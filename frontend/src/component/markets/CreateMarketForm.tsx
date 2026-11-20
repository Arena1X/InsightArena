"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  X,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/component/ui/button";
import { validators, validateOutcomes } from "@/lib/validators";
import MarketCard from "@/component/MarketCard";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

type OutcomeMode = "binary" | "multi";

interface MarketDraft {
  title: string;
  category: string;
  description: string;
  isPublic: boolean;
  endDate: string;
  endClock: string;
  resolutionDate: string;
  resolutionClock: string;
  resolutionSource: string;
  outcomeMode: OutcomeMode;
  outcomes: string[];
  minStakeXlm: string;
  maxStakeXlm: string;
  creatorFeePct: number;
  creatorLiquiditySeed: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAFT_KEY = "create_market_draft";
const MAX_TITLE = 140;
const MAX_DESCRIPTION = 2000;
const MAX_CREATOR_FEE_PCT = 5;

const CATEGORIES = ["Crypto", "Sports", "Finance", "Politics", "Tech"];

const STEP_LABELS = ["Details", "Resolution", "Staking", "Review"];

// ── Draft helpers ─────────────────────────────────────────────────────────────

function defaultDraft(): MarketDraft {
  return {
    title: "",
    category: "",
    description: "",
    isPublic: true,
    endDate: "",
    endClock: "23:59",
    resolutionDate: "",
    resolutionClock: "23:59",
    resolutionSource: "",
    outcomeMode: "binary",
    outcomes: ["Yes", "No"],
    minStakeXlm: "1",
    maxStakeXlm: "1000",
    creatorFeePct: 1,
    creatorLiquiditySeed: "10",
  };
}

function loadDraft(): MarketDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...defaultDraft(), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function saveDraft(draft: MarketDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center gap-2">
      {STEP_LABELS.map((label, idx) => {
        const s = idx + 1;
        const done = current > s;
        const active = current === s;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  done
                    ? "border-orange-400 bg-orange-400 text-white"
                    : active
                      ? "border-orange-400 bg-transparent text-orange-400"
                      : "border-white/20 bg-transparent text-slate-500"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : s}
              </div>
              <span
                className={`hidden text-[10px] sm:block ${
                  active ? "text-orange-400" : done ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`mb-4 h-px w-10 sm:w-14 transition-colors ${
                  done ? "bg-orange-400" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  return <p id={id} className="text-xs text-rose-400">{msg}</p>;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300">
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 placeholder:text-slate-600";

// ── Main form ─────────────────────────────────────────────────────────────────

export default function CreateMarketForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<MarketDraft>(defaultDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcomeInput, setOutcomeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [createdMarketId, setCreatedMarketId] = useState("");
  const [hasDraftBanner, setHasDraftBanner] = useState(false);

  useEffect(() => {
    const saved = loadDraft();
    if (saved && saved.title) {
      setHasDraftBanner(true);
    }
  }, []);

  function patch(partial: Partial<MarketDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(partial)) {
        delete next[key];
      }
      return next;
    });
  }

  function validateField(field: string): string {
    switch (field) {
      case "title":
        return (
          validators.compose(
            validators.required("Title"),
            validators.maxLength(MAX_TITLE, "Title"),
          )(draft.title) || ""
        );
      case "endDate":
      case "endClock": {
        const endDt = draft.endDate ? `${draft.endDate}T${draft.endClock}` : "";
        if (!draft.endDate) return "Market close date is required.";
        if (!draft.endClock) return "Market close time is required.";
        if (new Date(endDt) <= new Date()) return "Close date must be strictly in the future.";
        return "";
      }
      case "outcomes": {
        if (draft.outcomeMode === "multi") {
          return validateOutcomes(draft.outcomes) || "";
        }
        return "";
      }
      default:
        return "";
    }
  }

  function resumeDraft() {
    const saved = loadDraft();
    if (saved) setDraft(saved);
    setHasDraftBanner(false);
  }

  function dismissDraft() {
    clearDraft();
    setHasDraftBanner(false);
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    const titleError = validators.compose(
      validators.required("Title"),
      validators.minLength(5, "Title"),
      validators.maxLength(MAX_TITLE, "Title"),
    )(draft.title);
    if (titleError) errs.title = titleError;

    const categoryError = validators.required("Category")(draft.category);
    if (categoryError) errs.category = "Please select a category.";

    const descriptionError = validators.compose(
      validators.required("Description"),
      validators.minLength(10, "Description"),
    )(draft.description);
    if (descriptionError) errs.description = descriptionError;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {};
    const now = new Date();
    const endDt = draft.endDate ? `${draft.endDate}T${draft.endClock}` : "";
    const resDt = draft.resolutionDate ? `${draft.resolutionDate}T${draft.resolutionClock}` : "";

    if (!draft.endDate) {
      errs.endDate = "Market close date is required.";
    } else if (new Date(endDt) <= now) {
      errs.endDate = "Close date must be in the future.";
    }
    if (!draft.resolutionDate) {
      errs.resolutionDate = "Resolution date is required.";
    } else if (endDt && new Date(resDt) < new Date(endDt)) {
      errs.resolutionDate = "Resolution date must be on or after the close date.";
    }
    if (draft.outcomeMode === "multi") {
      const outcomesError = validateOutcomes(draft.outcomes);
      if (outcomesError) errs.outcomes = outcomesError;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep3(): boolean {
    const errs: Record<string, string> = {};
    const min = parseFloat(draft.minStakeXlm);
    const max = parseFloat(draft.maxStakeXlm);

    const minError = validators.minValue(0.01, "Minimum stake")(draft.minStakeXlm);
    if (isNaN(min) || minError) errs.minStakeXlm = "Minimum stake must be greater than 0.";

    const maxError = validators.minValue(0.01, "Maximum stake")(draft.maxStakeXlm);
    if (isNaN(max) || maxError) errs.maxStakeXlm = "Maximum stake must be greater than 0.";

    if (!isNaN(min) && !isNaN(max) && max < min) errs.maxStakeXlm = "Maximum stake must be ≥ minimum stake.";

    const seedError = validators.minValue(0, "Liquidity seed")(draft.creatorLiquiditySeed);
    if (seedError) errs.creatorLiquiditySeed = "Liquidity seed cannot be negative.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    const valid =
      step === 1 ? validateStep1() :
      step === 2 ? validateStep2() :
      step === 3 ? validateStep3() : true;
    if (valid) {
      saveDraft(draft);
      setStep((s) => (s + 1) as Step);
    }
  }

  function goBack() {
    setErrors({});
    setStep((s) => (s - 1) as Step);
  }

  // ── Outcome chip helpers ────────────────────────────────────────────────────

  function addOutcome() {
    const trimmed = outcomeInput.trim();
    if (!trimmed) {
      setErrors((prev) => ({ ...prev, outcomes: "Outcome label cannot be empty." }));
      return;
    }
    if (draft.outcomes.length >= 10) {
      setErrors((prev) => ({ ...prev, outcomes: "You can add up to 10 outcomes." }));
      return;
    }
    const isDuplicate = draft.outcomes.some(
      (o) => o.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      setErrors((prev) => ({ ...prev, outcomes: "That outcome already exists." }));
      return;
    }
    patch({ outcomes: [...draft.outcomes, trimmed] });
    setOutcomeInput("");
    setErrors((prev) => ({ ...prev, outcomes: "" }));
  }

  function removeOutcome(idx: number) {
    patch({ outcomes: draft.outcomes.filter((_, i) => i !== idx) });
    setErrors((prev) => ({ ...prev, outcomes: "" }));
  }

  function moveOutcome(idx: number, direction: -1 | 1) {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= draft.outcomes.length) return;
    const next = [...draft.outcomes];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    patch({ outcomes: next });
  }

  // ── Submit (mock) ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    setTxError(null);
    setIsSubmitting(true);
    try {
      // Demo: simulate network delay
      await new Promise((res) => setTimeout(res, 1800));
      const mockId = `mkt_${Math.random().toString(36).slice(2, 9)}`;
      setCreatedMarketId(mockId);
      clearDraft();
      setHasDraftBanner(false);
      setStep(5);
    } catch {
      setTxError("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const previewMarket = useMemo(
    () => ({
      id: "preview",
      title: draft.title.trim() || "Your market title will appear here",
      category: draft.category || "Uncategorized",
      probability: 0.5,
      totalStaked: parseFloat(draft.creatorLiquiditySeed) || 0,
      closeAt: draft.endDate
        ? `${draft.endDate}T${draft.endClock || "23:59"}`
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "upcoming",
    }),
    [draft.title, draft.category, draft.creatorLiquiditySeed, draft.endDate, draft.endClock],
  );

  function formatDatetime(date: string, clock: string): string {
    if (!date) return "—";
    try {
      return new Date(`${date}T${clock}`).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "—";
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      {/* Draft resume banner */}
      {hasDraftBanner && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-orange-400/20 bg-orange-400/5 px-5 py-3">
          <p className="text-sm text-orange-300">
            You have a saved draft. Resume where you left off?
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resumeDraft}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={dismissDraft}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {step < 5 && <StepIndicator current={step} />}

      {/* ── Step 1: Market Details ────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80">Step 1 of 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Market Details</h2>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="market-title">Question / Title</Label>
            <input
              id="market-title"
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              onBlur={() => setErrors((prev) => ({ ...prev, title: validateField("title") }))}
              maxLength={MAX_TITLE}
              placeholder="e.g. Will BTC reach $100k by end of 2026?"
              className={inputCls}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
            <div className="flex justify-between">
              <FieldError msg={errors.title} id="title-error" />
              <p className="ml-auto text-xs text-slate-500">{draft.title.length}/{MAX_TITLE}</p>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="market-category">Category</Label>
            <select
              id="market-category"
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value })}
              className={`${inputCls} appearance-none`}
            >
              <option value="" disabled className="bg-slate-950">
                Select a category…
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-slate-950">
                  {c}
                </option>
              ))}
            </select>
            <FieldError msg={errors.category} />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="market-description">
              Description / Resolution Criteria{" "}
              <span className="text-slate-500 font-normal">(markdown supported)</span>
            </Label>
            <textarea
              id="market-description"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              maxLength={MAX_DESCRIPTION}
              rows={5}
              placeholder="Describe the market and explain exactly how it will be resolved…"
              className={`${inputCls} resize-none`}
            />
            <div className="flex justify-between">
              <FieldError msg={errors.description} />
              <p className="ml-auto text-xs text-slate-500">{draft.description.length}/{MAX_DESCRIPTION}</p>
            </div>
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Public Market</p>
              <p className="text-xs text-slate-500">Visible to all users on the platform</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.isPublic}
              onClick={() => patch({ isPublic: !draft.isPublic })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                draft.isPublic ? "bg-orange-500" : "bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  draft.isPublic ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300 hover:border-white/30"
              onClick={() => { saveDraft(draft); }}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              onClick={goNext}
              className="rounded-full bg-orange-500 px-8 text-white hover:bg-orange-400"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Resolution ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80">Step 2 of 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Resolution</h2>
          </div>

          {/* End date + time */}
          <div className="space-y-2">
            <Label htmlFor="end-date">Market Closes At</Label>
            <div className="grid grid-cols-2 gap-3">
              <input
                id="end-date"
                type="date"
                value={draft.endDate}
                min={todayStr}
                onChange={(e) => patch({ endDate: e.target.value })}
                onBlur={() => setErrors((prev) => ({ ...prev, endDate: validateField("endDate") }))}
                className={inputCls}
                aria-invalid={!!errors.endDate}
                aria-describedby={errors.endDate ? "endDate-error" : undefined}
              />
              <input
                id="end-clock"
                type="time"
                value={draft.endClock}
                onChange={(e) => patch({ endClock: e.target.value })}
                onBlur={() => setErrors((prev) => ({ ...prev, endDate: validateField("endDate") }))}
                className={inputCls}
                aria-invalid={!!errors.endDate}
                aria-describedby={errors.endDate ? "endDate-error" : undefined}
              />
            </div>
            <FieldError msg={errors.endDate} id="endDate-error" />
          </div>

          {/* Resolution date + time */}
          <div className="space-y-2">
            <Label htmlFor="resolution-date">Resolution Date</Label>
            <div className="grid grid-cols-2 gap-3">
              <input
                id="resolution-date"
                type="date"
                value={draft.resolutionDate}
                min={draft.endDate || todayStr}
                onChange={(e) => patch({ resolutionDate: e.target.value })}
                className={inputCls}
              />
              <input
                id="resolution-clock"
                type="time"
                value={draft.resolutionClock}
                onChange={(e) => patch({ resolutionClock: e.target.value })}
                className={inputCls}
              />
            </div>
            <p className="text-xs text-slate-500">
              Must be on or after the close date. This is when the result is officially settled.
            </p>
            <FieldError msg={errors.resolutionDate} />
          </div>

          {/* Resolution source */}
          <div className="space-y-2">
            <Label htmlFor="resolution-source">
              Resolution Source{" "}
              <span className="text-slate-500 font-normal">(URL or oracle address, optional)</span>
            </Label>
            <input
              id="resolution-source"
              type="text"
              value={draft.resolutionSource}
              onChange={(e) => patch({ resolutionSource: e.target.value })}
              placeholder="https://example.com/results or oracle address"
              className={inputCls}
            />
          </div>

          {/* Outcome type */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-300">Outcome Type</p>
            <div className="flex gap-3">
              {(["binary", "multi"] as OutcomeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    patch({
                      outcomeMode: mode,
                      outcomes: mode === "binary" ? ["Yes", "No"] : [],
                    });
                    setErrors((prev) => ({ ...prev, outcomes: "" }));
                  }}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    draft.outcomeMode === mode
                      ? "border-orange-400 bg-orange-400/10 text-orange-300"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {mode === "binary" ? "Binary (Yes / No)" : "Multi-Outcome"}
                </button>
              ))}
            </div>

            {/* Binary preview */}
            {draft.outcomeMode === "binary" && (
              <div className="flex gap-2">
                {["Yes", "No"].map((o) => (
                  <span
                    key={o}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300"
                  >
                    {o}
                  </span>
                ))}
              </div>
            )}

            {/* Multi-outcome chip input */}
            {draft.outcomeMode === "multi" && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-500">Add 2–10 outcomes</p>
                <div className="space-y-2">
                  {draft.outcomes.map((o, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3 py-2"
                    >
                      <span className="flex-1 truncate text-sm text-white">{o}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveOutcome(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${o} up`}
                          className="rounded p-1 text-slate-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOutcome(i, 1)}
                          disabled={i === draft.outcomes.length - 1}
                          aria-label={`Move ${o} down`}
                          className="rounded p-1 text-slate-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOutcome(i)}
                          aria-label={`Remove outcome ${o}`}
                          className="rounded p-1 text-slate-500 transition hover:text-rose-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {draft.outcomes.length < 2 && (
                  <p className="text-xs text-slate-500">
                    Add at least 2 outcomes to continue.
                  </p>
                )}
                {draft.outcomes.length < 10 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={outcomeInput}
                      onChange={(e) => setOutcomeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOutcome())}
                      onBlur={() => setErrors((prev) => ({ ...prev, outcomes: validateField("outcomes") }))}
                      placeholder="Type an outcome…"
                      className="flex-1 rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
                      aria-invalid={!!errors.outcomes}
                      aria-describedby={errors.outcomes ? "outcomes-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={addOutcome}
                      className="inline-flex items-center gap-1 rounded-xl bg-orange-500/20 px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/30 transition"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                )}
                <FieldError msg={errors.outcomes} id="outcomes-error" />
              </div>
            )}
            {draft.outcomeMode === "binary" && (
              <FieldError msg={errors.outcomes} id="outcomes-error" />
            )}
          </div>

          {/* Live preview */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-300">Live Preview</p>
            <MarketCard market={previewMarket} onPredict={() => {}} preview />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300 hover:border-white/30"
              onClick={goBack}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={goNext}
              className="rounded-full bg-orange-500 px-8 text-white hover:bg-orange-400"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Staking ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80">Step 3 of 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Staking</h2>
          </div>

          {/* Min / Max stake */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-stake">Min Stake (XLM)</Label>
              <input
                id="min-stake"
                type="number"
                min="0.01"
                step="0.01"
                value={draft.minStakeXlm}
                onChange={(e) => patch({ minStakeXlm: e.target.value })}
                className={inputCls}
              />
              <FieldError msg={errors.minStakeXlm} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-stake">Max Stake (XLM)</Label>
              <input
                id="max-stake"
                type="number"
                min="0.01"
                step="0.01"
                value={draft.maxStakeXlm}
                onChange={(e) => patch({ maxStakeXlm: e.target.value })}
                className={inputCls}
              />
              <FieldError msg={errors.maxStakeXlm} />
            </div>
          </div>

          {/* Creator liquidity seed */}
          <div className="space-y-2">
            <Label htmlFor="liquidity-seed">Creator Liquidity Seed (XLM)</Label>
            <input
              id="liquidity-seed"
              type="number"
              min="0"
              step="0.01"
              value={draft.creatorLiquiditySeed}
              onChange={(e) => patch({ creatorLiquiditySeed: e.target.value })}
              className={inputCls}
            />
            <p className="text-xs text-slate-500">
              Initial XLM you deposit to bootstrap market liquidity.
            </p>
            <FieldError msg={errors.creatorLiquiditySeed} />
          </div>

          {/* Creator fee slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="creator-fee">Creator Fee</Label>
              <span className="text-sm font-semibold text-orange-400">
                {draft.creatorFeePct.toFixed(1)}%
              </span>
            </div>
            <input
              id="creator-fee"
              type="range"
              min="0"
              max={MAX_CREATOR_FEE_PCT}
              step="0.1"
              value={draft.creatorFeePct}
              onChange={(e) => patch({ creatorFeePct: parseFloat(e.target.value) })}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>0%</span>
              <span>Platform max: {MAX_CREATOR_FEE_PCT}%</span>
            </div>
            <div className="rounded-2xl border border-orange-400/20 bg-orange-400/5 px-4 py-3">
              <p className="text-xs text-orange-300/80">
                At <span className="font-semibold">{draft.creatorFeePct.toFixed(1)}%</span> on a 1,000 XLM pool you earn{" "}
                <span className="font-semibold">{(1000 * draft.creatorFeePct / 100).toFixed(2)} XLM</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300 hover:border-white/30"
              onClick={goBack}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={goNext}
              className="rounded-full bg-orange-500 px-8 text-white hover:bg-orange-400"
            >
              Review
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Submit ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80">Step 4 of 4</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Review & Submit</h2>
          </div>

          {/* Summary table */}
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
            {[
              { label: "Title", value: draft.title },
              { label: "Category", value: draft.category },
              { label: "Visibility", value: draft.isPublic ? "Public" : "Private" },
              { label: "Closes At", value: formatDatetime(draft.endDate, draft.endClock) },
              { label: "Resolves At", value: formatDatetime(draft.resolutionDate, draft.resolutionClock) },
              {
                label: "Resolution Source",
                value: draft.resolutionSource || "—",
              },
              { label: "Min Stake", value: `${draft.minStakeXlm} XLM` },
              { label: "Max Stake", value: `${draft.maxStakeXlm} XLM` },
              {
                label: "Liquidity Seed",
                value: `${draft.creatorLiquiditySeed} XLM`,
              },
              { label: "Creator Fee", value: `${draft.creatorFeePct.toFixed(1)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-white text-right max-w-[55%] break-words">{value}</span>
              </div>
            ))}

            {/* Outcomes */}
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Outcomes</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {draft.outcomes.map((o) => (
                  <span
                    key={o}
                    className="rounded-full bg-orange-500/10 border border-orange-400/20 px-2.5 py-0.5 text-xs text-orange-300"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>

            {/* Description excerpt */}
            {draft.description && (
              <div className="pt-2">
                <span className="text-slate-500 text-sm">Description</span>
                <p className="mt-1 line-clamp-3 text-sm text-white/80 leading-relaxed">
                  {draft.description}
                </p>
              </div>
            )}
          </div>

          {txError && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {txError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300 hover:border-white/30"
              onClick={goBack}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-full bg-orange-500 px-8 text-white hover:bg-orange-400 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Market…
                </>
              ) : (
                "Create Market"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Success ──────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6 rounded-3xl border border-emerald-500/20 bg-slate-900/80 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-white">Market Created!</h2>
            <p className="text-slate-400">
              Your prediction market is live and ready for participants.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Market ID</p>
            <p className="mt-2 font-mono text-lg font-semibold text-orange-300">
              {createdMarketId}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              type="button"
              onClick={() => router.push("/my-markets")}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 text-white hover:bg-orange-400"
            >
              <ExternalLink className="h-4 w-4" />
              View My Markets
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(defaultDraft());
                setErrors({});
                setTxError(null);
                setStep(1);
              }}
              className="rounded-full border-white/10 text-slate-300 hover:border-white/30"
            >
              Create Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
