"use client";

import { ChevronRight, Clock3 } from "lucide-react";
import { RankDelta } from "@/component/leaderboard/LeaderboardTable";
import { Progress } from "@/component/ui/progress";
import { useMyEvents, type JoinedCompetitionProgress } from "@/hooks/useMyEvents";

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(deadline));
}

export function sortCompetitionsByDeadline(
  competitions: JoinedCompetitionProgress[],
) {
  return [...competitions].sort((left, right) => {
    const leftDeadline = left.nextDeadline
      ? new Date(left.nextDeadline.matchTime).getTime()
      : Number.POSITIVE_INFINITY;
    const rightDeadline = right.nextDeadline
      ? new Date(right.nextDeadline.matchTime).getTime()
      : Number.POSITIVE_INFINITY;
    return leftDeadline - rightDeadline;
  });
}

export default function CompetitionsJoined() {
  const { joinedCompetitionProgress, isLoading } = useMyEvents();
  const competitions = sortCompetitionsByDeadline(joinedCompetitionProgress);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-xl">Competitions Joined</h2>
        <button className="flex items-center gap-1 text-orange-400 text-sm font-medium hover:text-orange-300 transition">
          View All Competitions
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading your competitions…</p>
      ) : competitions.length === 0 ? (
        <p className="text-sm text-gray-400">You have not joined a competition yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {competitions.map((competition) => {
            const { event } = competition;
            return (
              <div
                key={event.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-gray-400 text-sm font-medium">{event.status}</span>
                  {competition.nextDeadline && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-400/10 px-2.5 py-1 text-xs font-medium text-orange-300">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Next deadline: {formatDeadline(competition.nextDeadline.matchTime)}
                    </span>
                  )}
                </div>

                <h3 className="text-white font-semibold text-lg mb-5 leading-tight">{event.title}</h3>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-bold text-white/80">
                    {competition.rank === null ? "—" : `#${competition.rank}`}
                  </span>
                  <RankDelta delta={competition.rankDelta ?? 0} />
                  <span className="text-sm text-gray-500">of {event.participants}</span>
                </div>
                <p className="text-gray-400 text-sm mb-5">{event.participants} participants</p>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-200">Prediction progress</span>
                  <span className="text-gray-400">
                    {competition.matchesPredicted} / {competition.totalMatches} matches
                  </span>
                </div>
                <Progress
                  value={competition.progressPercentage}
                  aria-label={`${competition.matchesPredicted} of ${competition.totalMatches} matches predicted`}
                  indicatorClassName="bg-orange-400"
                />

                <div className="mt-5 flex items-center gap-2">
                  <span className="text-base">🏆</span>
                  <span className="text-gray-300 text-sm font-medium">{event.prizePool.display} pool</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
