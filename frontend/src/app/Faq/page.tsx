"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Minus,
} from "lucide-react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";
import { slugify } from "@/lib/utils";

interface FAQContentItem {
  id: number;
  question: string;
  answer: string;
}

const FAQ_CONTENT: FAQContentItem[] = [
  {
    id: 1,
    question: "What Is Cryptocurrency?",
    answer:
      "Cryptocurrency Is A Digital Form Of Money That Uses Blockchain Technology And Encryption To Secure Transactions. Bitcoin, Ethereum, And StarkNet Are Popular Examples. Unlike Traditional Currencies, It's Not Controlled By A Central Authority.",
  },
  {
    id: 2,
    question: "How Does Blockchain Work?",
    answer:
      "Blockchain is a distributed ledger technology that records transactions across many computers. Each block contains a timestamp and transaction data, and is linked to the previous block, creating a chain. This makes it secure and resistant to modification.",
  },
  {
    id: 3,
    question: "How Does The Tournament For Tutors Works?",
    answer:
      "The Tournament for Tutors is a competition where cryptocurrency educators compete to provide the best learning experience. Participants are ranked based on student success rates, content quality, and community feedback.",
  },
  {
    id: 4,
    question: "Do I Need Coding Skills To Learn Crypto?",
    answer:
      "No, you don't need coding skills to learn about or invest in cryptocurrency. However, understanding some technical concepts can be helpful. Many platforms now offer user-friendly interfaces for beginners.",
  },
];

// Slugs are derived once from the static question text so every item has a
// stable, linkable URL hash (e.g. "#what-is-cryptocurrency").
const FAQ_ITEMS = FAQ_CONTENT.map((item) => ({
  ...item,
  slug: slugify(item.question),
}));

const DEFAULT_OPEN_IDS = FAQ_ITEMS.length > 0 ? [FAQ_ITEMS[0].id] : [];

function getSlugFromHash(hash: string): string {
  return hash.replace(/^#/, "");
}

export default function CryptoFAQ() {
  const [openIds, setOpenIds] = useState<Set<number>>(
    () => new Set(DEFAULT_OPEN_IDS)
  );

  const openItemForHash = useCallback((hash: string, scrollIntoView: boolean) => {
    const slug = getSlugFromHash(hash);
    if (!slug) return;

    const match = FAQ_ITEMS.find((item) => item.slug === slug);
    if (!match) return;

    setOpenIds((prev) => {
      if (prev.has(match.id)) return prev;
      return new Set(prev).add(match.id);
    });

    if (scrollIntoView) {
      const element = document.getElementById(`faq-item-${match.slug}`);
      element?.scrollIntoView?.({ block: "start" });
    }
  }, []);

  // Auto-open the item matching the URL hash on load, and react to the user
  // navigating via back/forward or manually editing the hash.
  useEffect(() => {
    if (window.location.hash) {
      openItemForHash(window.location.hash, true);
    }

    const handleHashChange = () => openItemForHash(window.location.hash, false);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [openItemForHash]);

  const updateHash = useCallback((slug: string | null) => {
    const { pathname, search } = window.location;
    const nextUrl = `${pathname}${search}${slug ? `#${slug}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  const toggleFAQ = (id: number, slug: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (getSlugFromHash(window.location.hash) === slug) {
          updateHash(null);
        }
      } else {
        next.add(id);
        updateHash(slug);
      }
      return next;
    });
  };

  const expandAll = () => {
    setOpenIds(new Set(FAQ_ITEMS.map((item) => item.id)));
  };

  const collapseAll = () => {
    setOpenIds(new Set());
    updateHash(null);
  };

  const allExpanded = openIds.size === FAQ_ITEMS.length;
  const allCollapsed = openIds.size === 0;

  return (
    <PageBackground>
      <Header />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-20 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-[#111726]/85 p-6 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-10">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#4FD1C5]">
                Support
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Frequently Asked Questions
              </h1>
              <p className="max-w-2xl text-base text-[#94a3b8]">
                Find quick answers about crypto basics, tournaments, and how
                to get started on InsightArena.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#d8dee9] transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={18} />
              <span>Back to home</span>
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={expandAll}
              disabled={allExpanded}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#d8dee9] transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronsUpDown size={16} />
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={allCollapsed}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#d8dee9] transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronsDownUp size={16} />
              Collapse all
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openIds.has(item.id);
              const buttonId = `faq-question-${item.slug}`;
              const panelId = `faq-panel-${item.slug}`;

              return (
                <div
                  key={item.id}
                  id={`faq-item-${item.slug}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/90 scroll-mt-32"
                >
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/5"
                    onClick={() => toggleFAQ(item.id, item.slug)}
                  >
                    <h2 className="text-lg font-semibold text-white sm:text-xl">
                      {item.id}. {item.question}
                    </h2>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4FD1C5] text-[#0f172a]">
                      {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                    </span>
                  </button>

                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!isOpen}
                    className="border-t border-white/10 px-5 py-5 text-[15px] leading-7 text-[#cbd5e1]"
                  >
                    <p>{item.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-[#4FD1C5]/20 bg-[#0b1220] px-6 py-5">
            <p className="text-sm leading-6 text-[#94a3b8]">
              Still need help? Explore the platform from the homepage and
              keep an eye on upcoming guides and community resources.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}
