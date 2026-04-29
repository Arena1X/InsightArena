"use client";

import { useState } from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import Header from "@/component/Header";
import Footer from "@/component/Footer";

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState("all");

  const tabs = [
    { id: "all", label: "All" },
    { id: "events", label: "Events" },
    { id: "competitions", label: "Competitions" },
    { id: "past", label: "Past" },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-x-hidden">
      {/* Global Network Lines Background */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
        <svg
          className="w-full h-full opacity-15"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient
              id="globalLineGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M100,200 Q300,100 500,200 T900,200"
            stroke="url(#globalLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M200,400 Q400,300 600,400 T1000,400"
            stroke="url(#globalLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M50,600 Q250,500 450,600 T850,600"
            stroke="url(#globalLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M150,800 Q350,700 550,800 T950,800"
            stroke="url(#globalLineGradient)"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>

      <div className="relative z-10">
        <Header />

        <div className="max-w-7xl mx-auto px-6 pt-32 pb-16">
          <div className="space-y-8">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-black to-gray-900 p-12 border border-gray-700/30">
              {/* Background SVG Pattern */}
              <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
                <svg
                  className="w-full h-full opacity-15"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <defs>
                    <linearGradient
                      id="lineGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                      <stop
                        offset="100%"
                        stopColor="#06b6d4"
                        stopOpacity="0.2"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d="M100,200 Q300,100 500,200 T900,200"
                    stroke="url(#lineGradient)"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M200,400 Q400,300 600,400 T1000,400"
                    stroke="url(#lineGradient)"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M50,600 Q250,500 450,600 T850,600"
                    stroke="url(#lineGradient)"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
              </div>

              <div className="relative z-10 text-center">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  Public Events & Competitions
                </h1>
                <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                  Join live trading competitions, connect with top analysts, and
                  win exclusive rewards
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button className="px-8 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition">
                    Browse Events
                  </button>
                  <button className="px-8 py-3 bg-transparent border border-gray-600 text-white font-semibold rounded-xl hover:bg-white/5 transition">
                    View Competitions
                  </button>
                </div>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-[#0f172a] rounded-2xl p-6 border border-gray-700/30">
              <div className="flex flex-col lg:flex-row gap-4 items-center">
                {/* Search Input */}
                <div className="flex-1 w-full relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Search events, competitions..."
                    className="w-full bg-[#1e293b] text-white pl-12 pr-4 py-3 rounded-xl border border-gray-700/50 focus:border-orange-500 focus:outline-none transition"
                  />
                </div>

                {/* Tabs */}
                <div className="flex gap-2 bg-[#1e293b] p-1 rounded-xl">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-6 py-2 rounded-lg font-medium transition ${
                        activeTab === tab.id
                          ? "bg-orange-500 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Filter and Sort */}
                <div className="flex gap-3">
                  <button className="flex items-center gap-2 px-4 py-3 bg-[#1e293b] text-gray-300 rounded-xl border border-gray-700/50 hover:bg-[#2d3b52] transition">
                    <Filter className="h-4 w-4" />
                    Filter
                  </button>
                  <button className="flex items-center gap-2 px-4 py-3 bg-[#1e293b] text-gray-300 rounded-xl border border-gray-700/50 hover:bg-[#2d3b52] transition">
                    Most Popular
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1 — Stellar Prediction Championship */}
              <div className="relative rounded-2xl border border-white/10 bg-[#0f172a] overflow-hidden opacity-75 cursor-not-allowed select-none">
                {/* Coming Soon ribbon */}
                <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                    Coming Soon
                  </span>
                </div>

                {/* Card header gradient */}
                <div className="h-2 w-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600" />

                <div className="p-6 space-y-4">
                  {/* Badge + title */}
                  <div className="space-y-2">
                    <span className="inline-block rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                      Competition
                    </span>
                    <h3 className="text-lg font-bold text-white leading-snug">
                      Stellar Prediction Championship — Season 1
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Compete against the sharpest predictors on InsightArena.
                      Stake XLM on real-world outcomes and climb the global
                      leaderboard to claim your share of the prize pool.
                    </p>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-orange-400">
                        50,000 XLM
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Prize Pool</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-white">—</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Participants
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-[#4FD1C5]">TBA</p>
                      <p className="text-xs text-gray-500 mt-0.5">Start Date</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-600" />
                      <span className="text-xs text-gray-500">
                        Public · All categories
                      </span>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed">
                      Join — Coming Soon
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2 — Crypto Oracle Invitational */}
              <div className="relative rounded-2xl border border-white/10 bg-[#0f172a] overflow-hidden opacity-75 cursor-not-allowed select-none">
                {/* Coming Soon ribbon */}
                <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                    Coming Soon
                  </span>
                </div>

                {/* Card header gradient */}
                <div className="h-2 w-full bg-gradient-to-r from-[#4FD1C5] via-blue-400 to-[#4FD1C5]" />

                <div className="p-6 space-y-4">
                  {/* Badge + title */}
                  <div className="space-y-2">
                    <span className="inline-block rounded-full bg-[#4FD1C5]/10 border border-[#4FD1C5]/20 px-2.5 py-0.5 text-xs font-semibold text-[#4FD1C5]">
                      Event
                    </span>
                    <h3 className="text-lg font-bold text-white leading-snug">
                      Crypto Oracle Invitational — Q3 2026
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      An invite-only prediction event focused exclusively on
                      crypto markets. Top performers from the global leaderboard
                      will receive invitations when the season opens.
                    </p>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-[#4FD1C5]">
                        25,000 XLM
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Prize Pool</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-white">100</p>
                      <p className="text-xs text-gray-500 mt-0.5">Max Spots</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                      <p className="text-base font-bold text-[#4FD1C5]">
                        Q3 2026
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Start Date</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-600" />
                      <span className="text-xs text-gray-500">
                        Invite Only · Crypto
                      </span>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed">
                      Join — Coming Soon
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
