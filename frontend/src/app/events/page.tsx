"use client";

import Header from "@/component/Header";
import Footer from "@/component/Footer";
import { CompetitionCard, ICompetition } from "@/component/competitions/CompetitionCard";
import FeaturedEvents from "@/component/events/FeaturedEvents";
import EventsCompetitionsHero from "@/component/events/EventsCompetitionsHero";

export default function EventsPage() {
  return (
    <div className="relative min-h-screen bg-[#080B16] overflow-x-hidden font-sans">
      <div className="relative z-10">
        <Header />
        
        {/* Hero Section with Search & Tabs */}
        <EventsCompetitionsHero />

        <div className="max-w-7xl mx-auto px-6 py-16 space-y-24">
          
          {/* Featured Sections */}
          <FeaturedEvents />

          {/* Open Competitions Section */}
          <section className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-3xl font-black tracking-tight text-white uppercase italic">
                Open Competitions
              </h2>
              
              <div className="text-cyan-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                 <span>Limited Time Offers</span>
              </div>
            </div>

            {/* 2-Column Grid / Masonry Layout */}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {MOCK_COMPETITIONS.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          </section>

        </div>

        <Footer />
      </div>
    </div>
  );
}
// Mock Data based on Acceptance Criteria & Screenshot
const MOCK_COMPETITIONS: ICompetition[] = [
  {
    id: "comp_1",
    tag: "Spot Trading",
    prizePool: 100000,
    title: "Quarterly Trading Championship",
    features: ["Minimum 10 trades", "KYC verified", "Portfolio > $1,000"],
    currentParticipants: 847,
    maxParticipants: 1000,
    endTime: new Date(Date.now() + 1075500000).toISOString(), 
  },
  {
    id: "comp_2",
    tag: "Futures",
    prizePool: 75000,
    title: "Leverage Masters Contest",
    features: ["Futures experience", "Risk score > 70", "Active for 30 days"],
    currentParticipants: 623,
    maxParticipants: 800,
    endTime: new Date(Date.now() + 742500000).toISOString(), 
  },
  {
    id: "comp_3",
    tag: "Copy Trading",
    prizePool: 50000,
    title: "Top Signal Provider Challenge",
    features: ["100+ followers", "Positive ROI", "Verified track record"],
    currentParticipants: 450,
    maxParticipants: 500,
    endTime: new Date(Date.now() + 1325520000).toISOString(), 
  },
  {
    id: "comp_4",
    tag: "Arbitrage",
    prizePool: 60000,
    title: "Cross-Exchange Arbitrage Battle",
    features: ["Multi-exchange access", "API integration", "Advanced tier"],
    currentParticipants: 389,
    maxParticipants: 500,
    endTime: new Date(Date.now() + 937550000).toISOString(), 
  },
  {
    id: "comp_5",
    tag: "Portfolio",
    prizePool: 40000,
    title: "Balanced Portfolio Competition",
    features: ["Diversified holdings", "3 month history", "Risk management"],
    currentParticipants: 734,
    maxParticipants: 1000,
    endTime: new Date(Date.now() + 1245500000).toISOString(), 
  },
  {
    id: "comp_6",
    tag: "Swing Trading",
    prizePool: 55000,
    title: "Mid-Term Strategy Contest",
    features: ["Hold time > 24h", "Max 20 positions", "Verified account"],
    currentParticipants: 512,
    maxParticipants: 650,
    endTime: new Date(Date.now() + 854500000).toISOString(), 
  },
];
