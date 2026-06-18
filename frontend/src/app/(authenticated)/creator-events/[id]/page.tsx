"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Plus, ShieldCheck, UserPlus, XCircle } from "lucide-react";

import EventHeader from "@/component/creator-events/EventHeader";
import EventLeaderboard, {
  type LeaderboardEntry,
} from "@/component/creator-events/EventLeaderboard";
import MatchList from "@/component/creator-events/MatchList";
import ParticipantList, {
  type EventParticipantRow,
} from "@/component/creator-events/ParticipantList";
import { Button } from "@/component/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/component/ui/tabs";
import { useWallet } from "@/context/WalletContext";
import {
  type CreatorEvent,
  type CreatorEventMatch,
  type Participant,
  useCreatorEvents,
} from "@/hooks/useCreatorEvents";
import { cn } from "@/lib/utils";

const fallbackParticipants: Record<string, Participant[]> = {
  "event-002": [
    {
      address: "GALP2...Z91Q",
      joinedAt: "2026-05-06T14:30:00Z",
      score: 3,
      predictions: 3,
      correctPredictions: 3,
      pointsEarned: 300,
    },
    {
      address: "GC7RB...1KYV",
      joinedAt: "2026-05-06T15:05:00Z",
      score: 3,
      predictions: 3,
      correctPredictions: 3,
      pointsEarned: 300,
    },
    {
      address: "GDL9N...8TWF",
      joinedAt: "2026-05-07T09:45:00Z",
      score: 2,
      predictions: 3,
      correctPredictions: 2,
      pointsEarned: 200,
    },
  ],
  "event-003": [
    {
      address: "GB82Q...HJ4X",
      joinedAt: "2026-05-22T12:10:00Z",
      score: 1,
      predictions: 1,
      correctPredictions: 1,
      pointsEarned: 100,
    },
    {
      address: "GCN65...P0LR",
      joinedAt: "2026-05-23T08:20:00Z",
      score: 0,
      predictions: 1,
      correctPredictions: 0,
      pointsEarned: 0,
    },
  ],
};

function formatScore(participant: Participant, totalMatches: number) {
  if (totalMatches === 0) return 0;
  if (participant.score <= totalMatches) return Math.max(0, participant.score);
  return Math.min(totalMatches, Math.max(0, Math.round(participant.score / 100)));
}

function buildParticipantRows(
  eventId: string,
  participants: Participant[],
  totalMatches: number,
): EventParticipantRow[] {
  const source = participants.length > 0 ? participants : fallbackParticipants[eventId] ?? [];

  return source.map((participant) => ({
    address: participant.address,
    joinedAt: participant.joinedAt,
    correctPredictions: formatScore(participant, totalMatches),
    totalMatches,
  }));
}

function buildLeaderboardEntries(
  participants: Participant[],
  eventId: string,
  totalMatches: number,
  isFinalized: boolean,
): LeaderboardEntry[] {
  const source = participants.length > 0 ? participants : fallbackParticipants[eventId] ?? [];
  if (source.length === 0) return [];

  const entries = source.map((p) => {
    const isHighPoints = p.score > totalMatches;
    let points = p.score;
    let correctResults = 0;
    let exactScores = 0;
    let matchesPlayed = totalMatches;

    if (isHighPoints) {
      points = p.score;
      correctResults = Math.min(totalMatches, Math.floor(p.score / 100));
      const remainder = p.score % 100;
      exactScores = Math.min(correctResults, Math.floor(remainder / 10));
    } else {
      correctResults = Math.max(0, Math.min(totalMatches, p.score));
      exactScores = correctResults >= 2 ? 1 : 0;
      points = correctResults * 100 + exactScores * 10;
    }

    return {
      address: p.address,
      points,
      correctResults,
      exactScores,
      matchesPlayed,
    };
  });

  const sortedEntries = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.correctResults !== a.correctResults) return b.correctResults - a.correctResults;
    return b.exactScores - a.exactScores;
  });

  let currentRank = 1;
  return sortedEntries.map((entry, index) => {
    if (index > 0 && sortedEntries[index - 1].points > entry.points) {
      currentRank = index + 1;
    }
    return {
      ...entry,
      rank: currentRank,
    };
  });
}

