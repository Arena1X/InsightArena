"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/component/ui/button";
import { cn } from "@/lib/utils";

interface FeaturedEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  prize: string;
  joined: boolean;
}

const FEATURED_EVENTS: FeaturedEvent[] = [
  {
    id: "apollo-tournament",
    title: "Apollo Tournament",
    description: "Join the live prediction tournament and compete for exclusive rewards.",
    category: "Eligible for you",
    prize: "5,000 XLM prize pool",
    joined: true,
  },
  {
    id: "rising-stars-invite",
    title: "Rising Stars Invite",
    description: "Back emerging creators in a small-group prediction event.",
    category: "Recommended",
    prize: "1,200 XLM prize pool",
    joined: false,
  },
  {
    id: "season-finale-challenge",
    title: "Season Finale Challenge",
    description: "Explore the final creator event and its milestone rewards.",
    category: "Popular",
    prize: "2,500 XLM prize pool",
    joined: false,
  },
];

const ROTATION_INTERVAL_MS = 5000;

const tabs = ["Events", "Competitions", "Past"];
const sortOptions = ["Most Popular", "Newest", "Ending Soon"];

export default function EventsCompetitionsHero() {
  const [activeTab, setActiveTab] = useState("Events");
  const [sortBy, setSortBy] = useState(sortOptions[0]);
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const featuredEvents = [
    ...FEATURED_EVENTS.filter((event) => event.joined),
    ...FEATURED_EVENTS.filter((event) => !event.joined),
  ];
  const activeEvent = featuredEvents[activeEventIndex];

  useEffect(() => {
    if (isPaused || featuredEvents.length < 2) return;

    const interval = window.setInterval(() => {
      setActiveEventIndex((currentIndex) =>
        (currentIndex + 1) % featuredEvents.length,
      );
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isPaused, featuredEvents.length]);

  const goToEvent = (index: number) => {
    setActiveEventIndex((index + featuredEvents.length) % featuredEvents.length);
  };

  return (
    <section className="relative overflow-hidden border border-white/6 bg-[radial-gradient(circle_at_top,_rgba(81,88,255,0.16),_transparent_32%),linear-gradient(180deg,_#16152F_0%,_#0E1228_100%)] px-5 py-12 text-white shadow-[0_24px_80px_rgba(7,10,24,0.55)] sm:px-8 md:px-10 md:py-24">
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,_rgba(0,201,255,0.12),_transparent_60%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center text-center">
        <h1 className="max-w-4xl text-4xl font-bold tracking-[-0.03em] sm:text-5xl md:text-6xl">
          Public Events &amp; Competitions
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-7 text-[#A7AED1] sm:text-base">
          Join live trading competitions, connect with top analysts, and win
          exclusive rewards.
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button
            size="lg"
            className="h-12 min-w-44 rounded-xl border border-orange-500 bg-orange-500 px-8 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(249,115,22,0.3)] hover:bg-orange-600 cursor-pointer"
          >
            Browse Events
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="cursor-pointer h-12 min-w-44 rounded-xl border border-[#5B4DCC] bg-transparent px-8 text-sm font-semibold text-white hover:bg-white/5"
          >
            View Competitions
          </Button>
        </div>

        <div
          className="mt-10 w-full rounded-[24px] border border-white/6 bg-[#1B1F39]/95 p-6 text-left shadow-[0_12px_36px_rgba(4,8,20,0.35)] backdrop-blur-xl"
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured events"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onFocus={() => setIsPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsPaused(false);
            }
          }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B5CFF]">
                Featured event
              </p>
              <p className="mt-2 text-xs text-[#8D95BD]">{activeEvent.category}</p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                {activeEvent.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#A7AED1]">
                {activeEvent.description}
              </p>
              <p className="mt-3 text-sm font-semibold text-orange-300">
                {activeEvent.prize}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2" aria-label="Carousel controls">
              <button
                type="button"
                aria-label="Previous featured event"
                onClick={() => goToEvent(activeEventIndex - 1)}
                className="rounded-full border border-white/10 p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#8B5CFF]"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next featured event"
                onClick={() => goToEvent(activeEventIndex + 1)}
                className="rounded-full border border-white/10 p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#8B5CFF]"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex gap-2" aria-label="Choose featured event">
              {featuredEvents.map((event, index) => (
                <button
                  key={event.id}
                  type="button"
                  aria-label={`Show ${event.title}`}
                  aria-current={index === activeEventIndex ? "true" : undefined}
                  onClick={() => goToEvent(index)}
                  className={cn(
                    "h-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-[#8B5CFF]",
                    index === activeEventIndex
                      ? "w-8 bg-[#8B5CFF]"
                      : "w-2 bg-white/30 hover:bg-white/60",
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-[#8D95BD]" aria-live="polite">
              {activeEventIndex + 1} of {featuredEvents.length}
            </span>
          </div>
        </div>

        <div className="mt-10 w-full rounded-[24px] border border-white/6 bg-[#1B1F39]/95 p-4 shadow-[0_12px_36px_rgba(4,8,20,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <label className="flex h-12 w-full items-center gap-3 rounded-xl border border-white/5 bg-[#252947] px-4 text-sm text-[#8D95BD] xl:max-w-sm">
              <Search className="h-4 w-4 shrink-0" />
              <input
                type="search"
                placeholder="Search events, competitions..."
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#8D95BD]"
                aria-label="Search events and competitions"
              />
            </label>

            <div className="flex flex-wrap items-center justify-center gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative pb-2 text-sm font-medium transition-colors",
                    activeTab === tab
                      ? "text-white"
                      : "text-[#8D95BD] hover:text-white/80",
                  )}
                >
                  {tab}
                  <span
                    className={cn(
                      "absolute inset-x-0 -bottom-px mx-auto h-0.5 w-8 rounded-full bg-[#8B5CFF] transition-opacity",
                      activeTab === tab ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button
                variant="ghost"
                className="h-12 rounded-xl border border-white/5 bg-[#252947] px-4 text-sm font-medium text-[#C3C8E5] hover:bg-[#2B3054] hover:text-white"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </Button>

              <label className="flex h-12 min-w-[160px] items-center gap-2 rounded-xl border border-white/5 bg-[#252947] px-4 text-sm text-[#C3C8E5]">
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full appearance-none bg-transparent font-medium text-white outline-none"
                  aria-label="Sort competitions"
                >
                  {sortOptions.map((option) => (
                    <option
                      key={option}
                      value={option}
                      className="bg-[#252947] text-white"
                    >
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#8D95BD]" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
