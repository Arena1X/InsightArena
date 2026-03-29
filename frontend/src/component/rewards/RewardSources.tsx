import RewardSourceRow, { RewardSourceRowProps } from "./RewardSourceRow";

// Trophy icon — Market Wins (teal)
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[#4FD1C5]" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12M6 3a4 4 0 004 4h4a4 4 0 004-4M6 3H4a1 1 0 00-1 1v2a4 4 0 004 4m10-7h2a1 1 0 011 1v2a4 4 0 01-4 4m-6 0v4m0 0H9m3 0h3" />
    </svg>
  );
}

// Medal icon — Competition Placements (yellow)
function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[#F5C451]" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="14" r="5" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 4.5l-2 4.5M15.5 4.5l2 4.5M9 4.5h6" />
    </svg>
  );
}

// Sparkle icon — Bonus Pools (purple)
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-purple-400" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M3 12h2m14 0h2m-4.22-6.78l-1.42 1.42M6.64 17.36l-1.42 1.42m12.14 0l-1.42-1.42M6.64 6.64L5.22 5.22M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

// Flame icon — Streak Rewards (red/orange)
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-orange-400" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-2-1-3.5-1-5 0 0-1 1.5-1 3a2 2 0 01-4 0c0-3 3-5 2-8z" />
    </svg>
  );
}

const DEFAULT_SOURCES: RewardSourceRowProps[] = [
  {
    icon: <TrophyIcon />,
    label: "Market Wins",
    amount: "$4,250",
    percentage: 41,
    barColor: "bg-[#4FD1C5]",
  },
  {
    icon: <MedalIcon />,
    label: "Competition Placements",
    amount: "$3,200",
    percentage: 32,
    barColor: "bg-[#F5C451]",
  },
  {
    icon: <SparkleIcon />,
    label: "Bonus Pools",
    amount: "$1,750",
    percentage: 17,
    barColor: "bg-purple-400",
  },
  {
    icon: <FlameIcon />,
    label: "Streak Rewards",
    amount: "$900",
    percentage: 9,
    barColor: "bg-orange-400",
  },
];

interface RewardSourcesProps {
  sources?: RewardSourceRowProps[];
}

export default function RewardSources({ sources = DEFAULT_SOURCES }: RewardSourcesProps) {
  return (
    <div className="bg-[#0f172a] rounded-2xl border border-gray-700/30 overflow-hidden">
      {/* Heading */}
      <div className="px-5 pt-5 pb-2">
        <h2 className="text-white font-semibold text-lg">Reward Sources</h2>
      </div>

      {/* Rows */}
      <div className="px-1 pb-3">
        {sources.map((source, i) => (
          <RewardSourceRow
            key={i}
            icon={source.icon}
            label={source.label}
            amount={source.amount}
            percentage={source.percentage}
            barColor={source.barColor}
          />
        ))}
      </div>
    </div>
  );
}
