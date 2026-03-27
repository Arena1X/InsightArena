"use client";

import CompetitionsJoined from "@/component/CompetitionsJoined";
import EventsCompetitionsHero from "@/component/events/EventsCompetitionsHero";
import WhyJoinValueGrid from "@/component/events/WhyJoinValueGrid";

export default function CompetitionsDemoPage() {
  return (
    <div className="min-h-screen bg-[#0B1023] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <EventsCompetitionsHero />
        <CompetitionsJoined />
        <WhyJoinValueGrid />
      </div>
    </div>
  );
}
