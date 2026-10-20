"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CreateMarketForm from "@/component/markets/CreateMarketForm";

export default function CreateMarketPage() {
  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-sm text-slate-400"
        >
          <Link href="/my-markets" className="transition hover:text-white">
            Markets
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Create Market</span>
        </nav>

        {/* Header */}
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80">
            Market Maker
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Create a Prediction Market</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">
            Set up a new on-chain prediction market. Define your question, resolution
            criteria, staking limits, and creator fee in four steps.
          </p>
        </div>

        <CreateMarketForm />
      </div>
    </div>
  );
}
