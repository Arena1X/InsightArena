"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Share2, Twitter } from "lucide-react";

import { env } from "@/lib/env";
import {
  buildShareUrl,
  cn,
  getShareText,
  type ShareChannel,
  type ShareEntityType,
} from "@/lib/utils";

export interface ShareButtonProps {
  /** Name of the market, event, or profile being shared. */
  title: string;
  /** Kind of page being shared; selects the share text. Defaults to "market". */
  entity?: ShareEntityType;
  /** Overrides the per-entity share text. */
  description?: string;
  /** Canonical URL (absolute or path) for this page. Defaults to window.location.href. */
  url?: string;
  className?: string;
  ariaLabel?: string;
}

type CopyStatus = "idle" | "copied" | "error";

function buildTwitterUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text: `${text} ${url}` });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Share controls for a market, event, or profile page.
 *
 * Share links carry UTM attribution for the channel used. The primary action
 * opens the native Web Share sheet when available and otherwise copies the
 * link to the clipboard, with visible feedback either way.
 */
export function ShareButton({
  title,
  entity = "market",
  description,
  url,
  className,
  ariaLabel,
}: ShareButtonProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detected after mount so server and client markup match on hydration.
  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const shareText = description ?? getShareText(entity, title);

  const getShareUrl = useCallback(
    (channel: ShareChannel) => {
      const origin = env.APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
      const base = url ?? (typeof window !== "undefined" ? window.location.href : "");
      return buildShareUrl(base, { entity, channel, origin });
    },
    [entity, url],
  );

  const showCopyStatus = useCallback((status: CopyStatus) => {
    setCopyStatus(status);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyStatus("idle"), 2000);
  }, []);

  const copyLink = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(getShareUrl("copy"));
      showCopyStatus("copied");
    } catch {
      showCopyStatus("error");
    }
  }, [getShareUrl, showCopyStatus]);

  const handleShare = useCallback(async () => {
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title, text: shareText, url: getShareUrl("native") });
    } catch (error) {
      // The user dismissing the sheet is not a failure; anything else falls back.
      if (!isAbortError(error)) await copyLink();
    }
  }, [copyLink, getShareUrl, shareText, title]);

  const buttonClassName =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const actionLabel =
    copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Copy failed" : hasNativeShare ? "Share" : "Copy link";

  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={ariaLabel || `Share ${entity}`}>
      {/* Twitter / X */}
      <a
        href={buildTwitterUrl(shareText, getShareUrl("twitter"))}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClassName}
        aria-label="Share on X / Twitter"
      >
        <Twitter className="h-3.5 w-3.5" />
        <span>Post</span>
      </a>

      {/* Native share sheet, or copy-to-clipboard where unsupported */}
      <button
        type="button"
        onClick={handleShare}
        className={buttonClassName}
        aria-label={hasNativeShare ? `Share ${entity}` : `Copy link to ${entity}`}
      >
        {copyStatus === "copied" ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : hasNativeShare ? (
          <Share2 className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span>{actionLabel}</span>
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {copyStatus === "copied" ? "Link copied to clipboard" : copyStatus === "error" ? "Could not copy link" : ""}
      </span>
    </div>
  );
}
