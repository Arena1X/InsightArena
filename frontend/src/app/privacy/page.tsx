"use client";

import React from "react";
import Head from "next/head";
import Link from "next/link";
import Header from "@/component/Header";
import Footer from "@/component/Footer";

export default function PrivacyPolicy() {
  const lastUpdated = "March 28, 2026";

  return (
    <>
      <Head>
        <title>Privacy Policy | InsightArena</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="relative min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-x-hidden text-gray-300 font-sans">
        {/* Global Network Lines Background */}
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
          <svg
            className="w-full h-full opacity-15"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="globalLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path d="M100,200 Q300,100 500,200 T900,200" stroke="url(#globalLineGradient)" strokeWidth="2" fill="none" />
            <path d="M200,400 Q400,300 600,400 T1000,400" stroke="url(#globalLineGradient)" strokeWidth="2" fill="none" />
            <path d="M50,600 Q250,500 450,600 T850,600" stroke="url(#globalLineGradient)" strokeWidth="2" fill="none" />
            <path d="M150,800 Q350,700 550,800 T950,800" stroke="url(#globalLineGradient)" strokeWidth="2" fill="none" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main id="privacy-content" className="flex-grow max-w-4xl mx-auto px-6 py-32">
            <header className="mb-12">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Privacy Policy</h1>
              <p className="text-sm text-gray-500 font-medium">Last Updated: {lastUpdated}</p>
            </header>

            <div className="space-y-12">
              <section id="introduction">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
                <p className="leading-relaxed">
                  InsightArena ("we," "our," or "us") is dedicated to protecting your privacy while providing a high-performance decentralized prediction market on the Stellar network. This Privacy Policy explains how we collect, use, and protect your information when you interact with our platform.
                </p>
                <p className="mt-4 leading-relaxed">
                  As a decentralized application (dApp), InsightArena operates through distributed smart contracts. Much of your interaction occurs directly on the Stellar blockchain, which is a public ledger.
                </p>
              </section>

              <section id="data-collection">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-blue-400 mb-2">Public Blockchain Data</h3>
                    <p className="leading-relaxed">When you use InsightArena, your Stellar wallet address and any transactions you initiate (such as market creations, predictions, or claims) are recorded on the public Stellar blockchain. This data is permanent and publicly accessible by anyone.</p>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-blue-400 mb-2">Usage Data</h3>
                    <p className="leading-relaxed">We may collect information about how you interact with our website, including your browser type and operating system, to improve platform performance and community features.</p>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-blue-400 mb-2">Communication Data</h3>
                    <p className="leading-relaxed">If you contact our support team via email or community channels (Discord, Telegram, Twitter), we may collect your contact details and the contents of your message.</p>
                  </div>
                </div>
              </section>

              <section id="cookie-policy">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Cookie Policy</h2>
                <p className="mb-4 leading-relaxed">
                  InsightArena uses only essential cookies and similar technologies to ensure basic website functionality and to remember your preferences (e.g., wallet connection status).
                </p>
                <ul className="list-disc list-inside space-y-3 pl-4">
                  <li><span className="text-white font-medium">Session Cookies:</span> Temporary cookies that expire when you close your browser.</li>
                  <li><span className="text-white font-medium">Analytical Cookies:</span> We may use privacy-preserving analytics tools to understand traffic patterns without identifying individual users.</li>
                </ul>
                <p className="mt-4">You can manage your cookie preferences through your browser settings at any time.</p>
              </section>

              <section id="third-party">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Third-Party Services</h2>
                <p className="mb-4 leading-relaxed">
                  InsightArena leverages third-party infrastructure to provide its services:
                </p>
                <ul className="list-disc list-inside space-y-3 pl-4">
                  <li><span className="text-white font-medium">Stellar Network:</span> All smart contract logic and payouts are handled via the Stellar blockchain.</li>
                  <li><span className="text-white font-medium">Wallet Providers:</span> We integrate with Stellar wallets (e.g., Freighter, Albedo). These providers have their own privacy policies.</li>
                </ul>
              </section>

              <section id="gdpr">
                <h2 className="text-2xl font-semibold text-white mb-4">5. User Rights (GDPR Compliance)</h2>
                <p className="mb-4 leading-relaxed">
                  If you are a resident of the European Economic Area (EEA), you have certain data protection rights under the General Data Protection Regulation (GDPR). These include:
                </p>
                <ul className="list-disc list-inside space-y-3 pl-4">
                  <li>The right to access the personal data we hold about you.</li>
                  <li>The right to rectify inaccurate or incomplete data.</li>
                  <li>The right to request erasure of your data (subject to blockchain limitations).</li>
                  <li>The right to restrict or object to the processing of your data.</li>
                </ul>
                <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <p className="text-amber-400 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    Note: Data recorded on the Stellar blockchain cannot be modified or deleted by InsightArena.
                  </p>
                </div>
              </section>

              <section id="contact">
                <h2 className="text-2xl font-semibold text-white mb-4">6. Contact Information</h2>
                <p className="mb-6">
                  If you have any questions or concerns about this Privacy Policy, please reach out to us:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 flex flex-col items-center">
                    <span className="text-white font-medium mb-1">Email</span>
                    <a href="mailto:privacy@insightarena.com" className="text-blue-400 hover:text-blue-300 text-sm">Contact Support</a>
                  </div>
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 flex flex-col items-center">
                    <span className="text-white font-medium mb-1">Discord</span>
                    <a href="https://discord.gg/InsightArena" className="text-blue-400 hover:text-blue-300 text-sm">Join Community</a>
                  </div>
                  <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 flex flex-col items-center">
                    <span className="text-white font-medium mb-1">Twitter</span>
                    <a href="https://twitter.com/InsightArena" className="text-blue-400 hover:text-blue-300 text-sm">@InsightArena</a>
                  </div>
                </div>
              </section>
              
              <footer className="pt-8 border-t border-gray-800 text-center">
                <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium">
                  &larr; Back to Home
                </Link>
              </footer>
            </div>
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
