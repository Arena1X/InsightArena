import type { ConnectionStatus } from "@/hooks/useLiveOdds";

interface LiveOddsBadgeProps {
  status: ConnectionStatus;
  stale: boolean;
}

const statusConfig: Record<
  ConnectionStatus,
  { label: string; className: string }
> = {
  disconnected: {
    label: "Reconnecting…",
    className: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  },
  polling: {
    label: "Stale",
    className: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  },
  connecting: {
    label: "Connecting…",
    className: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  },
  connected: {
    label: "Live",
    className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  },
};

/**
 * A small badge that indicates the live-odds feed status.
 *
 * - **disconnected** → amber "Reconnecting…" (socket dropped, retry scheduled)
 * - **polling** → rose "Stale" (socket unavailable, falling back to HTTP)
 * - **connecting** → blue "Connecting…" (initial handshake)
 * - **connected** → not shown when fresh (only visible when stale timer has fired)
 *
 * When `connected` the badge is hidden unless `stale` is true (data older than
 * `STALE_AFTER_MS`), in which case it shows "Stale".
 */
export default function LiveOddsBadge({ status, stale }: LiveOddsBadgeProps) {
  if (status === "connected" && !stale) return null;

  const displayStatus: ConnectionStatus =
    status === "connected" && stale ? "polling" : status;

  const config = statusConfig[displayStatus];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}