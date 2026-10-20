"use client";

import { useState } from "react";

const platformStats = [
  { label: "Total XLM Staked", value: "2.35M", suffix: "XLM" },
  { label: "Daily Active Users", value: "1.2K" },
  { label: "Weekly Active Users", value: "5.8K" },
  { label: "Monthly Active Users", value: "18.4K" },
];

const marketTally = [
  { label: "Active Markets", value: "42" },
  { label: "Pending Review", value: "8" },
  { label: "Resolved Markets", value: "119" },
  { label: "Disputed Markets", value: "6" },
];

export default function AdminDashboardPage() {
  const [isAnnouncementEnabled, setIsAnnouncementEnabled] = useState(true);
  const [isMaintenanceEnabled, setIsMaintenanceEnabled] = useState(false);

  return (
    <section className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-slate-950/90 p-8 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400/90">Admin Overview</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Platform statistics</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Monitor key health metrics across the InsightArena ecosystem and manage
              announcements or maintenance workflows from one place.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsAnnouncementEnabled((current) => !current)}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                isAnnouncementEnabled
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-white/5 text-gray-200 hover:bg-white/10"
              }`}
            >
              {isAnnouncementEnabled ? "Announcement On" : "Announcement Off"}
            </button>
            <button
              type="button"
              onClick={() => setIsMaintenanceEnabled((current) => !current)}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                isMaintenanceEnabled
                  ? "bg-amber-500 text-slate-950"
                  : "bg-white/5 text-gray-200 hover:bg-white/10"
              }`}
            >
              {isMaintenanceEnabled ? "Maintenance Mode" : "Live Mode"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {platformStats.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm"
              >
                <p className="text-sm uppercase tracking-[0.26em] text-gray-500">{item.label}</p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {item.value}
                  {item.suffix ? <span className="ml-2 text-base text-gray-400">{item.suffix}</span> : null}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-gray-500">Market health</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Market tallies</h2>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-gray-300">
                Updated just now
              </span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {marketTally.map((item) => (
                <div
                  key={item.label}
                  className="rounded-3xl bg-slate-950/70 p-5 text-white/90"
                >
                  <p className="text-sm text-gray-400">{item.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.28em] text-gray-500">Announcements</p>
            <p className="mt-4 text-sm leading-6 text-gray-300">
              {isAnnouncementEnabled
                ? "Announcements are live. Users will see the latest platform updates in the global banner."
                : "Announcements are currently paused. No banner will be displayed to users."}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.28em] text-gray-500">Maintenance alerts</p>
            <p className="mt-4 text-sm leading-6 text-gray-300">
              {isMaintenanceEnabled
                ? "Maintenance mode is enabled. Trading and market creation can be restricted during scheduled maintenance windows."
                : "Platform is running normally. No maintenance banners are currently active."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
