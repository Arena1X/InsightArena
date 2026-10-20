"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CreateEventForm from "@/component/creator-events/CreateEventForm";

export default function CreateCreatorEventPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-slate-400">
          <Link href="/creator-events" className="transition hover:text-white">
            Creator Events
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Create Event</span>
        </nav>

        {/* Header */}
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
          <p className="uppercase tracking-[0.3em] text-xs text-amber-300/80">
            Creator Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Create a New Event</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">
            Set up an invite-only prediction event. A one-time XLM creation fee is charged when
            the event is published on-chain.
          </p>
        </div>

        <CreateEventForm />
      </div>
    </div>
  );
}
