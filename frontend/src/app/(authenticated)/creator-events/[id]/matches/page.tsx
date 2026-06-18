"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock,
  Edit2,
  Trash2,
  ShieldCheck,
  XCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/component/ui/button";
import { useWallet } from "@/context/WalletContext";
import AddMatchForm, { type MatchFormData } from "@/component/creator-events/AddMatchForm";
import BulkMatchUpload from "@/component/creator-events/BulkMatchUpload";
import SubmitResultForm from "@/component/creator-events/SubmitResultForm";
import { type MatchOutcome, useCreatorEvents } from "@/hooks/useCreatorEvents";

type MatchStatus = "upcoming" | "started" | "resolved";

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  matchTime: string;
  status: MatchStatus;
  hasPredictions: boolean;
  result?: string;
}

interface EventMeta {
  id: string;
  title: string;
  creatorAddress: string;
}

const MAX_MATCHES = 100;

const MOCK_EVENT: EventMeta = {
  id: "event-001",
  title: "Apollo Tournament",
  creatorAddress: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
};

const MOCK_MATCHES: Match[] = [
  {
    id: "match-001",
    teamA: "Team Alpha",
    teamB: "Team Beta",
    matchTime: new Date(Date.now() + 86400 * 1000).toISOString(),
    status: "upcoming",
    hasPredictions: false,
  },
  {
    id: "match-002",
    teamA: "Team Gamma",
    teamB: "Team Delta",
    matchTime: new Date(Date.now() - 3600 * 1000).toISOString(),
    status: "started",
    hasPredictions: true,
  },
  {
    id: "match-003",
    teamA: "Team Sigma",
    teamB: "Team Omega",
    matchTime: new Date(Date.now() - 86400 * 1000).toISOString(),
    status: "resolved",
    hasPredictions: true,
    result: "Team Sigma",
  },
];

function statusBadge(status: MatchStatus) {
  if (status === "upcoming")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
        <Clock className="h-3 w-3" />
        Upcoming
      </span>
    );
  if (status === "started")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
        <ShieldCheck className="h-3 w-3" />
        Started
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/20 bg-slate-700/60 px-2.5 py-1 text-xs font-semibold text-slate-300">
      <CheckCircle className="h-3 w-3" />
      Resolved
    </span>
  );
}

function deriveOutcomeFromScore(
  homeScore: number,
  awayScore: number,
): MatchOutcome {
  if (homeScore > awayScore) return "TeamA";
  if (awayScore > homeScore) return "TeamB";
  return "Draw";
}

export default function MatchManagementPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { address } = useWallet();
  const { submitMatchResult } = useCreatorEvents();

  const [eventMeta] = useState<EventMeta>(MOCK_EVENT);
  const [matches, setMatches] = useState<Match[]>(MOCK_MATCHES);
  const [isCreator, setIsCreator] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeSubmitMatchId, setActiveSubmitMatchId] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const normalized = address?.toUpperCase() ?? "";
    const creatorNorm = eventMeta.creatorAddress.toUpperCase();
    if (normalized !== creatorNorm) {
      router.replace(`/creator-events/${params.id}`);
    } else {
      setIsCreator(true);
    }
  }, [hydrated, address, eventMeta.creatorAddress, params.id, router]);

  async function handleAddMatch(data: MatchFormData) {
    const isDuplicate = matches.some(
      (m) =>
        m.teamA.toLowerCase() === data.teamA.toLowerCase() &&
        m.teamB.toLowerCase() === data.teamB.toLowerCase(),
    );
    if (isDuplicate) throw new Error("Duplicate match");

    if (matches.length >= MAX_MATCHES)
      throw new Error(`Maximum ${MAX_MATCHES} matches reached`);

    const newMatch: Match = {
      id: `match-${Date.now()}`,
      teamA: data.teamA,
      teamB: data.teamB,
      matchTime: data.matchTime,
      status: "upcoming",
      hasPredictions: false,
    };
    setMatches((prev) => [...prev, newMatch]);
  }

  async function handleBulkImport(bulk: MatchFormData[]) {
    const newMatches: Match[] = bulk.map((m) => ({
      id: `match-${Date.now()}-${Math.random()}`,
      teamA: m.teamA,
      teamB: m.teamB,
      matchTime: m.matchTime,
      status: "upcoming",
      hasPredictions: false,
    }));
    setMatches((prev) => [...prev, ...newMatches]);
  }

  function handleDeleteMatch(id: string) {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }

  if (!hydrated || !isCreator) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-amber-400" />
          <p className="text-sm text-slate-400">Verifying creator access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-sm text-slate-400"
        >
          <Link href="/creator-events" className="transition hover:text-white">
            Creator Events
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link
            href={`/creator-events/${params.id}`}
            className="transition hover:text-white"
          >
            {eventMeta.title}
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Matches</span>
        </nav>

        {/* Header */}
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
            Match Management
          </p>
          <h1 className="mt-3 text-3xl font-semibold">{eventMeta.title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {matches.length}/{MAX_MATCHES} matches added
          </p>
        </div>

        {/* Existing matches */}
        <section className="mb-8 space-y-4">
          <h2 className="text-xl font-semibold text-white">Existing Matches</h2>

          {matches.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/20 bg-slate-900/80 p-10 text-center text-slate-400">
              <p>No matches added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        {statusBadge(match.status)}
                        {match.result && (
                          <span className="text-xs text-slate-400">
                            Winner: {match.result}
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-semibold text-white">
                        {match.teamA}{" "}
                        <span className="text-slate-400">vs</span> {match.teamB}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(match.matchTime).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {(match.status === "started" || match.status === "resolved") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                          onClick={() => setActiveSubmitMatchId(match.id)}
                          title="Submit result"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Submit Result
                        </Button>
                      )}
                      {match.status === "upcoming" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-white/10 text-slate-300 hover:border-white/30"
                          title="Edit match"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {!match.hasPredictions && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-rose-500/20 text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
                          onClick={() => handleDeleteMatch(match.id)}
                          title="Delete match"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {activeSubmitMatchId === match.id && (
                    <div className="mt-2 border-t border-white/5 pt-4">
                      <SubmitResultForm
                        teamA={match.teamA}
                        teamB={match.teamB}
                        initialResult={match.result}
                        onSubmit={async (homeScore, awayScore) => {
                          await submitMatchResult(
                            match.id,
                            deriveOutcomeFromScore(homeScore, awayScore),
                            { homeScore, awayScore },
                          );
                          setMatches((prev) =>
                            prev.map((m) =>
                              m.id === match.id
                                ? {
                                    ...m,
                                    status: "resolved" as const,
                                    result: `${homeScore}-${awayScore}`,
                                  }
                                : m
                            )
                          );
                          setActiveSubmitMatchId(null);
                        }}
                        onCancel={() => setActiveSubmitMatchId(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add match form */}
        {matches.length < MAX_MATCHES && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Add a Match
            </h2>
            <AddMatchForm onAddMatch={handleAddMatch} />
          </section>
        )}

        {/* Bulk upload */}
        {matches.length < MAX_MATCHES && (
          <section>
            <h2 className="mb-4 text-xl font-semibold text-white">
              Bulk Add via CSV
            </h2>
            <BulkMatchUpload
              currentMatchCount={matches.length}
              maxMatches={MAX_MATCHES}
              onImport={handleBulkImport}
            />
          </section>
        )}

        {matches.length >= MAX_MATCHES && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <XCircle className="h-4 w-4 shrink-0" />
            Maximum of {MAX_MATCHES} matches reached.
          </div>
        )}
      </div>
    </div>
  );
}
