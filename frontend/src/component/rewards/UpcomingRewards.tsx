import UpcomingRewardCard, { UpcomingRewardCardProps } from "./UpcomingRewardCard";

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12M6 3a4 4 0 004 4h4a4 4 0 004-4M6 3H4a1 1 0 00-1 1v2a4 4 0 004 4m10-7h2a1 1 0 011 1v2a4 4 0 01-4 4m-6 0v4m0 0H9m3 0h3" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M3 12h2m14 0h2m-4.22-6.78l-1.42 1.42M6.64 17.36l-1.42 1.42m12.14 0l-1.42-1.42M6.64 6.64L5.22 5.22M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 4 5" />
    </svg>
  );
}

const DEFAULT_UPCOMING: UpcomingRewardCardProps[] = [
  {
    category: "Weekly Competition",
    amount: "$350",
    settlementLabel: "Settles on Dec 22, 2024",
    icon: <TrophyIcon />,
  },
  {
    category: "Quarterly Bonus Pool",
    amount: "$1,200",
    settlementLabel: "Settles on Dec 31, 2024",
    icon: <SparkleIcon />,
  },
  {
    category: "Market Prediction",
    amount: "$180",
    settlementLabel: "Settles on Dec 25, 2024",
    icon: <ChartIcon />,
  },
];

interface UpcomingRewardsProps {
  items?: UpcomingRewardCardProps[];
}

export default function UpcomingRewards({ items = DEFAULT_UPCOMING }: UpcomingRewardsProps) {
  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-4">Upcoming Rewards</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item, i) => (
          <UpcomingRewardCard
            key={i}
            category={item.category}
            amount={item.amount}
            settlementLabel={item.settlementLabel}
            icon={item.icon}
          />
        ))}
      </div>
    </div>
  );
}
