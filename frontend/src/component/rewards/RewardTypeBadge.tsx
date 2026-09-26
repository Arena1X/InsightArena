import { getRewardTypeDisplay, type RewardType } from "@/lib/rewards";

interface RewardTypeBadgeProps {
  type: RewardType;
}

export default function RewardTypeBadge({ type }: RewardTypeBadgeProps) {
  const config = getRewardTypeDisplay(type);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export type { RewardType };
