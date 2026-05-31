"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Trophy,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Copy,
  Check,
  ArrowRight,
  Swords,
  Clock,
} from "lucide-react";
import { FaTwitter, FaTelegram, FaWhatsapp } from "react-icons/fa";

import { Button } from "@/component/ui/button";
import { cn } from "@/lib/utils";
import { useWallet } from "@/context/WalletContext";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type {
  CreatorEvent,
  CreatorEventMatch,
  EventStatus,
  MatchOutcome,
} from "@/context/CreatorEventsContext";

const STATUS_STYLES: Record<EventStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  Completed: "bg-slate-700/60 text-slate-100 border-slate-500/20",
  Cancelled: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

const STATUS_ICONS: Record<EventStatus, typeof ShieldCheck> = {
  Active: ShieldCheck,
  Completed: CheckCircle,
  Cancelled: XCircle,
};

const OUTCOME_LABEL: Record<MatchOutcome, string> = {
  TeamA: "Home Win",
  TeamB: "Away Win",
  Draw: "Draw",
  Pending: "Upcoming",
};

const OUTCOME_STYLES: Record<MatchOutcome, string> = {
  TeamA: "text-emerald-300",
  TeamB: "text-amber-300",
  Draw: "text-sky-300",
  Pending: "text-slate-400",
};

