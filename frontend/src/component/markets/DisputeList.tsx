"use client";

import { EmptyState } from "@/component/ui/empty-state";
import { Skeleton } from "@/component/ui/skeleton";
import type { MarketDispute } from "@/hooks/useMarketDisputes";
import { Inbox } from "lucide-react";

type Props = {
  disputes: MarketDispute[];
  loading?: boolean;
  error?: string | null;
};

const STATUS_STYLES: Record<MarketDispute["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  under_review: "bg-sky-500/15 text-sky-300",
  resolved: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
};

export default function DisputeList({ disputes, loading, error }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-xl bg-white/10" />
        <Skeleton className="h-20 rounded-xl bg-white/10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (disputes.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={24} />}
        title="No disputes yet"
        description="Existing disputes for this market will appear here with their current status."
        variant="empty"
      />
    );
  }

  return (
    <div className="space-y-3">
      {disputes.map((dispute) => (
        <article
          key={dispute.id}
          className="rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white">{dispute.reason}</p>
              <p className="mt-2 text-xs text-gray-500">
                Filed {new Date(dispute.createdAt).toLocaleString()}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[dispute.status]}`}
            >
              {dispute.status.replace("_", " ")}
            </span>
          </div>
          {dispute.evidenceUrls.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-orange-300">
              {dispute.evidenceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
