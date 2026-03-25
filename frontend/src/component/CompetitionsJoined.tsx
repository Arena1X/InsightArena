"use client";

import { ChevronRight } from "lucide-react";

interface Competition {
  id: string;
  title: string;
  visibility: "Public" | "Private";
  rank: number;
  totalParticipants: number;
  prizePool: string;
  timeRemaining: string;
  progressPercentage: number; // 0-100 for season progress
}

// Mock data matching the Figma design exactly
const mockCompetitions: Competition[] = [
  {
    id: "1",
    title: "Weekend Market Clash",
    visibility: "Public",
    rank: 8,
    totalParticipants: 247,
    prizePool: "$2,500 pool",
    timeRemaining: "2d 14h remaining",
    progressPercentage: 65,
  },
  {
    id: "2", 
    title: "BTC Traders League",
    visibility: "Private",
    rank: 3,
    totalParticipants: 45,
    prizePool: "$850 pool",
    timeRemaining: "5d 8h remaining",
    progressPercentage: 40,
  },
  {
    id: "3",
    title: "Friends Prediction Room",
    visibility: "Private", 
    rank: 1,
    totalParticipants: 12,
    prizePool: "$200 pool",
    timeRemaining: "1d 2h remaining",
    progressPercentage: 85,
  },
];

export default function CompetitionsJoined() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-xl">Competitions Joined</h2>
        <button className="flex items-center gap-1 text-[#4FD1C5] text-sm font-medium hover:text-[#72ddd3] transition">
          View All Competitions
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Competitions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCompetitions.map((competition) => (
          <div
            key={competition.id}
            className="bg-[#2a3441] rounded-2xl p-6 hover:bg-[#2f3a48] transition-colors cursor-pointer"
          >
            {/* Visibility Tag */}
            <div className="mb-4">
              <span className="text-gray-400 text-sm font-medium">
                {competition.visibility}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-white font-semibold text-lg mb-6 leading-tight">
              {competition.title}
            </h3>

            {/* Rank Display - Huge Typography */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-bold text-white">
                #{competition.rank}
              </span>
              <span className="text-lg text-gray-400 mb-2">
                of {competition.totalParticipants}
              </span>
            </div>

            {/* Participants Subtext */}
            <p className="text-gray-400 text-sm mb-6">
              {competition.totalParticipants} participants
            </p>

            {/* Prize Pool with Trophy Icon */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-500 text-lg">🏆</span>
              <span className="text-yellow-500 text-sm font-medium">
                {competition.prizePool}
              </span>
            </div>

            {/* Time Remaining */}
            <p className="text-gray-400 text-sm mb-4">
              {competition.timeRemaining}
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-gray-600/30 rounded-full h-2">
              <div
                className="bg-[#4FD1C5] h-2 rounded-full transition-all duration-300"
                style={{ width: `${competition.progressPercentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}