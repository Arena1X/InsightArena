"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown } from "lucide-react";
import EventCard, { CreatorEventStatus } from "@/component/creator-events/EventCard";
import { Button } from "@/component/ui/button";

interface CreatorEvent {
  id: string;
  title: string;
  description: string;
  creator: string;
  matchesCount: number;
  participants: number;
  maxParticipants: number;
  status: CreatorEventStatus;
  endsAt: string;
  joined: boolean;
  createdAt: string;
  category?: string;
  bannerUrl?: string;
}

const eventData: CreatorEvent[] = [
  {
    id: "event-001",
    title: "Apollo Tournament",
    description: "Invite-only prediction tournament across multiple creator matches.",
    creator: "GCF5T...9V2H",
    matchesCount: 4,
    participants: 72,
    maxParticipants: 100,
    status: "Active",
    endsAt: "Jun 4, 2026",
    joined: true,
    createdAt: "2026-05-18",
    category: "Football",
    bannerUrl: "/creator-events/apollo-banner.jpg",
  },
  {
    id: "event-002",
    title: "Season Finale Challenge",
    description: "Final creator event with exclusive insights and milestone rewards.",
    creator: "GAB7W...2CPL",
    matchesCount: 3,
    participants: 48,
    maxParticipants: 50,
    status: "Completed",
    endsAt: "May 12, 2026",
    joined: false,
    createdAt: "2026-05-06",
    category: "Crypto",
    bannerUrl: "/creator-events/finals-banner.jpg",
  },
  {
    id: "event-003",
    title: "Rising Stars Invite",
    description: "Small-group prediction event for emerging creators and active supporters.",
    creator: "GCT2L...45QZ",
    matchesCount: 5,
    participants: 18,
    maxParticipants: 20,
    status: "Active",
    endsAt: "Jun 14, 2026",
    joined: false,
    createdAt: "2026-05-22",
    category: "Football",
    bannerUrl: "/creator-events/rising-stars-banner.jpg",
  },
  {
    id: "event-004",
    title: "Insight Arena Private Cup",
    description: "An invite-only series of prediction battles with high participation demand.",
    creator: "GDR8N...1BWE",
    matchesCount: 6,
    participants: 100,
    maxParticipants: 100,
    status: "Cancelled",
    endsAt: "May 29, 2026",
    joined: false,
    createdAt: "2026-05-09",
    category: "Esports",
  },
];

const statusOptions: Array<{ label: string; value: CreatorEventStatus | "All" }> = [
  { label: "All", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Completed", value: "Completed" },
  { label: "Cancelled", value: "Cancelled" },
];

const sortOptions = [
  { label: "Newest", value: "newest" },
  { label: "Most Participants", value: "participants" },
  { label: "Ending Soon", value: "ending" },
] as const;

const ALL_CATEGORIES = "All";

function deriveCategories(events: CreatorEvent[]): string[] {
  const seen = new Set<string>();
  for (const event of events) {
    if (event.category) seen.add(event.category);
  }
  return Array.from(seen).sort();
}

export default function CreatorEventsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<CreatorEventStatus | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [sortKey, setSortKey] = useState<typeof sortOptions[number]["value"]>("newest");

  const categories = useMemo(() => deriveCategories(eventData), []);

  const visibleEvents = useMemo(() => {
    const filtered = eventData.filter((event) => {
      const matchesTitle = event.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "All" || event.status === statusFilter;
      const matchesCategory =
        categoryFilter === ALL_CATEGORIES || event.category === categoryFilter;
      return matchesTitle && matchesStatus && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "participants") {
        return b.participants - a.participants;
      }
      if (sortKey === "ending") {
        return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [searchTerm, statusFilter, categoryFilter, sortKey]);

  const totalActiveEvents = eventData.filter((event) => event.status === "Active").length;
  const totalParticipants = eventData.reduce((sum, event) => sum + event.participants, 0);
  const joinedEventsCount = eventData.filter((event) => event.joined).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
          <div className="grid gap-8 lg:grid-cols-[1.8fr_1fr] lg:items-center">
            <div className="space-y-5">
              <p className="uppercase tracking-[0.3em] text-xs text-amber-300/80">Creator Events</p>
              <h1 className="text-4xl font-semibold sm:text-5xl">Join invite-only prediction events</h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300">
                Browse curated creator-hosted prediction events, join your favorites, and monitor activity across multiple matches.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Active events</p>
                <p className="mt-3 text-3xl font-semibold text-white">{totalActiveEvents}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Total participants</p>
                <p className="mt-3 text-3xl font-semibold text-white">{totalParticipants}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Your joined events</p>
                <p className="mt-3 text-3xl font-semibold text-white">{joinedEventsCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <label htmlFor="event-search" className="sr-only">Search events</label>
              <input
                id="event-search"
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by event title"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 py-3 pl-12 pr-4 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={statusFilter === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(option.value)}
                    className="rounded-full border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.18em]"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="relative inline-flex items-center rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-2 text-sm text-slate-300">
                <span className="mr-3 text-xs uppercase tracking-[0.24em] text-slate-500">Sort</span>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as typeof sortOptions[number]["value"])}
                  className="appearance-none bg-transparent pr-8 text-sm font-semibold text-white outline-none"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Category filter row */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-slate-900/80 px-6 py-4 shadow-xl shadow-black/20">
              <span className="mr-1 text-xs uppercase tracking-[0.22em] text-slate-500">Category</span>
              <Button
                key={ALL_CATEGORIES}
                variant={categoryFilter === ALL_CATEGORIES ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(ALL_CATEGORIES)}
                className="rounded-full border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategoryFilter(cat)}
                  className="rounded-full border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.18em]"
                >
                  {cat}
                </Button>
              ))}
            </div>
          )}

          {visibleEvents.length > 0 ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {visibleEvents.map((event) => (
                <EventCard
                  key={event.id}
                  title={event.title}
                  description={event.description}
                  creator={event.creator}
                  matchesCount={event.matchesCount}
                  participants={event.participants}
                  maxParticipants={event.maxParticipants}
                  status={event.status}
                  endsAt={event.endsAt}
                  joined={event.joined}
                  category={event.category}
                  bannerUrl={event.bannerUrl}
                  onViewDetails={() => router.push(`/creator-events/${event.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/20 bg-slate-900/80 p-12 text-center text-slate-300">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-300/80">No events available</p>
              <h2 className="mt-4 text-3xl font-semibold text-white">Looks like there are no creator events yet.</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-400">
                Creator events are invite-only, multi-match competitions. Create a new event to invite users and start an exclusive prediction series.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:justify-center">
                <Button className="rounded-full px-8 py-3" variant="default">Create event</Button>
                <Button className="rounded-full px-8 py-3" variant="outline">Learn more</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
