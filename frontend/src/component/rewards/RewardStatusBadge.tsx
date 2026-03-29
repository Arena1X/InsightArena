type RewardStatus = "claimed" | "pending" | "processing";

const statusConfig: Record<
  RewardStatus,
  { label: string; className: string }
> = {
  claimed: {
    label: "Claimed",
    className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  },
  pending: {
    label: "Pending",
    className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  },
};

interface RewardStatusBadgeProps {
  status: RewardStatus;
}

export default function RewardStatusBadge({ status }: RewardStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}

export type { RewardStatus };
