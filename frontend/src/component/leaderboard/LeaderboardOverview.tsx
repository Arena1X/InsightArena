import StatCard, { StatCardProps } from "../rewards/StatCard";

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
      />
      <circle cx="9" cy="7" r="4" strokeLinecap="round" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 9H4a2 2 0 000 4h2M18 9h2a2 2 0 010 4h-2M6 9V5h12v4M6 9c0 4 2 7 6 8 4-1 6-4 6-8"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21h6M12 17v4" />
    </svg>
  );
}

function SwordsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.5 17.5L3 6V3h3l11.5 11.5M10 14l1.5 1.5M16.5 21l-1-1M21 3l-3 3-4.5-4.5 3-3L21 3zM3 21l3-3 4.5-4.5-3-3L3 21z"
      />
    </svg>
  );
}

function ChartBarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 18V9M8 18V5M13 18v-6M18 18v-9"
      />
    </svg>
  );
}

const DEFAULT_STATS: StatCardProps[] = [
  {
    label: "Total Participants",
    value: "2,847",
    supportingText: "+134 this week",
    icon: <UsersIcon />,
    valueColor: "text-[#4FD1C5]",
  },
  {
    label: "Top Performer",
    value: "0xArena_Pro",
    supportingText: "9,840 pts · #1 overall",
    icon: <TrophyIcon />,
    valueColor: "text-[#F5C451]",
  },
  {
    label: "Active Competitions",
    value: "12",
    supportingText: "3 ending this week",
    icon: <SwordsIcon />,
    valueColor: "text-white",
  },
  {
    label: "Your Rank",
    value: "#142",
    supportingText: "Top 5% of all predictors",
    icon: <ChartBarIcon />,
    valueColor: "text-[#A78BFA]",
  },
];

interface LeaderboardOverviewProps {
  stats?: StatCardProps[];
}

export default function LeaderboardOverview({
  stats = DEFAULT_STATS,
}: LeaderboardOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Leaderboard</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-xl">
            See how you stack up against other predictors. Compete, climb the
            ranks, and earn rewards for top performance.
          </p>
        </div>
        <button
          type="button"
          className="flex-shrink-0 self-start px-5 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-[#d6daea] transition hover:bg-white/10"
        >
          View Full Rankings
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
