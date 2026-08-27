"use client";

import { Button } from "@/component/ui/button";
import { EmptyState } from "@/component/ui/empty-state";
import type { PendingResolution } from "@/hooks/useOracleDashboard";
import { Clock, Inbox } from "lucide-react";

type Props = {
  markets: PendingResolution[];
  onSelect: (market: PendingResolution) => void;
};

export default function PendingResolutionsList({ markets, onSelect }: Props) {
  if (markets.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={28} />}
        title="No pending resolutions"
        description="Markets awaiting oracle resolution will appear here."
        variant="empty"
      />
    );
  }

  return (
    <div className="space-y-3">
      {markets.map((market) => (
        <div
          key={market.marketId}
          className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">{market.title}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="rounded-full bg-white/5 px-2 py-1">{market.category}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Closed {new Date(market.closedAt).toLocaleString()}
              </span>
              <span>{market.participantCount} participants</span>
            </div>
          </div>
          <Button
            type="button"
            className="rounded-full bg-amber-400 px-5 text-sm text-slate-950 hover:bg-amber-300"
            onClick={() => onSelect(market)}
          >
            Submit resolution
          </Button>
        </div>
      ))}
    </div>
  );
}
