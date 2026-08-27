"use client";

import { useEffect, useState } from "react";
import DisputeForm from "@/component/markets/DisputeForm";
import DisputeList from "@/component/markets/DisputeList";
import { Button } from "@/component/ui/button";
import { useMarketDisputes } from "@/hooks/useMarketDisputes";

type Props = {
  marketId: string;
  marketTitle: string;
  isResolved: boolean;
};

export default function MarketDisputePanel({
  marketId,
  marketTitle,
  isResolved,
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
            onClick={() => {
              clearStatus();
              setOpenForm(true);
            }}
          >
            Raise dispute
          </Button>
        )}
      </div>

      {openForm && (
        <DisputeForm
          marketId={marketId}
          marketTitle={marketTitle}
          submitting={submitting}
          submitError={submitError}
          submitSuccess={submitSuccess}
          onSubmit={submitDispute}
          onCancel={() => setOpenForm(false)}
        />
      )}

      <DisputeList disputes={disputes} loading={loading} error={error} />
    </section>
  );
}
