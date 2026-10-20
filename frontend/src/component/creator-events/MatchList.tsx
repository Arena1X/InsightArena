"use client";

import { CalendarClock, CheckCircle2, Trophy, Zap } from "lucide-react";

import { Badge } from "@/component/ui/badge";
import { Button } from "@/component/ui/button";
import type { CreatorEventMatch, MatchOutcome } from "@/hooks/useCreatorEvents";
import { cn } from "@/lib/utils";
import { useCountdown, formatCountdown } from "@/hooks/useCountdown";

interface MatchListProps {
  matches: CreatorEventMatch[];
  userJoined: boolean;
  onPredict: (match: CreatorEventMatch) => void;
}

const outcomeLabel: Record<MatchOutcome, string> = {
  TeamA: "Team A",
  TeamB: "Team B",
  Draw: "Draw",
  Pending: "Pending",
};

function getWinningTeam(match: CreatorEventMatch) {
  if (match.outcome === "TeamA") return match.teamA;
  if (match.outcome === "TeamB") return match.teamB;
  if (match.outcome === "Draw") return "Draw";
  return null;
}

function isBeforeStart(matchTime: string) {
  return new Date(matchTime).getTime() > Date.now();
}

export default function MatchList({ matches, userJoined, onPredict }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 p-8 text-center text-slate-400">
        No matches have been added to this event yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => {
        const winner = getWinningTeam(match);
        const canPredict = userJoined && match.outcome === "Pending" && isBeforeStart(match.matchTime);
        const countdown = useCountdown(match.matchTime);

        return (
          <article
            key={match.id}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-3 py-1",
                      match.outcome === "Pending"
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                    )}
                  >
                    {match.outcome === "Pending" ? "Pending" : "Completed"}
                  </Badge>
                  {(match.pointsMultiplier === 2 || match.pointsMultiplier === 3) && (
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200"
                    >
                      ⚡ {match.pointsMultiplier}x Points
                    </Badge>
                  )}
                  {match.outcome === "Pending" && !countdown.isExpired ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-3 py-1 flex items-center gap-1",
                        countdown.totalSeconds < 300
                          ? "border-red-400/30 bg-red-400/10 text-red-200"
                          : "border-blue-400/30 bg-blue-400/10 text-blue-200"
                      )}
                    >
                      <Zap className="h-3 w-3" />
                      {formatCountdown(countdown, "Live")}
                    </Badge>
                  ) : null}
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    <CalendarClock className="h-4 w-4" />
                    {new Date(match.matchTime).toLocaleString()}
                  </span>
                </div>

                <h3 className="mt-3 text-xl font-semibold text-white">
                  {match.teamA} <span className="text-slate-500">vs</span> {match.teamB}
                </h3>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                    <CheckCircle2 className="h-4 w-4 text-slate-400" />
                    Result: {outcomeLabel[match.outcome]}
                  </span>
                  {winner ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">
                      <Trophy className="h-4 w-4" />
                      Winner: {winner}
                    </span>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                className="rounded-full px-5"
                disabled={!canPredict}
                onClick={() => onPredict(match)}
              >
                Predict
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
