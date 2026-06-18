"use client";

import { useState } from "react";
import { CalendarDays, Check, Copy, KeyRound, Tag, Users } from "lucide-react";

import { Badge } from "@/component/ui/badge";
import { Button } from "@/component/ui/button";
import type { EventStatus } from "@/hooks/useCreatorEvents";
import { cn } from "@/lib/utils";

interface EventHeaderProps {
  title: string;
  description: string;
  creator: string;
  status: EventStatus;
  participants: number;
  maxParticipants: number;
  createdAt: string;
  inviteCode?: string;
  category?: string;
  bannerUrl?: string;
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
  inviteCode,
  category,
  bannerUrl,
}: EventHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const showBanner = Boolean(bannerUrl) && !bannerError;

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
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Users className="h-3.5 w-3.5" />
                {participants} / {maxParticipants}
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                {description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
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
