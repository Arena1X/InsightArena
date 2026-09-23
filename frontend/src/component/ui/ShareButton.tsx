"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Share2, Twitter } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ShareButtonProps {
  /** Page title used in the share text. */
  title: string;
  /** Short description or question for the market or profile. */
  description: string;
  /** Canonical URL for this page. Defaults to window.location.href. */
  url?: string;
  className?: string;
  ariaLabel?: string;
}

function buildTwitterUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text: `${text} ${url}` });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/**
 * Share buttons for a market or profile page.
 *
 * Provides: Twitter/X intent link, native Web Share API (mobile), and a
 * copy-link fallback. Designed to be dropped anywhere on a detail page.
 */
export function ShareButton({ title, description, url, className, ariaLabel }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const resolvedUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
  const shareText = `${title} — ${description}`;

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text: description, url: resolvedUrl });
    } catch {
      // user cancelled or API unavailable — fall through
    }
  }, [title, description, resolvedUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(resolvedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [resolvedUrl]);

  const hasNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={ariaLabel || "Share market"}>
      {/* Twitter / X */}
      <a
        href={buildTwitterUrl(shareText, resolvedUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Share on X / Twitter"
      >
        <Twitter className="h-3.5 w-3.5" />
        <span>Share</span>
      </a>

      {/* Native share (mobile) */}
      {hasNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Share via native share sheet"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>More</span>
        </button>
      )}

      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={copied ? "Link copied" : "Copy link to market"}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span>{copied ? "Copied!" : "Copy link"}</span>
      </button>
    </div>
  );
}
