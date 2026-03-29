"use client";
import Button from '@/components/Button';
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "What is InsightArena?",
    answer:
      "InsightArena is a decentralized prediction market built on the Stellar network using Soroban smart contracts. It allows users to stake XLM on real-world outcomes.",
  },
  {
    question: "How do I start predicting?",
    answer:
      "Simply connect your Stellar wallet (like Freighter), browse active markets, select an outcome, and stake your XLM.",
  },
  {
    question: "Can I create my own markets?",
    answer:
      "Yes! Anyone can create a market by providing initial liquidity, defining the outcomes, and setting an oracle for resolution.",
  },
  {
    question: "Is my native XLM safe?",
    answer:
      "Yes. Funds are locked in a non-custodial smart contract escrow. InsightArena administrators cannot access your funds.",
  },
  {
    question: "Who resolves the market outcomes?",
    answer:
      "Outcomes are resolved by designated decentralized oracles, with an optimistic dispute window ensuring fairness.",
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="relative py-16 md:py-24 px-6" style={{ background: "none" }}>
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <motion.h2
          className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-10 md:mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          Frequently Asked Questions
        </motion.h2>

        {/* Accordion Items */}
        <div className="flex flex-col gap-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.07 }}
                viewport={{ once: true }}
                className="bg-gray-950/60 border border-[#1e2d45] rounded-lg"
              >
                {/* Question Row */}
                <Button
                  onClick={() => toggle(index)}
                  className="w-full flex justify-between items-center px-6 py-5 text-left cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="text-white font-semibold text-sm sm:text-base md:text-lg">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className="flex-shrink-0 ml-4 transition-transform duration-300"
                    style={{
                      color: "white",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                    size={20}
                  />
                </Button>

                {/* Answer */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <p
                        className="px-6 pb-6 text-sm sm:text-base leading-relaxed"
                        style={{ color: "#8a9bb5" }}
                      >
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