function getResolvedMatches(matches: CreatorEventMatch[]) {
  return matches.filter((match) => match.outcome !== "Pending");
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function CreatorEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { address, openConnectModal } = useWallet();
  const {
    getEvent,
    getEventMatches,
    getEventParticipants,
    getEventWinners,
    joinEvent,
    verifyWinners,
    cancelEvent,
  } = useCreatorEvents();

  const eventId = params.id;
  const [event, setEvent] = useState<CreatorEvent | null>(null);
  const [matches, setMatches] = useState<CreatorEventMatch[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [verifiedWinners, setVerifiedWinners] = useState<LeaderboardEntry[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const queryInviteCode =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("inviteCode")
        : "";
    setInviteCode(queryInviteCode ?? "");
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadEventDetail() {
      setIsLoading(true);
      const [eventResult, matchResult, participantResult, winnerResult] =
        await Promise.all([
          getEvent(eventId),
          getEventMatches(eventId),
          getEventParticipants(eventId),
          getEventWinners(eventId),
        ]);

      if (!isMounted) return;

      setEvent(eventResult);
      setMatches(matchResult);
      setParticipants(participantResult);
      setIsJoined(Boolean(eventResult?.joined));
      setVerifiedWinners(
        winnerResult.map((winner) => {
          const scoreVal = winner.score;
          const matchCount = matchResult.length;
          const isHighPoints = scoreVal > matchCount;
          let points = scoreVal;
          let correctResults = 0;
          let exactScores = 0;
          let matchesPlayed = matchCount;

          if (isHighPoints) {
            points = scoreVal;
            correctResults = Math.min(matchCount, Math.floor(scoreVal / 100));
            const remainder = scoreVal % 100;
            exactScores = Math.min(correctResults, Math.floor(remainder / 10));
          } else {
            correctResults = Math.max(0, Math.min(matchCount, scoreVal));
            exactScores = correctResults >= 2 ? 1 : 0;
            points = correctResults * 100 + exactScores * 10;
          }

          return {
            rank: winner.rank,
            address: winner.address,
            points,
            correctResults,
            exactScores,
            matchesPlayed,
            payout: winner.rank === 1 ? "150 XLM" : winner.rank === 2 ? "90 XLM" : winner.rank === 3 ? "60 XLM" : "-",
          };
        }),
      );
      setIsLoading(false);
    }

    loadEventDetail();

    return () => {
      isMounted = false;
    };
  }, [eventId, getEvent, getEventMatches, getEventParticipants, getEventWinners]);

  const participantRows = useMemo(
    () => buildParticipantRows(eventId, participants, matches.length),
    [eventId, participants, matches.length],
  );

  const resolvedMatches = useMemo(() => getResolvedMatches(matches), [matches]);
  const allMatchesResolved = matches.length > 0 && resolvedMatches.length === matches.length;

  const isFinalized = event?.status === "Completed" || verifiedWinners.length > 0;

  const leaderboardEntries = useMemo(() => {
    const entries = buildLeaderboardEntries(participants, eventId, matches.length, isFinalized);

    if (isFinalized) {
      return entries.map((entry) => {
        const verified = verifiedWinners.find((w) => w.address === entry.address);
        return {
          ...entry,
          payout: verified?.payout || (entry.rank === 1 ? "150 XLM" : entry.rank === 2 ? "90 XLM" : entry.rank === 3 ? "60 XLM" : "-"),
        };
      });
    }

    return entries;
  }, [isFinalized, verifiedWinners, participants, eventId, matches.length]);

  const isCreator = Boolean(address && event?.creator === address);
  const pendingMatches = matches.filter((match) => match.outcome === "Pending");
  const totalPredictionsSubmitted = participantRows.reduce(
    (sum, participant) => sum + participant.correctPredictions,
    0,
  );

  const handleJoinEvent = async () => {
    if (!address) {
      openConnectModal();
      return;
    }

    const code = inviteCode.trim() || event?.inviteCode;
    if (!code) {
      setActionMessage("Enter an invite code to join this creator event.");
      return;
    }

    const joined = await joinEvent(code);
    setIsJoined(joined);
    setActionMessage(joined ? "You joined this event." : "Unable to join with that invite code.");
  };

  const handleVerifyWinners = async () => {
    setIsVerifying(true);
    const success = await verifyWinners(eventId);
    setIsVerifying(false);

    if (success) {
      setVerifiedWinners(leaderboardEntries);
      setActionMessage("Winner verification completed.");
    } else {
      setActionMessage("Winner verification failed.");
    }
  };

  const handleCancelEvent = async () => {
    const success = await cancelEvent(eventId);
    if (success && event) {
      setEvent({ ...event, status: "Cancelled" });
      setActionMessage("Event cancelled.");
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-64 rounded-3xl bg-white/10" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-white/10" />
            ))}
          </div>
          <div className="h-96 rounded-3xl bg-white/10" />
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Creator event</p>
          <h1 className="mt-4 text-3xl font-semibold">Event not found</h1>
          <p className="mt-3 text-slate-400">
            This creator event may have been removed or the invite link is invalid.
          </p>
          <Button className="mt-6 rounded-full" onClick={() => router.push("/creator-events")}>
            Back to creator events
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => router.push("/creator-events")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Button>

        <EventHeader
          title={event.title}
          description={event.description}
          creator={event.creator}
          status={event.status}
          participants={event.participants}
          maxParticipants={event.maxParticipants}
          createdAt={event.createdAt}
          inviteCode={isCreator ? event.inviteCode : undefined}
          category={event.category}
          bannerUrl={event.bannerUrl}
        />

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Actions</p>
              <p className="mt-2 text-sm text-slate-300">
                Available actions change based on membership, creator status, and match resolution.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {!isJoined ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="sr-only" htmlFor="invite-code">Invite code</label>
                  <input
                    id="invite-code"
                    value={inviteCode}
                    onChange={(inputEvent) => setInviteCode(inputEvent.target.value)}
                    placeholder="Invite code"
                    className="rounded-full border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                  <Button className="rounded-full" onClick={handleJoinEvent}>
                    <UserPlus className="h-4 w-4" />
                    Join Event
                  </Button>
                </div>
              ) : (
                <Button
                  className="rounded-full"
                  disabled={pendingMatches.length === 0}
                  onClick={() => setActionMessage("Choose a pending match from the Matches tab.")}
                >
                  Make Predictions
                </Button>
              )}

              {isCreator ? (
                <>
                  <Button className="rounded-full" variant="outline">
                    <Plus className="h-4 w-4" />
                    Add Match
                  </Button>
                  <Button
                    className="rounded-full border-rose-400/30 text-rose-200 hover:bg-rose-500/10"
                    variant="outline"
                    onClick={handleCancelEvent}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Event
                  </Button>
                </>
              ) : null}

              {allMatchesResolved ? (
                <Button
                  className="rounded-full"
                  onClick={handleVerifyWinners}
                  disabled={isVerifying}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isVerifying ? "Verifying..." : "Verify Winners"}
                </Button>
              ) : null}
            </div>
          </div>

          {actionMessage ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {actionMessage}
            </p>
          ) : null}
        </section>

        <Tabs defaultValue="matches" className="space-y-5">
          <TabsList className="h-auto w-full justify-start gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2 sm:w-fit">
            {[
              ["matches", "Matches"],
              ["participants", "Participants"],
              ["leaderboard", "Leaderboard"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "rounded-xl px-4 py-2 text-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-950",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="matches">
            <MatchList
              matches={matches}
              userJoined={isJoined}
              onPredict={(match) =>
                setActionMessage(`Prediction flow opened for ${match.teamA} vs ${match.teamB}.`)
              }
            />
          </TabsContent>
          <TabsContent value="participants">
            <ParticipantList participants={participantRows} />
          </TabsContent>
          <TabsContent value="leaderboard">
            <EventLeaderboard entries={leaderboardEntries} isFinalized={isFinalized} />
          </TabsContent>
        </Tabs>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold text-white">Event Stats</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total matches" value={matches.length} />
            <StatCard label="Matches resolved" value={resolvedMatches.length} />
            <StatCard label="Predictions submitted" value={totalPredictionsSubmitted} />
            <StatCard label="Winners verified" value={verifiedWinners.length > 0 ? "Yes" : "No"} />
          </div>
        </section>
      </div>
    </main>
  );
}
