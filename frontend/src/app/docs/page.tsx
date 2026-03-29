"use client";

import React, { useState } from "react";
import Header from "@/component/Header";
import Footer from "@/component/Footer";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  BookOpen, 
  Wallet, 
  TrendingUp, 
  Code, 
  FileText, 
  PlayCircle, 
  HelpCircle,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Github,
  Youtube
} from "lucide-react";
import Link from "next/link";

// --- FAQ DATA ---
const faqs = [
  {
    question: "What is InsightArena?",
    answer: "InsightArena is a decentralized prediction market platform where users can trade on the outcomes of real-world events. Built on high-performance blockchain technology, it ensures transparency, security, and fairness for all participants."
  },
  {
    question: "How do I connect my wallet?",
    answer: "Connecting your wallet is easy. Simply click the 'Connect Wallet' button in the navigation bar. We support major browser extensions and mobile wallets like Freighter, XBull, and more."
  },
  {
    question: "Is there a fee for trading?",
    answer: "InsightArena charges a minimal platform fee on successful predictions to maintain the ecosystem. Detailed fee structures can be found in our 'Fees & Rewards' section."
  },
  {
    question: "How are market outcomes resolved?",
    answer: "Outcomes are resolved using decentralized oracles and crowdsourced validation to ensure the result matches real-world findings without a single point of failure."
  }
];

// --- DOCUMENTATION SECTIONS ---
const docSections = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: <BookOpen className="w-6 h-6 text-[#4FD1C5]" />,
    description: "Learn the basics of InsightArena and how to navigate the platform.",
    content: "Welcome to InsightArena! Our platform allows you to leverage your knowledge to predict future events. To get started, you'll need a compatible blockchain wallet and some native tokens for gas fees and staking."
  },
  {
    id: "wallet-connection",
    title: "Wallet Connection",
    icon: <Wallet className="w-6 h-6 text-orange-500" />,
    description: "Connect your digital wallet to start interacting with prediction markets.",
    content: "We use secure, non-custodial wallet connections. Download a supported wallet (like Freighter), set up your account, and then click 'Connect' on our site. Your private keys never leave your device."
  },
  {
    id: "trading-guide",
    title: "How to Trade",
    icon: <TrendingUp className="w-6 h-6 text-green-500" />,
    description: "Follow our step-by-step guide to placing your first prediction trade.",
    content: "Select a market you're interested in, choose your outcome (Yes/No), and decide how many credits you want to stake. Once satisfied, confirm the transaction in your wallet. Your position will be tracked in real-time."
  },
  {
    id: "api-docs",
    title: "API Documentation",
    icon: <Code className="w-6 h-6 text-blue-500" />,
    description: "Developer resources for integrating with our platform API.",
    content: "Build your own bots or dashboards using our REST API. We provide endpoints for historical market data, user leaderboards, and real-time event updates.",
    link: "/api-docs",
    external: true
  },
  {
    id: "smart-contracts",
    title: "Smart Contracts",
    icon: <FileText className="w-6 h-6 text-purple-500" />,
    description: "Technical details about our on-chain logic and security audits.",
    content: "Our platform is powered by Soroban smart contracts on the Stellar network. All code is open-source and has undergone rigorous security auditing by industry leading firms.",
    link: "https://github.com/Arena1X/InsightArena/tree/main/contract",
    external: true
  },
  {
    id: "video-tutorials",
    title: "Video Tutorials",
    icon: <PlayCircle className="w-6 h-6 text-red-500" />,
    description: "Visual walkthroughs of key features and platform use-cases.",
    content: "Prefer watching over reading? Our YouTube channel contains comprehensive guides covering everything from basic setup to advanced trading strategies.",
    link: "https://youtube.com/InsightArena",
    external: true
  }
];

