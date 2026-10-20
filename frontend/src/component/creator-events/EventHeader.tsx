"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock, Copy, KeyRound, Tag, Users, Zap } from "lucide-react";

import { Badge } from "@/component/ui/badge";
import { Button } from "@/component/ui/button";
import { Progress } from "@/component/ui/progress";
import type { EventStatus } from "@/hooks/useCreatorEvents";
import { cn } from "@/lib/utils";
import { useCountdown, formatCountdown } from "@/hooks/useCountdown";

export interface EventHeaderProps {
  title: string;
  description: string;
  creator: string;
  status: EventStatus;
  participants: number;
  maxParticipants: number;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
  inviteCode?: string;
  category?: string;
  bannerUrl?: string;
  hasWaitlist?: boolean;
  waitlistConfigured?: boolean;
  waitlistHint?: string;
  isJoined?: boolean;
  onJoin?: () => void;
}

const statusClasses: Record<EventStatus, string> = {
  Active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  Completed: "border-slate-500/30 bg-slate-500/10 text-slate-100",
  Cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

export default function EventHeader({
  title,
  description,
  creator,
  status,
  participants,
  maxParticipants,
  createdAt,
  startsAt,
  endsAt,
  inviteCode,
  category,
  bannerUrl,
  hasWaitlist,
  waitlistConfigured,
  waitlistHint,
  isJoined,
  onJoin,
}: EventHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const showBanner = Boolean(bannerUrl) && !bannerError;

  const startCountdown = useCountdown(startsAt || "");
  const lockCountdown = useCountdown(endsAt || createdAt);

  const isFull = maxParticipants > 0 && participants >= maxParticipants;
  const capacityPercentage =
    maxParticipants > 0 ? Math.min(100, Math.round((participants / maxParticipants) * 100)) : 0;
  const isWaitlistActive = Boolean(hasWaitlist || waitlistConfigured);

  const handleCopyCreator = async () => {
    try {
      await navigator.clipboard.writeText(creator);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl shadow-black/30">
      {showBanner && (
        <div className="relative h-48 w-full sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt={`${title} banner`}
            onError={() => setBannerError(true)}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-900/80" />
        </div>
      )}

      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className={cn("rounded-full px-3 py-1 uppercase tracking-[0.18em]", statusClasses[status])}
              >
                {status}
              </Badge>
              {category && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
                  <Tag className="h-3 w-3" />
                  {category}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                  isFull
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : "border-white/10 bg-white/5 text-slate-300",
                )}
                data-testid="capacity-pill"
              >
                <Users className="h-3.5 w-3.5" />
                {participants} / {maxParticipants} {isFull ? "(Full)" : ""}
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                {description}
              </p>
            </div>

            {/* Capacity Meter Progress Bar */}
            <div
              className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              data-testid="capacity-section"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider">Capacity Fill</span>
                <span
                  className={cn("font-medium", isFull ? "text-rose-400" : "text-slate-300")}
                  data-testid="capacity-text"
                >
                  {participants} / {maxParticipants} ({capacityPercentage}%)
                </span>
              </div>
              <Progress
                value={capacityPercentage}
                className="h-2.5 bg-slate-800"
                indicatorClassName={
                  isFull ? "bg-rose-500" : capacityPercentage >= 85 ? "bg-amber-400" : "bg-emerald-500"
                }
                data-testid="capacity-meter"
              />
              {isFull && (
                <div className="mt-2 flex flex-col gap-1 text-xs" data-testid="full-state-notice">
                  <span className="font-semibold text-rose-400" data-testid="full-badge">
                    Event Full — Maximum capacity reached
                  </span>
                  {isWaitlistActive && (
                    <p className="text-amber-300/90 italic" data-testid="waitlist-hint">
                      {waitlistHint || "Waitlist is active. Join the waitlist for updates."}
                    </p>
                  )}
                </div>
              )}
              {!isFull && isWaitlistActive && (
                <p className="mt-1 text-xs text-slate-400" data-testid="waitlist-hint">
                  {waitlistHint || "Waitlist configured for this event."}
                </p>
              )}
            </div>

            {onJoin && !isJoined && (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={onJoin}
                  disabled={isFull}
                  className={cn("rounded-full font-medium", isFull && "opacity-50 cursor-not-allowed")}
                  data-testid="header-join-button"
                >
                  {isFull ? "Event Full" : "Join Event"}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
            {startsAt ? (
              <div
                className={cn(
                  "rounded-2xl border p-4",
                  startCountdown.isExpired
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-200",
                )}
                data-testid="time-to-start"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Time to Start</p>
                <p
                  className={cn(
                    "mt-2 flex items-center gap-2 text-sm font-semibold",
                    startCountdown.isExpired ? "text-emerald-300" : "text-amber-300",
                  )}
                >
                  <Clock className="h-4 w-4" />
                  {formatCountdown(startCountdown, "Event Started")}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Creator</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white">{creator}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  onClick={handleCopyCreator}
                  aria-label="Copy creator address"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Created</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarDays className="h-4 w-4 text-amber-300" />
                {createdAt}
              </p>
            </div>

            {endsAt ? (
              <div
                className={cn(
                  "rounded-2xl p-4",
                  lockCountdown.isExpired ? "border-red-500/30 bg-red-500/10" : "border-white/10 bg-slate-950/80 border",
                )}
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Time Until Lock</p>
                <p
                  className={cn(
                    "mt-2 flex items-center gap-2 text-sm font-semibold",
                    lockCountdown.isExpired ? "text-red-300" : "text-white",
                  )}
                >
                  <Zap className="h-4 w-4" />
                  {formatCountdown(lockCountdown, "Event Locked")}
                </p>
              </div>
            ) : null}

            {inviteCode ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 sm:col-span-2 lg:col-span-1">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Invite code</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-100">
                  <KeyRound className="h-4 w-4" />
                  {inviteCode}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
