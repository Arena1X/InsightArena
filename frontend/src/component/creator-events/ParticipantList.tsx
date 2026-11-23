"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search, WalletCards } from "lucide-react";
import { Badge } from "@/component/ui/badge";
import { useDebounce } from "@/hooks/useDebounce";

export interface EventParticipantRow {
  address: string;
  joinedAt: string;
  correctPredictions: number;
  totalMatches: number;
}

interface ParticipantListProps {
  participants: EventParticipantRow[];
  /** Wallet address of the event's creator, badged as "Creator". */
  creatorAddress?: string | null;
  /** Wallet address(es) acting as oracle for this event, badged as "Oracle". */
  oracleAddresses?: string[];
  /** The connected wallet's address, badged as "You". */
  currentUserAddress?: string | null;
}

/** Rows beyond this count are windowed instead of rendered all at once. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) used for virtualization math; matches the row's padding/line-height. */
const ROW_HEIGHT_PX = 65;
/** Max height (px) of the scroll viewport once virtualization kicks in. */
const VIRTUALIZED_VIEWPORT_PX = 480;
/** Extra rows rendered above/below the visible window to avoid blank flashes while scrolling. */
const OVERSCAN_ROWS = 6;

function matchesQuery(participant: EventParticipantRow, query: string): boolean {
  return participant.address.toLowerCase().includes(query.toLowerCase());
}

interface RoleBadgesProps {
  isCreator: boolean;
  isOracle: boolean;
  isYou: boolean;
}

function RoleBadges({ isCreator, isOracle, isYou }: RoleBadgesProps) {
  if (!isCreator && !isOracle && !isYou) return null;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {isCreator && (
        <Badge variant="warning" className="uppercase tracking-wide">
          Creator
        </Badge>
      )}
      {isOracle && (
        <Badge variant="secondary" className="uppercase tracking-wide">
          Oracle
        </Badge>
      )}
      {isYou && (
        <Badge variant="success" className="uppercase tracking-wide">
          You
        </Badge>
      )}
    </span>
  );
}

interface ParticipantRowProps {
  participant: EventParticipantRow;
  creatorAddress?: string | null;
  oracleAddresses: string[];
  currentUserAddress?: string | null;
  style?: React.CSSProperties;
}

function ParticipantRow({
  participant,
  creatorAddress,
  oracleAddresses,
  currentUserAddress,
  style,
}: ParticipantRowProps) {
  const isCreator = Boolean(
    creatorAddress && participant.address === creatorAddress,
  );
  const isOracle = oracleAddresses.includes(participant.address);
  const isYou = Boolean(
    currentUserAddress && participant.address === currentUserAddress,
  );

  return (
    <div
      style={style}
      className="grid grid-cols-[1.6fr_1fr_0.8fr] gap-4 px-5 py-4 text-sm text-slate-300"
      data-testid="participant-row"
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-white">
          <WalletCards className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="truncate">{participant.address}</span>
        </span>
        <RoleBadges isCreator={isCreator} isOracle={isOracle} isYou={isYou} />
      </span>
      <span className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        {new Date(participant.joinedAt).toLocaleDateString()}
      </span>
      <span className="text-right font-semibold text-emerald-200">
        {participant.correctPredictions} / {participant.totalMatches}
      </span>
    </div>
  );
}

export default function ParticipantList({
  participants,
  creatorAddress,
  oracleAddresses = [],
  currentUserAddress,
}: ParticipantListProps) {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 250);
  const [scrollTop, setScrollTop] = useState(0);

  const filteredParticipants = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) return participants;
    return participants.filter((participant) => matchesQuery(participant, query));
  }, [participants, debouncedSearch]);

  if (participants.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 p-8 text-center text-slate-400">
        No participants have joined this event yet.
      </div>
    );
  }

  const shouldVirtualize = filteredParticipants.length > VIRTUALIZE_THRESHOLD;

  let visibleParticipants = filteredParticipants;
  let topSpacerPx = 0;
  let bottomSpacerPx = 0;

  if (shouldVirtualize) {
    const firstVisibleIndex = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS,
    );
    const visibleRowCount =
      Math.ceil(VIRTUALIZED_VIEWPORT_PX / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
    const lastVisibleIndex = Math.min(
      filteredParticipants.length,
      firstVisibleIndex + visibleRowCount,
    );

    visibleParticipants = filteredParticipants.slice(
      firstVisibleIndex,
      lastVisibleIndex,
    );
    topSpacerPx = firstVisibleIndex * ROW_HEIGHT_PX;
    bottomSpacerPx = (filteredParticipants.length - lastVisibleIndex) * ROW_HEIGHT_PX;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/20">
      <div className="border-b border-white/10 px-5 py-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by wallet address"
            aria-label="Search participants by wallet address"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white outline-none ring-orange-500/40 placeholder:text-slate-500 focus:ring"
          />
        </label>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr_0.8fr] gap-4 border-b border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <span>Wallet address</span>
        <span>Join date</span>
        <span className="text-right">Score</span>
      </div>

      {filteredParticipants.length === 0 ? (
        <div
          className="p-8 text-center text-slate-400"
          data-testid="participant-no-results"
        >
          No participants match &ldquo;{debouncedSearch.trim()}&rdquo;.
        </div>
      ) : shouldVirtualize ? (
        <div
          className="divide-y divide-white/10 overflow-y-auto"
          style={{ maxHeight: VIRTUALIZED_VIEWPORT_PX }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          data-testid="participant-virtualized-viewport"
        >
          {topSpacerPx > 0 && (
            <div style={{ height: topSpacerPx }} aria-hidden="true" />
          )}
          {visibleParticipants.map((participant) => (
            <ParticipantRow
              key={participant.address}
              participant={participant}
              creatorAddress={creatorAddress}
              oracleAddresses={oracleAddresses}
              currentUserAddress={currentUserAddress}
            />
          ))}
          {bottomSpacerPx > 0 && (
            <div style={{ height: bottomSpacerPx }} aria-hidden="true" />
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {filteredParticipants.map((participant) => (
            <ParticipantRow
              key={participant.address}
              participant={participant}
              creatorAddress={creatorAddress}
              oracleAddresses={oracleAddresses}
              currentUserAddress={currentUserAddress}
            />
          ))}
        </div>
      )}
    </div>
  );
}
