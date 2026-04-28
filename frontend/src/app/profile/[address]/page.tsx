"use client";

import { useMemo, useState } from "react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

type PublicPrediction = {
  id: string;
  market: string;
  outcome: string;
  stake: string;
  result: "Won" | "Lost" | "Pending";
};

type MarketCreated = {
  id: string;
  title: string;
  status: "Open" | "Resolved" | "Cancelled";
};

type ProfilePageProps = {
  params: {
    address: string;
  };
};

export default function PublicProfilePage({ params }: ProfilePageProps) {
  const address = decodeURIComponent(params.address || "");

  const displayName = useMemo(() => {
    const trimmed = address.trim();
    if (!trimmed) return "Unknown";
    if (trimmed.length <= 16) return trimmed;
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`;
  }, [address]);

  const initials = useMemo(() => {
    const cleaned = displayName.replace(/[^a-z0-9]/gi, "");
    return (cleaned.slice(0, 2) || "IA").toUpperCase();
  }, [displayName]);

  const joinedDate = "Jan 2026";

  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const stats = [
    { label: "Total Predictions", value: "312" },
    { label: "Win Rate", value: "58%" },
    { label: "Reputation Score", value: "2,045" },
    { label: "Total Winnings", value: "3,820 XLM" },
  ] as const;

  const achievements = [
    { label: "Early Adopter", unlocked: true },
    { label: "Streak Builder", unlocked: true },
    { label: "Top 10%", unlocked: false },
    { label: "Market Maker", unlocked: true },
    { label: "Season Champion", unlocked: false },
    { label: "Community Curator", unlocked: false },
  ] as const;

  const predictions: PublicPrediction[] = [
    {
      id: "pred-1",
      market: "Will XLM reach $0.30 by end of month?",
      outcome: "Yes",
      stake: "40 XLM",
      result: "Pending",
    },
    {
      id: "pred-2",
      market: "BTC above $100k by year end?",
      outcome: "No",
      stake: "25 XLM",
      result: "Won",
    },
    {
      id: "pred-3",
      market: "ETH ETF approval this quarter",
      outcome: "Yes",
      stake: "60 XLM",
      result: "Lost",
    },
  ];

  const marketsCreated: MarketCreated[] = [
    { id: "mc-1", title: "Stellar TVL weekly change", status: "Open" },
    { id: "mc-2", title: "XLM quarterly close range", status: "Resolved" },
    { id: "mc-3", title: "Top ecosystem announcement this month", status: "Open" },
  ];

  const statusStyles: Record<MarketCreated["status"], string> = {
    Open: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
    Resolved: "bg-sky-500/10 text-sky-200 border-sky-500/30",
    Cancelled: "bg-rose-500/10 text-rose-200 border-rose-500/30",
  };

  const predictionResultStyles: Record<PublicPrediction["result"], string> = {
    Won: "text-emerald-300",
    Lost: "text-rose-300",
    Pending: "text-gray-300",
  };

  return (
    <PageBackground>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-lg font-bold text-orange-200">
                {initials}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {displayName}
                </h1>
                <p className="text-sm text-[#94a3b8]">Joined {joinedDate}</p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200">
                    {address}
                  </code>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/10"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-black/20 p-6"
              >
                <p className="text-sm text-[#94a3b8]">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold text-orange-300">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
            <h2 className="text-2xl font-semibold">Achievement Badges</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Unlocked achievements show progress and community participation.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.label}
                  className={[
                    "rounded-2xl border p-4 text-center text-sm font-semibold",
                    achievement.unlocked
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-gray-500",
                  ].join(" ")}
                >
                  {achievement.label}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
            <h2 className="text-2xl font-semibold">Markets Created</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Public markets created by this address (placeholder data).
            </p>

            <div className="mt-6 space-y-3">
              {marketsCreated.map((market) => (
                <div
                  key={market.id}
                  className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-medium text-white">
                    {market.title}
                  </p>
                  <span
                    className={[
                      "inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold",
                      statusStyles[market.status],
                    ].join(" ")}
                  >
                    {market.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
          <h2 className="text-2xl font-semibold">Recent Predictions</h2>
          <p className="mt-2 text-sm text-[#94a3b8]">
            The latest 10 public predictions (showing sample rows).
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wide text-[#94a3b8]">
                <tr>
                  <th scope="col" className="px-5 py-4">
                    Market
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Outcome
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Stake
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0b1020]/40">
                {predictions.map((prediction) => (
                  <tr key={prediction.id} className="hover:bg-white/5">
                    <td className="px-5 py-4 text-white">{prediction.market}</td>
                    <td className="px-5 py-4 text-gray-200">
                      {prediction.outcome}
                    </td>
                    <td className="px-5 py-4 text-gray-200">
                      {prediction.stake}
                    </td>
                    <td
                      className={[
                        "px-5 py-4 font-semibold",
                        predictionResultStyles[prediction.result],
                      ].join(" ")}
                    >
                      {prediction.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}

