"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import DisputeForm from "@/component/markets/DisputeForm";
import DisputeList from "@/component/markets/DisputeList";
import { Button } from "@/component/ui/button";
import { useCountdown, formatCountdown } from "@/hooks/useCountdown";
import { useMarketDisputes } from "@/hooks/useMarketDisputes";

type Props = {
  marketId: string;
  marketTitle: string;
  isResolved: boolean;
  /** ISO timestamp the market was resolved at; drives the dispute-window countdown. */
  resolvedAt: string | null;
};

/** Disputes must be filed within this many days of the market resolving,
 * mirroring `backend/src/disputes/disputes.service.ts`'s 7-day window. */
const DISPUTE_WINDOW_DAYS = 7;

export default function MarketDisputePanel({
  marketId,
  marketTitle,
  isResolved,
  resolvedAt,
}: Props) {
  const {
    disputes,
    loading,
    error,
    submitting,
    submitError,
    submitSuccess,
    refresh,
    submitDispute,
    clearStatus,
  } = useMarketDisputes();
  const [openForm, setOpenForm] = useState(false);

  useEffect(() => {
    void refresh(marketId);
  }, [marketId, refresh]);

  const disputeWindowCloseAt = useMemo(() => {
    if (!resolvedAt) return null;
    const resolvedTime = new Date(resolvedAt).getTime();
    if (Number.isNaN(resolvedTime)) return null;
    return resolvedTime + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }, [resolvedAt]);

  const countdown = useCountdown(disputeWindowCloseAt ?? 0, !disputeWindowCloseAt);
  const disputeWindowClosed = disputeWindowCloseAt !== null && countdown.isExpired;

  if (!isResolved) {
    return null;
  }

  return (
    <section className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Disputes</h4>
          <p className="text-xs text-gray-400">
            Contest this resolved market if the outcome looks wrong.
          </p>
        </div>
        {!openForm && (
          <Button
            type="button"
            size="sm"
            className="bg-orange-500 text-white hover:bg-orange-400"
            disabled={disputeWindowClosed}
            onClick={() => {
              clearStatus();
              setOpenForm(true);
            }}
          >
            Raise dispute
          </Button>
        )}
      </div>

      {disputeWindowCloseAt !== null && (
        <div
          className="flex items-center gap-2 text-xs text-gray-400"
          data-testid="dispute-window-countdown"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {disputeWindowClosed ? (
            <span>Dispute window closed</span>
          ) : (
            <span>
              Dispute window closes in{" "}
              {formatCountdown(countdown, "Dispute window closed")}
            </span>
          )}
        </div>
      )}

      {openForm && (
        <DisputeForm
          marketId={marketId}
          marketTitle={marketTitle}
          submitting={submitting}
          submitError={submitError}
          submitSuccess={submitSuccess}
          disputeWindowClosed={disputeWindowClosed}
          onSubmit={submitDispute}
          onCancel={() => setOpenForm(false)}
        />
      )}

      <DisputeList disputes={disputes} loading={loading} error={error} />
    </section>
  );
}
