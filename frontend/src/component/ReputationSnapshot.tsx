import React from "react";
import { Trophy, Zap, TrendingUp } from "lucide-react";


export default function ReputationSnapshot() {
  const score = 840;
  const progressPercent = 84; 

  return (
    <div className="bg-[#242b3d] rounded-2xl p-6 md:p-8 w-full border border-white/5 relative shadow-lg mb-6">
      <h2 className="text-2xl font-semibold text-white mb-6">Reputation Snapshot</h2>
      
      <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
        {/* Left Side: Avatar and Tier Pill */}
        <div className="flex flex-col items-center shrink-0">
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-[#399a96] flex items-center justify-center shadow-lg border-4 border-[#242b3d]">
            <span className="text-white text-5xl md:text-6xl font-bold tracking-tight">A</span>
          </div>
          <div className="mt-4 bg-[#e5b962] text-black text-sm font-bold px-4 py-1.5 rounded-full shadow-md">
            Gold Predictor
          </div>
        </div>

        {/* Right Side: Metrics and Progress */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[#8b95a5] text-xs font-semibold tracking-wider uppercase mb-1">Reputation Score</p>
              <div className="text-white text-5xl md:text-6xl font-bold tracking-tight">{score}</div>
            </div>
            <div className="text-right">
              <p className="text-[#8b95a5] text-xs font-semibold tracking-wider uppercase mb-1">Tier</p>
              <div className="flex items-center gap-2 text-white text-xl md:text-2xl font-bold">
                <Trophy className="w-5 h-5 text-[#e5b962] fill-[#e5b962]" />
                Gold
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-[#8b95a5] text-sm mb-2 font-medium">100 to next tier</p>
            {/* Custom Progress Bar */}
            <div className="w-full h-2 rounded-full bg-[#1b2131] overflow-hidden">
              <div 
                className="h-full bg-[#399a96] rounded-full" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
            {/* Bottom Row Metrics */}
            <div>
              <p className="text-[#8b95a5] text-xs font-semibold tracking-wider uppercase mb-2">Current Streak</p>
              <div className="flex items-baseline gap-2">
                <div className="flex items-center gap-1.5 text-white text-3xl font-bold">
                  <Zap className="w-6 h-6 text-[#e5b962] fill-[#e5b962]" /> 
                  5
                </div>
                <span className="text-[#8b95a5] text-sm font-medium">correct in a row</span>
              </div>
            </div>
            <div>
              <p className="text-[#8b95a5] text-xs font-semibold tracking-wider uppercase mb-2">Correct Predictions</p>
              <div className="flex items-baseline gap-2">
                <div className="text-white text-3xl font-bold">87</div>
                <span className="text-[#8b95a5] text-sm font-medium">of 128 total</span>
              </div>
            </div>
          </div>

          {/* Bottom Tags */}
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2c3449] border border-white/5 shadow-sm">
              <Trophy className="w-4 h-4 text-[#399a96]" />
              <span className="text-xs font-medium text-[#c4cad4]">Top 50 Global</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2c3449] border border-white/5 shadow-sm">
              <Zap className="w-4 h-4 text-[#e5b962]" />
              <span className="text-xs font-medium text-[#c4cad4]">Fast Mover</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2c3449] border border-white/5 shadow-sm">
              <TrendingUp className="w-4 h-4 text-[#399a96]" />
              <span className="text-xs font-medium text-[#c4cad4]">Data Driven</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
