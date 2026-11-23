"use client";

export interface BracketParticipant {
  id: string;
  name: string;
  seed?: number;
  score?: number;
}

export type MatchupStatus = "completed" | "live" | "upcoming";

export interface BracketMatchup {
  id: string;
  home: BracketParticipant | null;
  away: BracketParticipant | null;
  winnerId?: string | null;
  status: MatchupStatus;
  scheduledAt?: string;
}

export interface BracketRound {
  id: string;
  name: string;
  isCurrent?: boolean;
  matchups: BracketMatchup[];
}

export interface CompetitionBracketProps {
  title?: string;
  rounds: BracketRound[];
  className?: string;
}

const MATCHUP_STATUS_STYLES: Record<MatchupStatus, string> = {
  completed: "border-emerald-500/40 bg-emerald-500/[0.08]",
  live: "border-orange-500/40 bg-orange-500/[0.08]",
  upcoming: "border-white/10 bg-white/[0.03]",
};

const MATCHUP_BADGE_STYLES: Record<MatchupStatus, string> = {
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  live: "border-orange-500/30 bg-orange-500/15 text-orange-300",
  upcoming: "border-white/10 bg-white/5 text-gray-400",
};

const MATCHUP_STATUS_LABELS: Record<MatchupStatus, string> = {
  completed: "Completed",
  live: "Live",
  upcoming: "Upcoming",
};

function ParticipantRow({
  participant,
  isWinner,
  isCompleted,
}: {
  participant: BracketParticipant | null;
  isWinner: boolean;
  isCompleted: boolean;
}) {
  if (!participant) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-gray-500">
        <span>TBD</span>
        <span>—</span>
      </div>
    );
  }

  return (
    <div
      data-winner={isWinner ? "true" : "false"}
      className={[
        "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition",
        isWinner
          ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-200"
          : isCompleted
            ? "border-white/5 bg-white/[0.02] text-gray-400"
            : "border-white/10 bg-white/[0.03] text-gray-200",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-2">
        {participant.seed != null && (
          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-white/10 px-1 text-[10px] font-medium text-gray-300">
            {participant.seed}
          </span>
        )}
        <span className="truncate">{participant.name}</span>
      </div>
      <span className="shrink-0 font-mono text-xs">
        {participant.score != null ? participant.score : "—"}
      </span>
    </div>
  );
}

export default function CompetitionBracket({
  title,
  rounds,
  className = "",
}: CompetitionBracketProps) {
  if (rounds.length === 0) {
    return (
      <section
        aria-label={title ? `${title} bracket` : "Competition bracket"}
        className={`rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur ${className}`}
      >
        <p className="text-sm text-gray-400">
          Bracket matchups will appear once seeding is finalized.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={title ? `${title} bracket` : "Competition bracket"}
      className={`rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur ${className}`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">
            Tournament Bracket
          </p>
          {title && (
            <h2 className="mt-0.5 text-lg font-semibold text-white">{title}</h2>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-orange-200">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Current Round
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-gray-300">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            Upcoming
          </span>
        </div>
      </div>

      {/* Responsive horizontally scrollable bracket container */}
      <div
        data-testid="bracket-scroll-container"
        role="region"
        aria-label="Scrollable competition bracket diagram"
        tabIndex={0}
        className="w-full overflow-x-auto pb-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40 rounded-xl"
      >
        <div
          data-testid="bracket-rounds-track"
          className="inline-flex min-w-max items-stretch gap-6"
        >
          {rounds.map((round, roundIndex) => {
            const isCurrent = Boolean(round.isCurrent);
            const isLastRound = roundIndex === rounds.length - 1;

            return (
              <div
                key={round.id}
                data-testid={`bracket-round-${round.id}`}
                data-current={isCurrent ? "true" : "false"}
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "flex w-64 shrink-0 flex-col rounded-2xl border p-3.5 transition",
                  isCurrent
                    ? "border-orange-500/50 bg-orange-500/[0.07] ring-1 ring-orange-500/30"
                    : "border-white/10 bg-white/[0.02]",
                ].join(" ")}
              >
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <h3 className="text-sm font-semibold text-white">
                    {round.name}
                  </h3>
                  {isCurrent && (
                    <span className="rounded-full border border-orange-500/40 bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-200">
                      Current Round
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-around gap-4">
                  {round.matchups.map((matchup) => {
                    const isCompleted = matchup.status === "completed";
                    const homeIsWinner =
                      isCompleted &&
                      Boolean(matchup.home) &&
                      matchup.winnerId === matchup.home?.id;
                    const awayIsWinner =
                      isCompleted &&
                      Boolean(matchup.away) &&
                      matchup.winnerId === matchup.away?.id;

                    return (
                      <div key={matchup.id} className="relative flex items-center">
                        <div
                          data-testid={`bracket-matchup-${matchup.id}`}
                          data-status={matchup.status}
                          className={[
                            "w-full rounded-xl border p-2.5 transition",
                            MATCHUP_STATUS_STYLES[matchup.status],
                          ].join(" ")}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={[
                                "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                                MATCHUP_BADGE_STYLES[matchup.status],
                              ].join(" ")}
                            >
                              {MATCHUP_STATUS_LABELS[matchup.status]}
                            </span>
                            {matchup.scheduledAt && (
                              <span className="text-[10px] text-gray-400">
                                {matchup.scheduledAt}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <ParticipantRow
                              participant={matchup.home}
                              isWinner={homeIsWinner}
                              isCompleted={isCompleted}
                            />
                            <ParticipantRow
                              participant={matchup.away}
                              isWinner={awayIsWinner}
                              isCompleted={isCompleted}
                            />
                          </div>
                        </div>

                        {/* Horizontal bracket connector to next round */}
                        {!isLastRound && (
                          <div
                            aria-hidden="true"
                            className={[
                              "pointer-events-none absolute -right-6 top-1/2 h-px w-6",
                              isCompleted ? "bg-emerald-500/50" : "bg-white/15",
                            ].join(" ")}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
