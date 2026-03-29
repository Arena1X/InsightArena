type RewardType = "competition" | "prediction" | "referral" | "airdrop" | "bonus";

const typeConfig: Record<RewardType, { label: string; className: string }> = {
  competition: {
    label: "Competition",
    className: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
  },
  prediction: {
    label: "Prediction",
    className: "bg-[#4FD1C5]/15 text-[#4FD1C5] border border-[#4FD1C5]/30",
  },
  referral: {
    label: "Referral",
    className: "bg-pink-500/15 text-pink-400 border border-pink-500/30",
  },
  airdrop: {
    label: "Airdrop",
    className: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  },
  bonus: {
    label: "Bonus",
    className: "bg-[#F5C451]/15 text-[#F5C451] border border-[#F5C451]/30",
  },
};

interface RewardTypeBadgeProps {
  type: RewardType;
}

export default function RewardTypeBadge({ type }: RewardTypeBadgeProps) {
  const config = typeConfig[type];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export type { RewardType };
