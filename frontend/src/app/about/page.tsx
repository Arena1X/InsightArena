import Link from "next/link";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

type StatCard = {
  label: string;
  value: string;
};

export default function AboutPage() {
  const stats: StatCard[] = [
    { label: "Total Markets", value: "1,284" },
    { label: "Total Volume", value: "642,900 XLM" },
    { label: "Active Users", value: "18,450" },
    { label: "Seasons Completed", value: "7" },
  ];

  const communityLinks = [
    { label: "Telegram", href: "#" },
    { label: "Twitter", href: "#" },
    { label: "Discord", href: "#" },
    { label: "GitHub", href: "https://github.com/Arena1X/InsightArena" },
  ];

  const stack = [
    {
      title: "Stellar Network",
      description: "Fast, low-fee settlement for global participation.",
    },
    {
      title: "Soroban Smart Contracts",
      description: "On-chain logic for verifiable markets and payouts.",
    },
    {
      title: "Next.js Frontend",
      description: "A modern app-router UI optimized for real-time UX.",
    },
    {
      title: "NestJS Backend",
      description: "Typed APIs and services powering the platform layer.",
    },
  ];

  const features = [
    {
      title: "Transparent Markets",
      description:
        "Open, auditable markets where rules and outcomes are clear to everyone.",
    },
    {
      title: "Fair Payouts",
      description:
        "Deterministic settlement designed to keep incentives aligned and predictable.",
    },
    {
      title: "Community Governance",
      description:
        "A community-driven roadmap and market curation model as the platform evolves.",
    },
  ];

  return (
    <PageBackground>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-32 pb-20 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-12">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#4FD1C5]">
            About
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            InsightArena
          </h1>
          <p className="mt-4 max-w-3xl text-base text-[#94a3b8] sm:text-lg">
            The premier decentralized prediction market on Stellar. We build a
            place where anyone can make informed predictions, compete on
            leaderboards, and settle outcomes with confidence.
          </p>
          <p className="mt-4 max-w-3xl text-base text-[#94a3b8] sm:text-lg">
            Our mission is to make forecasting accessible, transparent, and
            community-owned—so markets can reward insight, not gatekeeping.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-black/20 p-6"
              >
                <h2 className="text-lg font-semibold">{feature.title}</h2>
                <p className="mt-2 text-sm text-[#94a3b8]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
            <h2 className="text-2xl font-semibold">Technology Stack</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              A pragmatic set of tools that prioritize security, performance,
              and developer experience.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {stack.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-[#94a3b8]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
            <h2 className="text-2xl font-semibold">Platform Stats</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Snapshot metrics (placeholder values).
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
          </div>
        </section>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur sm:p-10">
          <h2 className="text-2xl font-semibold">Community</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#94a3b8]">
            Join the conversation, contribute ideas, and help build the future
            of decentralized prediction markets.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {communityLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10"
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-gradient-to-r from-orange-500/15 via-sky-500/10 to-emerald-500/10 p-8 backdrop-blur sm:p-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Ready to start?</h2>
              <p className="mt-2 text-sm text-[#d8dee9]">
                Browse active markets and place your first prediction.
              </p>
            </div>
            <Link
              href="/markets"
              className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500/90"
            >
              Start Predicting
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}

