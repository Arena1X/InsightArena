"use client";

import { useEffect, useMemo, useState } from "react";

export default function CompetitionsPage() {
  type CompetitionStatus = "Active" | "Upcoming" | "Ended" | "Cancelled";
  type CompetitionVisibility = "Public" | "Private";

  type Competition = {
    id: string;
    title: string;
    description: string;
    status: CompetitionStatus;
    prizePoolXlm: number;
    participants: number;
    maxParticipants: number;
    startDate: string;
    endDate: string;
    visibility: CompetitionVisibility;
    joined: boolean;
  };

  const [activeTab, setActiveTab] = useState<
    "All" | "Active" | "Upcoming" | "Ended" | "My Competitions"
  >("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    visibility: "Public" as CompetitionVisibility,
    maxParticipants: 100,
    prizePoolXlm: 500,
  });

  const [competitions, setCompetitions] = useState<Competition[]>([
    {
      id: "comp-1",
      title: "Stellar Weekly Predictions",
      description:
        "Compete weekly by forecasting outcomes across the hottest markets on Stellar.",
      status: "Active",
      prizePoolXlm: 2500,
      participants: 42,
      maxParticipants: 200,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      visibility: "Public",
      joined: true,
    },
    {
      id: "comp-2",
      title: "DeFi Masters Sprint",
      description:
        "A fast-paced competition for DeFi market specialists. Accuracy matters most.",
      status: "Upcoming",
      prizePoolXlm: 1200,
      participants: 18,
      maxParticipants: 100,
      startDate: "2026-05-05",
      endDate: "2026-05-20",
      visibility: "Public",
      joined: false,
    },
    {
      id: "comp-3",
      title: "Private Alpha League",
      description:
        "Invite-only league for top predictors. Access is managed by the organizer.",
      status: "Active",
      prizePoolXlm: 5000,
      participants: 12,
      maxParticipants: 25,
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      visibility: "Private",
      joined: false,
    },
    {
      id: "comp-4",
      title: "Season 1 Finals",
      description:
        "The grand finale event for Season 1 with leaderboard-based prizes.",
      status: "Ended",
      prizePoolXlm: 8000,
      participants: 256,
      maxParticipants: 256,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      visibility: "Public",
      joined: true,
    },
    {
      id: "comp-5",
      title: "Community Cup (Cancelled)",
      description:
        "A community-run cup that was cancelled due to insufficient participants.",
      status: "Cancelled",
      prizePoolXlm: 0,
      participants: 9,
      maxParticipants: 50,
      startDate: "2026-04-15",
      endDate: "2026-04-25",
      visibility: "Public",
      joined: false,
    },
  ]);

  const matchesTab = (competition: Competition) => {
    if (activeTab === "All") return true;
    if (activeTab === "My Competitions") return competition.joined;
    return competition.status === activeTab;
  };

  const matchesSearch = (competition: Competition) => {
    if (!search.trim()) return true;
    return competition.title
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  };

  const filtered = useMemo(
    () => competitions.filter((c) => matchesTab(c) && matchesSearch(c)),
    [competitions, activeTab, search],
  );

  const tabCounts = useMemo(() => {
    const all = competitions.length;
    const active = competitions.filter((c) => c.status === "Active").length;
    const upcoming = competitions.filter((c) => c.status === "Upcoming").length;
    const ended = competitions.filter((c) => c.status === "Ended").length;
    const mine = competitions.filter((c) => c.joined).length;
    return { all, active, upcoming, ended, mine };
  }, [competitions]);

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const statusStyles: Record<CompetitionStatus, string> = {
    Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Upcoming: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Ended: "bg-gray-500/15 text-gray-200 border-gray-500/30",
    Cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };

  const visibilityStyles: Record<CompetitionVisibility, string> = {
    Public: "bg-white/5 text-gray-200 border-white/10",
    Private: "bg-purple-500/15 text-purple-200 border-purple-500/30",
  };

  const truncate = (value: string, max = 110) =>
    value.length <= max ? value : `${value.slice(0, max).trim()}…`;

  const onJoinToggle = (id: string, joined: boolean) => {
    setCompetitions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, joined } : c)),
    );
  };

  const onCreate = () => {
    const title = createForm.title.trim();
    if (!title) return;

    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const end = new Date(now);
    end.setDate(end.getDate() + 14);
    const endDate = end.toISOString().slice(0, 10);

    const newCompetition: Competition = {
      id: `comp-${Date.now()}`,
      title,
      description: createForm.description.trim() || "New competition",
      status: "Upcoming",
      prizePoolXlm: Math.max(0, Number(createForm.prizePoolXlm) || 0),
      participants: 1,
      maxParticipants: Math.max(2, Number(createForm.maxParticipants) || 2),
      startDate,
      endDate,
      visibility: createForm.visibility,
      joined: true,
    };

    setCompetitions((prev) => [newCompetition, ...prev]);
    setIsCreateOpen(false);
    setCreateForm((prev) => ({ ...prev, title: "", description: "" }));
  };

  const tabs = [
    { label: "All" as const, count: tabCounts.all },
    { label: "Active" as const, count: tabCounts.active },
    { label: "Upcoming" as const, count: tabCounts.upcoming },
    { label: "Ended" as const, count: tabCounts.ended },
    { label: "My Competitions" as const, count: tabCounts.mine },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">Competitions</h1>
          <p className="text-sm text-gray-400">
            Browse competitions, track status, and join leagues to compete for
            XLM rewards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500/90"
        >
          Create Competition
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = tab.label === activeTab;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveTab(tab.label)}
                className={[
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                    : "border-white/10 bg-white/5 text-gray-200 hover:bg-white/10",
                ].join(" ")}
              >
                <span>{tab.label}</span>
                <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-gray-400">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full md:max-w-sm">
          <label className="sr-only" htmlFor="competition-search">
            Search competitions
          </label>
          <input
            id="competition-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search competitions…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-orange-500/50"
          />
        </div>
      </div>

      {activeTab === "My Competitions" && filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white backdrop-blur">
          <h2 className="text-xl font-semibold">No competitions yet</h2>
          <p className="mt-2 text-sm text-gray-400">
            Join a competition to track your performance and climb the
            leaderboard.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("All")}
            className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10"
          >
            Explore competitions
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {paged.map((competition) => {
              const isEnded = competition.status === "Ended";
              const isCancelled = competition.status === "Cancelled";
              const canJoin = !competition.joined && !isEnded && !isCancelled;
              const canLeave = competition.joined && !isEnded && !isCancelled;

              return (
                <article
                  key={competition.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-orange-500/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">
                        {competition.title}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {truncate(competition.description)}
                      </p>
                    </div>
                    <span
                      className={[
                        "shrink-0 rounded-xl border px-2.5 py-1 text-xs font-semibold",
                        statusStyles[competition.status],
                      ].join(" ")}
                    >
                      {competition.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">
                        Prize Pool
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {competition.prizePoolXlm.toLocaleString()} XLM
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">
                        Participants
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {competition.participants}/{competition.maxParticipants}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">
                        Dates
                      </dt>
                      <dd className="mt-1 font-medium text-white">
                        {competition.startDate} → {competition.endDate}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">
                        Visibility
                      </dt>
                      <dd className="mt-2">
                        <span
                          className={[
                            "inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold",
                            visibilityStyles[competition.visibility],
                          ].join(" ")}
                        >
                          {competition.visibility}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    {isEnded ? (
                      <button
                        type="button"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10"
                      >
                        View Results
                      </button>
                    ) : canJoin ? (
                      <button
                        type="button"
                        onClick={() => onJoinToggle(competition.id, true)}
                        className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500/90"
                      >
                        Join
                      </button>
                    ) : canLeave ? (
                      <button
                        type="button"
                        onClick={() => onJoinToggle(competition.id, false)}
                        className="w-full rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
                      >
                        Leave
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-500"
                      >
                        {isCancelled ? "Cancelled" : "Joined"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400 backdrop-blur sm:flex-row">
            <div>
              Showing{" "}
              <span className="font-semibold text-gray-200">
                {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-gray-200">
                {Math.min(page * pageSize, filtered.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-200">
                {filtered.length}
              </span>{" "}
              competitions
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
              >
                Prev
              </button>
              <span className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-gray-200">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-white shadow-[0_25px_80px_rgba(2,6,23,0.6)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Create Competition</h2>
                <p className="mt-1 text-sm text-gray-400">
                  This is a local mock to preview UI. Hook it up to the backend
                  when competition creation is available.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="create-title">
                  Title
                </label>
                <input
                  id="create-title"
                  value={createForm.title}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none focus:border-orange-500/50"
                  placeholder="e.g. Summer Sprint"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="create-description"
                >
                  Description
                </label>
                <textarea
                  id="create-description"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="min-h-[100px] w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none focus:border-orange-500/50"
                  placeholder="Short description"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="create-max">
                    Max Participants
                  </label>
                  <input
                    id="create-max"
                    inputMode="numeric"
                    value={createForm.maxParticipants}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        maxParticipants: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none focus:border-orange-500/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="create-prize">
                    Prize Pool (XLM)
                  </label>
                  <input
                    id="create-prize"
                    inputMode="numeric"
                    value={createForm.prizePoolXlm}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        prizePoolXlm: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="create-vis">
                  Visibility
                </label>
                <select
                  id="create-vis"
                  value={createForm.visibility}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      visibility: e.target.value as CompetitionVisibility,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white outline-none focus:border-orange-500/50"
                >
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreate}
                  className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500/90"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
