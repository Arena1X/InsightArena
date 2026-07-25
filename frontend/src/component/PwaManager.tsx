"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { registerServiceWorker } from "@/lib/registerServiceWorker";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_STORAGE_KEY = "insightarena.installPromptDismissed";

export function PwaManager() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

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
      setVisible(true);
    };
    const handleAppInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Best-effort only.
    }
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome !== "accepted") dismiss();
    setVisible(false);
    setInstallEvent(null);
  };

  if (!visible || !installEvent) return null;

  return (
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
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-md p-1 text-[#9aa4bc] transition hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
