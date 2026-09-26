import { useMemo } from "react";
import UpcomingRewardCard, { UpcomingRewardCardProps } from "./UpcomingRewardCard";
import { calculateCountdown } from "@/hooks/useCountdown";

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

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const DEFAULT_UPCOMING: UpcomingRewardCardProps[] = [
  {
    category: "Weekly Competition",
    amount: "$350",
    settlementDate: daysFromNow(3),
    icon: <TrophyIcon />,
  },
  {
    category: "Quarterly Bonus Pool",
    amount: "$1,200",
    settlementDate: daysFromNow(12),
    icon: <SparkleIcon />,
  },
  {
    category: "Market Prediction",
    amount: "$180",
    settlementDate: daysFromNow(6),
    icon: <ChartIcon />,
  },
];

interface UpcomingRewardsProps {
  items?: UpcomingRewardCardProps[];
  /** Injectable for tests; defaults to the real clock. */
  now?: number;
}

/** The calendar day (in the viewer's local time zone) `date` falls on, as a stable grouping key. */
function dayKey(date: string | Date | number): string {
  const parsed =
    typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return parsed.toDateString();
}

export default function UpcomingRewards({ items = DEFAULT_UPCOMING, now }: UpcomingRewardsProps) {
  const { processing, byDay } = useMemo(() => {
    const pending: UpcomingRewardCardProps[] = [];
    const expired: UpcomingRewardCardProps[] = [];

    for (const item of items) {
      const isExpired = calculateCountdown(item.settlementDate, now).isExpired;
      (isExpired ? expired : pending).push(item);
    }

    const groups = new Map<string, UpcomingRewardCardProps[]>();
    for (const item of pending) {
      const key = dayKey(item.settlementDate);
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    const sortedDays = Array.from(groups.entries()).sort(
      ([, a], [, b]) =>
        new Date(a[0].settlementDate).getTime() - new Date(b[0].settlementDate).getTime(),
    );

    return { processing: expired, byDay: sortedDays };
  }, [items, now]);

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-4">Upcoming Rewards</h2>

      {byDay.length === 0 && processing.length === 0 && (
        <p className="text-gray-500 text-sm">No upcoming rewards.</p>
      )}

      {byDay.map(([day, dayItems]) => (
        <div key={day} className="mb-6">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
            {day}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dayItems.map((item, i) => (
              <UpcomingRewardCard
                key={i}
                category={item.category}
                amount={item.amount}
                settlementDate={item.settlementDate}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      ))}

      {processing.length > 0 && (
        <div>
          <p className="text-amber-400 text-xs font-medium uppercase tracking-wider mb-3">
            Processing
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {processing.map((item, i) => (
              <UpcomingRewardCard
                key={i}
                category={item.category}
                amount={item.amount}
                settlementDate={item.settlementDate}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
