type RewardType =
  | "competition"
  | "prediction"
  | "referral"
  | "airdrop"
  | "bonus";

const typeConfig: Record<RewardType, { label: string; className: string }> = {
  competition: {
    label: "Competition",
    className: "bg-white/5 text-gray-300 border border-white/10",
  },
  prediction: {
    label: "Prediction",
    className: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  },
  referral: {
    label: "Referral",
    className: "bg-white/5 text-gray-300 border border-white/10",
  },
  airdrop: {
    label: "Airdrop",
    className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  },
  bonus: {
    label: "Bonus",
    className: "bg-white/5 text-gray-300 border border-white/10",
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
