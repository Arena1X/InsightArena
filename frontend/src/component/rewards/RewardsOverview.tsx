import StatCard, { StatCardProps } from "./StatCard";

// Icons
function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

const DEFAULT_STATS: StatCardProps[] = [
  {
    label: "Total Earned",
    value: "$12,450",
    supportingText: "+$2,340 this month",
    icon: <DollarIcon />,
    valueColor: "text-white",
  },
  {
    label: "Claimable Rewards",
    value: "$840",
    supportingText: "Ready to claim",
    icon: <GiftIcon />,
    valueColor: "text-[#4FD1C5]",
  },
  {
    label: "Claimed Rewards",
    value: "$9,750",
    supportingText: "Last claim 3 days ago",
    icon: <CheckCircleIcon />,
    valueColor: "text-white",
  },
  {
    label: "Pending Payouts",
    value: "$1,860",
    supportingText: "Settles in 2-5 days",
    icon: <ClockIcon />,
    valueColor: "text-white",
  },
];

interface RewardsOverviewProps {
  stats?: StatCardProps[];
  onClaim?: () => void;
  claimLoading?: boolean;
  claimDisabled?: boolean;
}

export default function RewardsOverview({
  stats = DEFAULT_STATS,
  onClaim,
  claimLoading = false,
  claimDisabled = false,
}: RewardsOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Rewards</h1>
          <p className="text-gray-400 text-sm mt-1">
            Track your earnings, claim rewards, and review payout history.
          </p>
        </div>
        <button
          onClick={onClaim}
          disabled={claimDisabled || claimLoading}
          className="flex-shrink-0 px-5 py-2 rounded-lg bg-[#4FD1C5] text-black text-sm font-semibold
            hover:bg-[#38b2ac] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {claimLoading ? "Claiming..." : "Claim Rewards"}
        </button>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <StatCard
            key={i}
            label={stat.label}
            value={stat.value}
            supportingText={stat.supportingText}
            icon={stat.icon}
            valueColor={stat.valueColor}
          />
        ))}
      </div>
    </div>
  );
}
