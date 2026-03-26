"use client";

import { CompetitionCard, ICompetition } from "@/component/competitions/CompetitionCard";
import { ChevronDown } from "lucide-react";

// Mock Data based on Acceptance Criteria
const MOCK_COMPETITIONS: ICompetition[] = [
  {
    id: "comp_1",
    tag: "Crypto",
    prizePool: 100000,
    title: "Quarterly Trading Championship",
    features: ["Max leverage 10x", "Live updates", "Portfolio > $1,000"],
    currentParticipants: 125,
    maxParticipants: 500,
    // Set exactly 12 days, 8 hours, 45 mins from now for the demo
    endTime: new Date(Date.now() + 1075500000).toISOString(), 
  },
  {
    id: "comp_2",
    tag: "Web3",
    prizePool: 25000,
    title: "DeFi Yield Farming Sprint",
    features: ["DEX integration only", "No minimum portfolio", "Weekly snapshot"],
    currentParticipants: 450,
    maxParticipants: 1000,
    endTime: new Date(Date.now() + 432000000).toISOString(), 
  },
];

export default function CompetitionsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      {/* Featured Block Placeholder */}
      <div className="mb-12 h-48 w-full rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500">
        Featured Block Placeholder
      </div>

      {/* Header Section */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-black tracking-tight text-white">
          Open Competitions
        </h1>
        
        {/* Sort Dropdown Simulator */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-[#0a0a0a] px-4 py-2 text-sm text-gray-300 hover:bg-gray-900 cursor-pointer transition-colors">
          <span>Sort by: <span className="text-white font-medium">Time left</span></span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* 2-Column Grid / Masonry Layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
        {MOCK_COMPETITIONS.map((competition) => (
          <CompetitionCard key={competition.id} competition={competition} />
        ))}
      </div>
    </div>
  );
}