function QRCodeDisplay() {
  const pattern = [
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,1,0,1,0,1,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,0,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,1,0,0,1,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,0,1,0,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,1,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0],
    [1,0,1,0,0,1,1,0,0,1,1,0,1,1,1,0,1,0,1,0,1],
    [0,1,0,1,1,0,0,1,0,0,0,1,0,0,0,1,0,1,0,1,0],
    [1,0,0,0,1,0,1,0,1,1,0,0,1,0,1,0,0,0,1,0,1],
    [0,1,1,0,0,1,0,0,0,1,1,1,0,1,0,0,1,1,0,1,0],
    [1,0,0,1,0,0,1,1,0,0,0,0,1,0,1,1,0,0,0,0,1],
    [0,0,0,0,0,0,0,0,1,0,1,0,0,1,0,1,1,0,1,0,0],
    [1,1,1,1,1,1,1,0,0,1,0,1,1,0,0,0,0,1,0,1,1],
    [1,0,0,0,0,0,1,0,1,0,1,0,0,1,1,0,1,0,1,0,0],
    [1,0,1,1,1,0,1,0,0,1,0,1,1,0,0,1,0,1,0,1,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,0,1,1,0,1,0,1,0,0],
    [1,0,1,1,1,0,1,0,0,1,0,1,0,0,0,1,0,1,0,1,1],
    [1,0,0,0,0,0,1,0,1,0,1,0,1,1,0,0,1,0,1,0,0],
    [1,1,1,1,1,1,1,0,0,1,0,1,0,0,1,1,0,1,0,1,1],
  ];

  const CELL = 8;
  const SIZE = 21;
  const totalPx = SIZE * CELL;

  return (
    <svg
      width={totalPx}
      height={totalPx}
      viewBox={`0 0 ${totalPx} ${totalPx}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="QR code for invite link"
    >
      <rect width="100%" height="100%" fill="white" />
      {pattern.flatMap((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              fill="#000"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

function MatchPreviewRow({ match }: { match: CreatorEventMatch }) {
  const date = new Date(match.matchTime);
  const isUpcoming = match.outcome === "Pending";

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Swords className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate text-sm font-medium text-white">
          {match.teamA} vs {match.teamB}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-slate-400">
          <Clock className="h-3 w-3" />
          {date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide",
            OUTCOME_STYLES[match.outcome],
          )}
        >
          {OUTCOME_LABEL[match.outcome]}
        </span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 px-4 py-12">
      <div className="h-8 w-48 rounded-full bg-white/10" />
      <div className="h-12 w-3/4 rounded-2xl bg-white/10" />
      <div className="h-4 w-full rounded-full bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-white/10" />
        ))}
      </div>
    </div>
  );
}

interface InvitePreviewProps {
  code: string;
}

export default function InvitePreview({ code }: InvitePreviewProps) {
  const router = useRouter();
  const { address, openConnectModal } = useWallet();
  const { getEventByCode, getEventMatches, joinEvent, eventCache } =
    useCreatorEvents();

  const [event, setEvent] = useState<CreatorEvent | null>(null);
  const [matches, setMatches] = useState<CreatorEventMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const found = await getEventByCode(code);
        if (!found) {
          setFetchError("not_found");
          return;
        }
        setEvent(found);
        const eventMatches = await getEventMatches(found.id);
        setMatches(eventMatches);
      } catch {
        setFetchError("error");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [code, getEventByCode, getEventMatches]);

  // Keep event in sync with cache (e.g., after joinEvent updates participants)
  useEffect(() => {
    if (event && eventCache[event.id]) {
      setEvent(eventCache[event.id]);
    }
  }, [eventCache, event?.id]);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${code}`
      : `/invite/${code}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied */
    }
  }, [inviteUrl]);

  const handleJoin = useCallback(async () => {
    if (!event) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const ok = await joinEvent(code);
      if (!ok) {
        setJoinError("Failed to join event. Please try again.");
      }
    } finally {
      setIsJoining(false);
    }
  }, [event, code, joinEvent]);

  const handleViewEvent = useCallback(() => {
    if (event) router.push(`/creator-events`);
  }, [event, router]);

  const shareText = event
    ? `Join me in "${event.title}" — a prediction event on InsightArena!`
    : "Join this prediction event on InsightArena!";

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(inviteUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${inviteUrl}`)}`;

  if (isLoading) return <LoadingSkeleton />;

  if (fetchError === "not_found") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="rounded-full border border-rose-500/20 bg-rose-500/10 p-4">
          <XCircle className="h-10 w-10 text-rose-400" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-white">
          Invite Not Found
        </h1>
        <p className="mt-3 max-w-sm text-slate-400">
          The invite link <span className="font-mono text-slate-300">{code}</span> is
          invalid or has expired.
        </p>
        <Button
          variant="outline"
          className="mt-8 border-white/10 text-white hover:border-white/30"
          onClick={() => router.push("/")}
        >
          Back to Home
        </Button>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-slate-400">
          Something went wrong loading this invite. Please try again.
        </p>
        <Button
          variant="outline"
          className="mt-6 border-white/10 text-white"
          onClick={() => router.push("/")}
        >
          Back to Home
        </Button>
      </div>
    );
  }

  if (!event) return null;

  const isFull =
    event.status === "Active" && event.participants >= event.maxParticipants;
  const isCancelled = event.status === "Cancelled";
  const isAlreadyJoined = event.joined ?? false;

  const StatusIcon = STATUS_ICONS[event.status];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        {/* Hero */}
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                STATUS_STYLES[event.status],
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {event.status}
            </span>
            {isFull && (
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-300">
                <Users className="h-3.5 w-3.5" />
                Event Full
              </span>
            )}
            {isAlreadyJoined && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                <CheckCircle className="h-3.5 w-3.5" />
                Joined
              </span>
            )}
          </div>

          <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
            {event.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            {event.description}
          </p>

          {/* Stats grid */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Creator
              </p>
              <p className="mt-2 truncate font-mono text-sm font-semibold text-white">
                {event.creator}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Matches
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {event.matchesCount}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Participants
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {event.participants}
                <span className="text-sm text-slate-400">
                  /{event.maxParticipants}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Ends
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {event.endsAt
                  ? new Date(event.endsAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>

          {/* Cancelled / Full banners */}
          {isCancelled && (
            <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-center">
              <p className="font-semibold text-rose-300">
                This event has been cancelled.
              </p>
            </div>
          )}
          {isFull && !isCancelled && (
            <div className="mt-6 rounded-2xl border border-orange-500/20 bg-orange-500/10 px-5 py-4 text-center">
              <p className="font-semibold text-orange-300">
                This event is full — no more spots available.
              </p>
            </div>
          )}

          {/* CTA */}
          {!isCancelled && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {!address ? (
                <Button
                  size="lg"
                  className="w-full rounded-full sm:w-auto"
                  onClick={openConnectModal}
                >
                  Connect Wallet to Join
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : isAlreadyJoined ? (
                <Button
                  size="lg"
                  className="w-full rounded-full sm:w-auto"
                  onClick={handleViewEvent}
                >
                  <Trophy className="h-4 w-4" />
                  View Event
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full rounded-full sm:w-auto"
                  disabled={isFull || isJoining}
                  onClick={handleJoin}
                >
                  {isJoining ? "Joining…" : "Join Event"}
                  {!isJoining && <ArrowRight className="h-4 w-4" />}
                </Button>
              )}
            </div>
          )}
          {joinError && (
            <p className="mt-3 text-sm text-rose-400">{joinError}</p>
          )}
        </div>

        {/* Match preview */}
        {matches.length > 0 && (
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-xl shadow-black/20">
            <h2 className="mb-5 text-lg font-semibold text-white">
              Match Preview
            </h2>
            <div className="space-y-3">
              {matches.slice(0, 5).map((m) => (
                <MatchPreviewRow key={m.id} match={m} />
              ))}
            </div>
            {matches.length > 5 && (
              <p className="mt-4 text-sm text-slate-400">
                +{matches.length - 5} more matches
              </p>
            )}
          </div>
        )}

        {/* Share section */}
        <div className="mt-8 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-xl shadow-black/20">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Share This Event
          </h2>
          <p className="mb-6 text-sm text-slate-400">
            Spread the word and invite others to join.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-sky-300"
            >
              <FaTwitter className="h-4 w-4" />
              Twitter
            </a>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
            >
              <FaTelegram className="h-4 w-4" />
              Telegram
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <FaWhatsapp className="h-4 w-4" />
              WhatsApp
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>

          {/* QR Code */}
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-2xl border border-white/10 bg-white p-3 shadow-lg">
              <QRCodeDisplay />
            </div>
            <div className="flex flex-col justify-center gap-2 text-center sm:text-left">
              <p className="text-sm font-medium text-white">
                Scan to join on mobile
              </p>
              <p className="max-w-xs break-all font-mono text-xs text-slate-400">
                {inviteUrl}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
