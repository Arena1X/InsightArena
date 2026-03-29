"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Plus, Minus } from "lucide-react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  isOpen: boolean;
}

export default function CryptoFAQ() {
  const [faqItems, setFaqItems] = useState<FAQItem[]>([
    {
      id: 1,
      question: "What Is Cryptocurrency?",
      answer: "Cryptocurrency Is A Digital Form Of Money That Uses Blockchain Technology And Encryption To Secure Transactions. Bitcoin, Ethereum, And StarkNet Are Popular Examples. Unlike Traditional Currencies, It's Not Controlled By A Central Authority.",
      isOpen: true
    },
    {
      id: 2,
      question: "How Does Blockchain Work?",
      answer: "Blockchain is a distributed ledger technology that records transactions across many computers. Each block contains a timestamp and transaction data, and is linked to the previous block, creating a chain. This makes it secure and resistant to modification.",
      isOpen: false
    },
    {
      id: 3,
      question: "How Does The Tournament For Tutors Works?",
      answer: "The Tournament for Tutors is a competition where cryptocurrency educators compete to provide the best learning experience. Participants are ranked based on student success rates, content quality, and community feedback.",
      isOpen: false
    },
    {
      id: 4,
      question: "Do I Need Coding Skills To Learn Crypto?",
      answer: "No, you don't need coding skills to learn about or invest in cryptocurrency. However, understanding some technical concepts can be helpful. Many platforms now offer user-friendly interfaces for beginners.",
      isOpen: false
    }
  ]);

  const toggleFAQ = (id: number) => {
    setFaqItems(
      faqItems.map((item) =>
        item.id === id ? { ...item, isOpen: !item.isOpen } : item
      )
    );
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <PageBackground />

      <div className="relative z-10">
        <Header />

        <main className="max-w-5xl mx-auto px-6 pt-32 pb-20">
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

            <div className="mt-8 space-y-4">
              {faqItems.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/90"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/5"
                    onClick={() => toggleFAQ(item.id)}
                  >
                    <h2 className="text-lg font-semibold text-white sm:text-xl">
                      {item.id}. {item.question}
                    </h2>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4FD1C5] text-[#0f172a]">
                      {item.isOpen ? (
                        <Minus size={18} />
                      ) : (
                        <Plus size={18} />
                      )}
                    </span>
                  </button>

                  {item.isOpen && (
                    <div className="border-t border-white/10 px-5 py-5 text-[15px] leading-7 text-[#cbd5e1]">
                      <p>{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
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
      </div>
    </div>
  );
}
