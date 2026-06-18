"use client";

import { useState } from "react";
import { ArrowRight, Calendar, Users, XCircle, CheckCircle, ShieldCheck, Tag } from "lucide-react";
import { Button } from "@/component/ui/button";
import { cn } from "@/lib/utils";

export type CreatorEventStatus = "Active" | "Completed" | "Cancelled";

export interface CreatorEventCardProps {
  title: string;
  description: string;
  creator: string;
  matchesCount: number;
  participants: number;
  maxParticipants: number;
  status: CreatorEventStatus;
  endsAt: string;
  joined?: boolean;
  category?: string;
  bannerUrl?: string;
  onViewDetails?: () => void;
}

const statusColors: Record<CreatorEventStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  Completed: "bg-slate-700/60 text-slate-100 border-slate-500/20",
  Cancelled: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

const statusIcons: Record<CreatorEventStatus, typeof ShieldCheck> = {
  Active: ShieldCheck,
  Completed: CheckCircle,
  Cancelled: XCircle,
};

export default function EventCard({
  title,
  description,
  creator,
  matchesCount,
  participants,
  maxParticipants,
  status,
  endsAt,
  joined,
  category,
  bannerUrl,
  onViewDetails,
}: CreatorEventCardProps) {
  const StatusIcon = statusIcons[status];
  const [bannerError, setBannerError] = useState(false);
  const showBanner = Boolean(bannerUrl) && !bannerError;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-xl shadow-black/20 transition hover:border-white/20 hover:shadow-white/5">
      {showBanner && (
        <div className="relative h-36 w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt={`${title} banner`}
            onError={() => setBannerError(true)}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/70" />
        </div>
      )}

      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide", statusColors[status])}>
                <StatusIcon className="h-3.5 w-3.5" />
                {status}
              </span>
              {category && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
                  <Tag className="h-3 w-3" />
                  {category}
                </span>
              )}
              {joined ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  <Users className="h-3.5 w-3.5" />
                  Joined
                </span>
              ) : null}
            </div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-sm leading-6 text-slate-400">{description}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Creator</p>
            <p className="mt-2 text-sm font-semibold text-white">{creator}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ends</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Calendar className="h-4 w-4 text-slate-400" />
              {endsAt}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Matches</p>
            <p className="mt-2 text-lg font-semibold text-white">{matchesCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Participants</p>
            <p className="mt-2 text-lg font-semibold text-white">{participants}/{maxParticipants}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            className="min-w-[150px] border-white/10 text-white hover:border-white hover:bg-white/5"
            onClick={onViewDetails}
          >
            View Details
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
