"use client";

import { WifiOff } from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

export default function OfflinePage() {
  const { queue, discardAction } = useOfflineQueue();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#141824] px-6 text-center text-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
        <WifiOff className="h-8 w-8 text-[#4FD1C5]" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-sm text-sm text-[#9aa4bc]">
          This page hasn&apos;t been saved for offline use. Check your connection and try
          again — pages you&apos;ve already visited will still work offline.
        </p>
      </div>
      {queue.length > 0 && (
        <section aria-labelledby="queued-actions-heading" className="w-full max-w-sm space-y-3 text-left">
          <h2 id="queued-actions-heading" className="text-sm font-semibold">
            Queued actions
          </h2>
          <ul className="space-y-2">
            {queue.map((action) => (
              <li
                key={action.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm capitalize">
                    {action.type}
                    {typeof action.payload.marketId === "string" && ` · ${action.payload.marketId}`}
                  </p>
                  <p className="text-xs text-[#9aa4bc]">
                    {action.retries > 0 ? `Failed ${action.retries}× — will retry` : "Waiting to send"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => discardAction(action.id)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#4FD1C5] transition hover:bg-white/10"
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-[#4FD1C5] px-6 py-3 text-sm font-semibold text-[#0a0f1a] transition hover:bg-[#43bfb4]"
      >
        Try Again
      </button>
    </div>
  );
}
