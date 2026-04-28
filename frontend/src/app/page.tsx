"use client";
import React from "react";
import Head from "next/head";
import Header from "@/component/Header";
import Footer from "@/component/Footer";
import HeroSection from "@/component/Homepage/HeroSection";

import HowItWorksSection from "@/component/Homepage/HowItWorksSection";
import ReputationSection from "@/component/Homepage/ReputationSection";
import Faq from "@/component/Homepage/Faq";
import Feature from "@/component/Homepage/Feature";
import ComparisonSection from "@/component/Homepage/ComparisonSection";
import TransparentGrid from "@/component/Homepage/Transparent";
import StatisticsSection from "@/component/Homepage/StatisticsSection";


export default function Home() {
  return (
    <>
      <Head>
        <title>InsightArena | Decentralized Prediction Market</title>
      </Head>

      <div className="relative min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-x-hidden">
        {/* Global Network Lines Background */}
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
          <svg
            className="w-full h-full opacity-15"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient
                id="globalLineGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path
              d="M100,200 Q300,100 500,200 T900,200"
              stroke="url(#globalLineGradient)"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M200,400 Q400,300 600,400 T1000,400"
              stroke="url(#globalLineGradient)"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M50,600 Q250,500 450,600 T850,600"
              stroke="url(#globalLineGradient)"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M150,800 Q350,700 550,800 T950,800"
              stroke="url(#globalLineGradient)"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        </div>

        <div className="relative z-10">
          <Header />
          <HeroSection />

          <ReputationSection />
          <Feature />
          <HowItWorksSection />
          <ComparisonSection />
          <TransparentGrid />
          <StatisticsSection />
          <Faq />
          <Footer />
        </div>
      </div>
    </>
  );
}
