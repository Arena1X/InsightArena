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
import PageBackground from "@/component/PageBackground";

export default function Home() {
  return (
    <>
      <Head>
        <title>InsightArena | Decentralized Prediction Market</title>
      </Head>
      <PageBackground>
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
      </PageBackground>
    </>
  );
}
