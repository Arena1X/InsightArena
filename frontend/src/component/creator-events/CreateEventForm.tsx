"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Share2, Twitter, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/component/ui/button";
import { useWallet } from "@/context/WalletContext";
import { useCreatorEvents } from "@/hooks/useCreatorEvents";

type Step = 1 | 2 | 3;

interface RewardDraft {
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
}

interface EventDraft {
  title: string;
  description: string;
  maxParticipants: number;
  startTime: string;
  endTime: string;
  prizePool: number;
  rewardDistribution: RewardDraft;
  entryFee: number;
  category: string;
  bannerUrl: string;
}

const DRAFT_KEY = "creator_event_draft";
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 1000;

function defaultReward(): RewardDraft {
  return { rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0 };
}

function defaultDraft(): EventDraft {
  return {
    title: "",
    description: "",
    maxParticipants: 100,
    startTime: "",
    endTime: "",
    prizePool: 0,
    rewardDistribution: defaultReward(),
    entryFee: 0,
    category: "",
    bannerUrl: "",
  };
}

function loadDraft(): EventDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...defaultDraft(),
      ...parsed,
      rewardDistribution: { ...defaultReward(), ...parsed.rewardDistribution },
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: EventDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}

export default function CreateEventForm() {
  const router = useRouter();
  const { address } = useWallet();
  const { createEvent } = useCreatorEvents();

  const [step, setStep] = useState<Step>(1);

  const [draft, setDraft] = useState<EventDraft>(defaultDraft());
  const {
    title,
    description,
    maxParticipants,
    startTime,
    endTime,
    prizePool,
    rewardDistribution,
    entryFee,
    category,
    bannerUrl,
  } = draft;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creationFee, setCreationFee] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [createdEventId, setCreatedEventId] = useState("");
  const [copied, setCopied] = useState(false);

  function patch(partial: Partial<EventDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  useEffect(() => {
    const saved = loadDraft();
    if (saved) setDraft(saved);
  }, []);

  // Auto-save draft on every change
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (step === 2 && !creationFee) {
      setCreationFee("10.0000000");
    }
  }, [step, creationFee]);

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Event title is required.";
    else if (title.length > MAX_TITLE)
      errs.title = `Title must be ${MAX_TITLE} characters or fewer.`;
    if (description.length > MAX_DESCRIPTION)
      errs.description = `Description must be ${MAX_DESCRIPTION} characters or fewer.`;
    if (
      !Number.isInteger(maxParticipants) ||
      maxParticipants < MIN_PARTICIPANTS ||
      maxParticipants > MAX_PARTICIPANTS
    )
      errs.maxParticipants = `Participants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}.`;
    if (!startTime) {
      errs.startTime = "Start time is required.";
    }
    if (!endTime) {
      errs.endTime = "End time is required.";
    }
    if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
      errs.endTime = "End time must be after start time.";
    }
    if (prizePool < 0)
      errs.prizePool = "Prize pool cannot be negative.";
    if (entryFee < 0)
      errs.entryFee = "Entry fee cannot be negative.";
    if (prizePool > 0) {
      const sum =
        rewardDistribution.rank1 +
        rewardDistribution.rank2 +
        rewardDistribution.rank3 +
        rewardDistribution.rank4 +
        rewardDistribution.rank5;
      if (sum !== 100)
        errs.rewardDistribution = `Reward distribution must sum to 100% (currently ${sum}%).`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSaveDraft() {
    saveDraft(draft);
    alert("Draft saved.");
  }

  function handleNextStep() {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  }

  function setReward(rank: keyof RewardDraft, value: number) {
    patch({
      rewardDistribution: { ...rewardDistribution, [rank]: Math.max(0, Math.min(100, value)) },
    });
  }

  async function handleCreateEvent() {
    setTxError(null);
    setIsSigning(true);
    try {
      const { eventId, inviteCode: code } = await createEvent({
        title,
        description,
        maxParticipants,
        startTime,
        endTime,
        prizePool,
        rewardDistribution,
        entryFee,
        category,
        bannerUrl,
      });
      setInviteCode(code);
      setCreatedEventId(eventId);
      clearDraft();
      setStep(3);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed. Please try again.");
    } finally {
      setIsSigning(false);
    }
  }

  async function handleCopyCode() {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/creator-events/join?code=${inviteCode}`
      : "";

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                step > s
                  ? "border-amber-400 bg-amber-400 text-slate-950"
                  : step === s
                    ? "border-amber-400 bg-transparent text-amber-400"
                    : "border-white/20 bg-transparent text-slate-500"
              }`}
            >
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
            {idx < 2 && (
              <div
                className={`h-px w-12 ${step > s ? "bg-amber-400" : "bg-white/10"}`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          {step === 1 ? "Event Details" : step === 2 ? "Review & Pay" : "Success"}
        </span>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <h2 className="text-2xl font-semibold text-white">Event Details</h2>

          <div className="space-y-2">
            <label
              htmlFor="event-title"
              className="block text-sm font-medium text-slate-300"
            >
              Event Title
            </label>
            <input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => patch({ title: e.target.value })}
              maxLength={MAX_TITLE}
              placeholder="e.g. Apollo Tournament"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
            <div className="flex justify-between">
              {errors.title && (
                <p className="text-xs text-rose-400">{errors.title}</p>
              )}
              <p className="ml-auto text-xs text-slate-500">
                {title.length}/{MAX_TITLE}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="event-description"
              className="block text-sm font-medium text-slate-300"
            >
              Description{" "}
              <span className="text-slate-500">(markdown supported)</span>
            </label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => patch({ description: e.target.value })}
              maxLength={MAX_DESCRIPTION}
              rows={4}
              placeholder="Describe your event…"
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
            <div className="flex justify-between">
              {errors.description && (
                <p className="text-xs text-rose-400">{errors.description}</p>
              )}
              <p className="ml-auto text-xs text-slate-500">
                {description.length}/{MAX_DESCRIPTION}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="start-time"
                className="block text-sm font-medium text-slate-300"
              >
                Event Starts At
              </label>
              <input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => patch({ startTime: e.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {errors.startTime && (
                <p className="text-xs text-rose-400">{errors.startTime}</p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="end-time"
                className="block text-sm font-medium text-slate-300"
              >
                Event Ends At
              </label>
              <input
                id="end-time"
                type="datetime-local"
                value={endTime}
                onChange={(e) => patch({ endTime: e.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {errors.endTime && (
                <p className="text-xs text-rose-400">{errors.endTime}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="max-participants"
                className="block text-sm font-medium text-slate-300"
              >
                Max Participants
              </label>
              <input
                id="max-participants"
                type="number"
                value={maxParticipants}
                onChange={(e) =>
                  patch({ maxParticipants: parseInt(e.target.value, 10) || MIN_PARTICIPANTS })
                }
                min={MIN_PARTICIPANTS}
                max={MAX_PARTICIPANTS}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {errors.maxParticipants && (
                <p className="text-xs text-rose-400">{errors.maxParticipants}</p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="prize-pool"
                className="block text-sm font-medium text-slate-300"
              >
                Prize Pool
              </label>
              <input
                id="prize-pool"
                type="number"
                value={prizePool}
                onChange={(e) => patch({ prizePool: Math.max(0, parseFloat(e.target.value) || 0) })}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {errors.prizePool && (
                <p className="text-xs text-rose-400">{errors.prizePool}</p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="entry-fee"
                className="block text-sm font-medium text-slate-300"
              >
                Entry Fee
              </label>
              <input
                id="entry-fee"
                type="number"
                value={entryFee}
                onChange={(e) => patch({ entryFee: Math.max(0, parseFloat(e.target.value) || 0) })}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {errors.entryFee && (
                <p className="text-xs text-rose-400">{errors.entryFee}</p>
              )}
            </div>
          </div>

          {prizePool > 0 && (
            <div className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
                Reward Distribution — Top 5
              </p>
              {errors.rewardDistribution && (
                <p className="text-xs text-rose-400">{errors.rewardDistribution}</p>
              )}
              <div className="grid grid-cols-5 gap-3">
                {([
                  { key: "rank1" as const, label: "#1" },
                  { key: "rank2" as const, label: "#2" },
                  { key: "rank3" as const, label: "#3" },
                  { key: "rank4" as const, label: "#4" },
                  { key: "rank5" as const, label: "#5" },
                ]).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-center text-xs text-slate-400">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={rewardDistribution[key]}
                        onChange={(e) => setReward(key, parseInt(e.target.value, 10) || 0)}
                        min={0}
                        max={100}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-center text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="category"
                className="block text-sm font-medium text-slate-300"
              >
                Category
              </label>
              <input
                id="category"
                type="text"
                value={category}
                onChange={(e) => patch({ category: e.target.value })}
                placeholder="e.g. Gaming, Sports, Entertainment"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="banner-url"
                className="block text-sm font-medium text-slate-300"
              >
                Banner URL <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="banner-url"
                type="url"
                value={bannerUrl}
                onChange={(e) => patch({ bannerUrl: e.target.value })}
                placeholder="https://..."
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-slate-300 hover:border-white/30"
              onClick={handleSaveDraft}
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              onClick={handleNextStep}
              className="rounded-full bg-amber-400 px-8 text-slate-950 hover:bg-amber-300"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <h2 className="text-2xl font-semibold text-white">Review & Pay Fee</h2>

          {/* Summary */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Event Summary
            </p>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Title</span>
                <span className="font-medium text-white">{title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Participants</span>
                <span className="font-medium text-white">{maxParticipants}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Starts</span>
                <span className="font-medium text-white">
                  {startTime ? new Date(startTime).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ends</span>
                <span className="font-medium text-white">
                  {endTime ? new Date(endTime).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Prize Pool</span>
                <span className="font-medium text-white">
                  {prizePool > 0 ? `${prizePool} XLM` : "None"}
                </span>
              </div>
              {prizePool > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Reward Split (Top 5)</span>
                  <span className="font-medium text-white">
                    {rewardDistribution.rank1}% / {rewardDistribution.rank2}% / {rewardDistribution.rank3}% / {rewardDistribution.rank4}% / {rewardDistribution.rank5}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Entry Fee</span>
                <span className="font-medium text-white">
                  {entryFee > 0 ? `${entryFee} XLM` : "Free"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category</span>
                <span className="font-medium text-white">{category || "—"}</span>
              </div>
              {bannerUrl && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Banner</span>
                  <span className="max-w-[200px] truncate font-medium text-white">
                    {bannerUrl}
                  </span>
                </div>
              )}
              {description && (
                <div className="pt-1">
                  <span className="text-slate-500">Description</span>
                  <p className="mt-1 line-clamp-2 text-white/80">{description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Fee */}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
              Creation Fee
            </p>
            <p className="mt-2 text-3xl font-semibold text-amber-300">
              {creationFee ? `${creationFee} XLM` : "Loading…"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Charged from your connected wallet: {address ?? "—"}
            </p>
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
              onClick={() => setStep(1)}
              disabled={isSigning}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleCreateEvent}
              disabled={isSigning || !address}
              className="rounded-full bg-amber-400 px-8 text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {isSigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing…
                </>
              ) : (
                "Create Event & Pay Fee"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-6 rounded-3xl border border-emerald-500/20 bg-slate-900/80 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-white">
              Event Created!
            </h2>
            <p className="text-slate-400">
              Share your invite code to let others join.
            </p>
          </div>

          {/* Invite code */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Invite Code
            </p>
            <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-amber-300">
              {inviteCode}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 border-white/10 text-slate-300 hover:border-white/30"
              onClick={handleCopyCode}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Code"}
            </Button>
          </div>

          {/* Share buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={`https://twitter.com/intent/tweet?text=Join+my+prediction+event+on+InsightArena%21+Code%3A+${inviteCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10"
            >
              <Twitter className="h-4 w-4" />
              Share on X
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=Join+my+prediction+event+on+InsightArena%21`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10"
            >
              <Share2 className="h-4 w-4" />
              Share on Telegram
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-white/10 text-slate-300 hover:border-white/30"
              onClick={() =>
                navigator.clipboard.writeText(shareUrl)
              }
            >
              <Copy className="h-4 w-4" />
              Copy Link
            </Button>
          </div>

          <Button
            type="button"
            onClick={() =>
              router.push(`/creator-events/${createdEventId}/matches`)
            }
            className="w-full rounded-full bg-amber-400 py-3 text-slate-950 hover:bg-amber-300"
          >
            Add Matches
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
