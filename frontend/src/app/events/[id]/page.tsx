"use client";

import { useEffect, useMemo, useState } from "react";
import PrizePoolSummary from "@/component/PrizePoolSummary";
import { useWallet } from "@/context/WalletContext";
import {
  claimPayout,
  finalizeEvent,
  getUserPayout,
  type UserPayout,
} from "@/lib/eventRewards";

type EventStatus = "Active" | "Upcoming" | "Ended" | "Cancelled";

type EventDetails = {
  id: string;
  title: string;
  description: string;
  status: EventStatus;
  prizePoolXlm: number;
  participants: number;
  maxParticipants: number;
  startsAt: string;
  endsAt: string;
  isFinalized: boolean;
  rewardBreakdown: { label: string; amountXlm: number; percentage: number }[];
};

const demoEvents: Record<string, EventDetails> = {
  "season-1-finals": {
    id: "season-1-finals",
    title: "Season 1 Finals",
    description:
      "A leaderboard-based event for top predictors competing across the final Season 1 markets.",
    status: "Ended",
    prizePoolXlm: 8000,
    participants: 256,
    maxParticipants: 256,
    startsAt: "2026-03-01T00:00:00.000Z",
    endsAt: "2026-03-31T23:59:59.000Z",
    isFinalized: false,
    rewardBreakdown: [
      { label: "1st place", amountXlm: 4000, percentage: 50 },
      { label: "2nd place", amountXlm: 2400, percentage: 30 },
      { label: "3rd place", amountXlm: 1600, percentage: 20 },
    ],
  },
};

function getFallbackEvent(id: string): EventDetails {
  return {
    id,
    title: "Creator Event",
    description:
      "Make predictions, follow the leaderboard, and compete for XLM prizes in this creator-hosted event.",
    status: "Active",
    prizePoolXlm: 2500,
    participants: 42,
    maxParticipants: 200,
    startsAt: "2026-04-01T00:00:00.000Z",
    endsAt: "2026-04-30T23:59:59.000Z",
    isFinalized: false,
    rewardBreakdown: [
      { label: "1st place", amountXlm: 1250, percentage: 50 },
      { label: "2nd place", amountXlm: 750, percentage: 30 },
      { label: "3rd place", amountXlm: 500, percentage: 20 },
    ],
  };
}

export default function EventDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const { address } = useWallet();
  const [event, setEvent] = useState<EventDetails>(
    demoEvents[params.id] ?? getFallbackEvent(params.id),
  );
  const [userPayout, setUserPayout] = useState<UserPayout | null>(null);
  const [pendingAction, setPendingAction] = useState<"finalize" | "claim" | null>(
    null,
  );

  const endsAtHasPassed = useMemo(
    () => new Date(event.endsAt).getTime() <= Date.now(),
    [event.endsAt],
  );
  const canFinalizeEvent =
    !event.isFinalized && endsAtHasPassed && event.status !== "Cancelled";
  const canClaimPrize =
    event.isFinalized && Boolean(userPayout) && !userPayout?.claimed;

  useEffect(() => {
    if (!address || !event.isFinalized) {
      setUserPayout(null);
      return;
    }

    getUserPayout(event.id, address)
      .then(setUserPayout)
      .catch(() => setUserPayout(null));
  }, [address, event.id, event.isFinalized]);

  async function onFinalizeEvent() {
    setPendingAction("finalize");
    try {
      await finalizeEvent(event.id);
      setEvent((current) => ({
        ...current,
        isFinalized: true,
        status: "Ended",
      }));
    } finally {
      setPendingAction(null);
    }
  }

  async function onClaimPrize() {
    if (!address) return;

    setPendingAction("claim");
    try {
      const payout = await claimPayout(event.id, address);
      setUserPayout({ ...payout, claimed: true });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-200">
              {event.status}
            </span>
            <h1 className="text-3xl font-bold">{event.title}</h1>
            <p className="max-w-3xl text-sm leading-6 text-gray-400">
              {event.description}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
            <p>
              <span className="text-gray-500">Participants:</span>{" "}
              {event.participants}/{event.maxParticipants}
            </p>
            <p className="mt-2">
              <span className="text-gray-500">Ends:</span>{" "}
              {new Date(event.endsAt).toLocaleString()}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur">
          <h2 className="text-xl font-semibold">Event Details</h2>
          <p className="mt-2 text-sm text-gray-400">
            Review the event timeline and use the action bar once the event is
            ready to finalize or when a finalized event has a wallet payout to
            claim.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Starts At
              </p>
              <p className="mt-1 font-medium">
                {new Date(event.startsAt).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Ends At
              </p>
              <p className="mt-1 font-medium">
                {new Date(event.endsAt).toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <PrizePoolSummary
            prizePoolXlm={event.prizePoolXlm}
            rewardBreakdown={event.rewardBreakdown}
          />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Actions
            </h2>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10"
              >
                Make Predictions
              </button>

              {canFinalizeEvent ? (
                <button
                  type="button"
                  onClick={onFinalizeEvent}
                  disabled={pendingAction === "finalize"}
                  className="w-full rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500/90 disabled:cursor-wait disabled:opacity-70"
                >
                  {pendingAction === "finalize" ? "Finalizing…" : "Finalize Event"}
                </button>
              ) : null}

              {canClaimPrize ? (
                <button
                  type="button"
                  onClick={onClaimPrize}
                  disabled={pendingAction === "claim"}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500/90 disabled:cursor-wait disabled:opacity-70"
                >
                  {pendingAction === "claim"
                    ? "Claiming…"
                    : `Claim Prize · ${userPayout?.amountXlm.toLocaleString()} XLM`}
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
