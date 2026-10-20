"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
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
