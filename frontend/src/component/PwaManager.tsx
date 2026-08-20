"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Play, Trash2, WifiOff, X } from "lucide-react";

import { registerServiceWorker } from "@/lib/registerServiceWorker";
import {
  dispatchOfflineAction,
  hasOfflineActionHandler,
  subscribeOfflineActions,
} from "@/lib/offlineActionQueue";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useToast } from "@/hooks/useToast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_STORAGE_KEY = "insightarena.installPromptDismissed";

/**
 * Dispatches a queued action to the handler registered for its type.
 * If no handler exists, the action is resolved successfully (cleared).
 */
async function processQueuedAction(action: { type: string; payload: unknown }) {
  const handled = await dispatchOfflineAction(action as any);
  if (!handled) {
    console.info(
      "[OfflineQueue] No handler registered for " + action.type + "; discarding.",
    );
  }
}

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-[300] flex items-center justify-center gap-3 bg-[#e2a53a] px-4 py-2 text-sm font-medium text-[#0a0f1a] shadow-lg"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        You are offline — showing cached data. Any actions you take will be
        queued and replayed once the connection is restored.
      </span>
    </div>
  );
}

function ReplayQueueDialog({
  open,
  pendingCount,
  isReplaying,
  onReplay,
  onDiscard,
}: {
  open: boolean;
  pendingCount: number;
  isReplaying: boolean;
  onReplay: () => void;
  onDiscard: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Replay queued actions"
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111726] p-6 shadow-2xl">
        <div className="mb-2 flex items-center gap-3">
          <WifiOff className="h-6 w-6 text-[#4FD1C5]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-white">Connection restored</h2>
        </div>
        <p className="mb-6 text-sm text-[#9aa4bc]">
          {pendingCount} action{pendingCount !== 1 ? "s" : ""} {"was"}{" "}
          queued while you were offline. Would you like to replay{" "}
          {pendingCount === 1 ? "it" : "them"} now?
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            disabled={isReplaying}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-[#9aa4bc] transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            onClick={onReplay}
            disabled={isReplaying}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#4FD1C5] px-4 py-2 text-sm font-semibold text-[#0a0f1a] transition hover:bg-[#43bfb4] disabled:opacity-50"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {isReplaying ? "Replaying…" : `Replay ${pendingCount} action${pendingCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PwaManager() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installVisible, setInstallVisible] = useState(false);
  const toast = useToast();
  const hasRegistered = useRef(false);

  // ------- Offline queue ----------
  const {
    queue,
    replayPending,
    isReplaying,
    enqueue,
    replay,
    dismiss,
  } = useOfflineQueue({
    processAction: processQueuedAction,
  });

  // Subscribe to the offline action bus so any component can queue actions.
  useEffect(() => {
    const unsub = subscribeOfflineActions((entry) => {
      enqueue(entry.type, entry.payload);
    });
    return unsub;
  }, [enqueue]);

  // Show toast summary after replay completes.
  const handleReplay = async () => {
    const results = await replay();
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    if (failCount === 0) {
      toast.success(`${okCount} queued action${okCount !== 1 ? "s" : ""} replayed successfully.`);
    } else {
      const msg = `${okCount} replayed, ${failCount} failed and will be retried.`;
      toast.error(msg, { duration: 8000 });
    }
  };

  // ------- Service worker registration ----------
  useEffect(() => {
    if (hasRegistered.current) return;
    hasRegistered.current = true;
    registerServiceWorker();
  }, []);

  // ------- Install prompt ----------
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    try {
      if (window.localStorage.getItem(DISMISS_STORAGE_KEY)) return;
    } catch {
      // Storage unavailable — fall through and allow the prompt.
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setInstallVisible(true);
    };
    const handleAppInstalled = () => {
      setInstallVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismissPrompt = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Best-effort only.
    }
    setInstallVisible(false);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome !== "accepted") dismissPrompt();
    setInstallVisible(false);
    setInstallEvent(null);
  };

  return (
    <>
      {/* Offline banner — sticky top, shows when the browser is offline */}
      <OfflineBanner />

      {/* Replay queue dialog — appears on reconnect with queued actions */}
      <ReplayQueueDialog
        open={replayPending}
        pendingCount={queue.length}
        isReplaying={isReplaying}
        onReplay={handleReplay}
        onDiscard={dismiss}
      />

      {/* Install prompt */}
      {installVisible && installEvent && (
        <div
          role="region"
          aria-label="Install InsightArena"
          className="fixed inset-x-4 bottom-4 z-[200] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-[#111726] p-4 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          <Download className="h-5 w-5 shrink-0 text-[#4FD1C5]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Install InsightArena</p>
            <p className="text-xs text-[#9aa4bc]">
              Add to your home screen for quick, offline-ready access.
            </p>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-lg bg-[#4FD1C5] px-3 py-2 text-xs font-semibold text-[#0a0f1a] transition hover:bg-[#43bfb4]"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss install prompt"
            className="shrink-0 rounded-md p-1 text-[#9aa4bc] transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}