export default function DocsPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = docSections.filter(section => 
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative min-h-screen bg-[#141824] text-white selection:bg-[#4FD1C5]/30">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 opacity-20" 
             style={{ backgroundImage: "radial-gradient(#ffffff10 1px, transparent 1px)", backgroundSize: "40px 40px" }} 
        />
      </div>

      <Header />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto">
        {/* Hero Area */}
        <section className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">
              InsightArena Documentation
            </h1>
            <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10">
              Everything you need to know about the world's most transparent prediction platform.
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none group-focus-within:text-[#4FD1C5] text-gray-400 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4FD1C5]/50 focus:border-[#4FD1C5]/50 transition-all backdrop-blur-sm"
              />
            </div>
          </motion.div>
        </section>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
          <AnimatePresence mode="popLayout">
            {filteredSections.map((section, idx) => (
              <motion.div
                key={section.id}
                id={section.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="group relative p-[1px] rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all overflow-hidden"
              >
                {/* Hover Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#4FD1C5]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative bg-[#1a1f2e] p-8 rounded-[15px] h-full flex flex-col">
                  <div className="mb-6 p-3 bg-white/5 rounded-xl w-fit group-hover:scale-110 transition-transform duration-300">
                    {section.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 group-hover:text-[#4FD1C5] transition-colors">{section.title}</h3>
                  <p className="text-gray-400 mb-6 flex-grow">{section.description}</p>
                  
                  {section.link ? (
                    <Link 
                      href={section.link}
                      className="flex items-center text-sm font-semibold text-[#4FD1C5] hover:underline"
                      target={section.external ? "_blank" : undefined}
                    >
                      {section.external ? "View Externally" : "Read More"}
                      {section.external ? <ExternalLink className="ml-2 w-4 h-4" /> : <ChevronRight className="ml-1 w-4 h-4" />}
                    </Link>
                  ) : (
                    <button className="flex items-center text-sm font-semibold text-[#4FD1C5] hover:underline cursor-default">
                      Coming Soon <ChevronRight className="ml-1 w-4 h-4 opacity-50" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Featured Documentation Section */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-8 md:p-12 mb-24 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <BookOpen className="w-64 h-64 text-white" />
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <span className="inline-block px-3 py-1 bg-[#4FD1C5]/20 text-[#4FD1C5] text-xs font-bold rounded-full mb-6 uppercase tracking-wider">
              Featured Guide
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Prediction Market Fundamentals</h2>
            <p className="text-gray-400 text-lg mb-8 leading-relaxed">
              New to prediction markets? Understand how prices reflect probability, how liquidity works, and why decentralized markets offer superior insight compared to traditional polling.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="bg-[#4FD1C5] hover:bg-[#3dbbb0] text-[#141824] font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-[#4FD1C5]/20 transform active:scale-95">
                Start Learning
              </button>
              <button className="bg-white/10 hover:bg-white/20 border border-white/10 px-8 py-3 rounded-xl transition-all font-semibold backdrop-blur-sm">
                View All Guides
              </button>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="max-w-4xl mx-auto mb-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-3">
              <HelpCircle className="text-[#4FD1C5] w-8 h-8" />
              General Questions
            </h2>
            <p className="text-gray-400">Can't find what you're looking for? Reach out on Discord.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx}
                className="border border-white/10 rounded-2xl bg-white/5 overflow-hidden transition-colors hover:border-white/20"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-semibold text-lg">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${activeFaq === idx ? 'rotate-180 text-[#4FD1C5]' : ''}`} />
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="px-6 pb-6 pt-0 text-gray-400 leading-relaxed border-t border-white/5">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        {/* Community & External Links */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 border border-white/10 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-transparent">
            <Github className="w-10 h-10 mb-6 text-white" />
            <h3 className="text-2xl font-bold mb-4">Open Source Code</h3>
            <p className="text-gray-400 mb-6">Our entire stack is public. Verify our security or contribute to the ecosystem.</p>
            <Link 
              href="https://github.com/Arena1X/InsightArena" 
              target="_blank"
              className="inline-flex items-center text-[#4FD1C5] font-semibold hover:gap-2 transition-all"
            >
              Github Repository <ChevronRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
          <div className="p-8 border border-white/10 rounded-3xl bg-gradient-to-br from-red-500/10 to-transparent">
            <Youtube className="w-10 h-10 mb-6 text-white" />
            <h3 className="text-2xl font-bold mb-4">Video Masterclass</h3>
            <p className="text-gray-400 mb-6">Watch our developers guide you through the protocol's advanced features.</p>
            <Link 
              href="https://youtube.com/InsightArena" 
              target="_blank"
              className="inline-flex items-center text-[#4FD1C5] font-semibold hover:gap-2 transition-all"
            >
              Watch Tutorials <ChevronRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
