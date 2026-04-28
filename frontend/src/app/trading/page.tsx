"use client";
import React, { useState } from "react";
import Header from "@/component/Header";
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";
import StatsCards from "@/component/trading/StatsCards";
import TradingTabs from "@/component/trading/TradingTabs";
import MarketSearchBar from "@/component/trading/MarketSearchBar";
import MarketList from "@/component/trading/MarketList";
import Image from "next/image";

// Icons for each coin
const icons: Record<string, React.ReactNode> = {
  Bitcoin: <Image src="/bitcoin.png" alt="Bitcoin" width={48} height={48} style={{ display: "inline-block" }} />,
  Ethereum: <Image src="/ethereum.png" alt="Ethereum" width={48} height={48} style={{ display: "inline-block" }} />,
  Cardona: <Image src="/cardona.png" alt="Cardona" width={48} height={48} style={{ display: "inline-block" }} />,
  Solana: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Polygon: <Image src="/polygon.png" alt="Polygon" width={48} height={48} style={{ display: "inline-block" }} />,
  Avalanche: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Chainlink: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Uniswap: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Aave: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Cosmos: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Dogecoin: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  "Shibac Inu": <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Ripple: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
  Litecoin: <Image src="/solana.png" alt="Solana" width={48} height={48} style={{ display: "inline-block" }} />,
};

const initialMarkets = [
  { name: "Bitcoin", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Ethereum", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Cardona", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Solana", price: "$39422.76", volume: "2.1B", change: "-1.77%", isFavorite: false },
  { name: "Polygon", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Avalanche", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Chainlink", price: "$0.45", volume: "2.1B", change: "-1.77%", isFavorite: false },
  { name: "Uniswap", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Aave", price: "$39422.76", volume: "2.1B", change: "-1.77%", isFavorite: false },
  { name: "Cosmos", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Dogecoin", price: "$39422.76", volume: "2.1B", change: "-1.77%", isFavorite: false },
  { name: "Shibac Inu", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Ripple", price: "$39422.76", volume: "2.1B", change: "-1.77%", isFavorite: false },
  { name: "Litecoin", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState("Live market");
  const [search, setSearch] = useState("");
  const [markets, setMarkets] = useState(initialMarkets);

  // Stats placeholder
  const stats = {
    airdrops: "$12,450.32",
    tournaments: "3",
    rank: "#13",
    winnings: "$1250",
  };

  // Filtered markets
  const filteredMarkets = markets.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  // Handlers
  const handleTrade = (name: string) => {
    alert(`Trade clicked for ${name}`);
  };
  const handleFavorite = (name: string) => {
    setMarkets((prev) =>
      prev.map((m) =>
        m.name === name ? { ...m, isFavorite: !m.isFavorite } : m
      )
    );
  };
  const handleFilterClick = () => {
    // Placeholder for filter logic
    alert("Token filter clicked");
  };

  return (
    <PageBackground>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pt-28">
          <h1 className="mb-2 text-2xl font-bold text-white">
            Crypto Trading Hub
          </h1>
          <p className="mb-6 text-sm text-gray-300/80">
            Practice Trading With Real-Time Data And Compete In Tournaments
          </p>
          <StatsCards {...stats} />
          <TradingTabs activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === "Live market" && (
            <>
              <MarketSearchBar
                searchValue={search}
                onSearchChange={(e) => setSearch(e.target.value)}
                onFilterClick={handleFilterClick}
              />
              <h2 className="mb-4 text-xl font-semibold text-white">
                Live Cryptocurrency Markets
              </h2>
              <MarketList
                markets={filteredMarkets.map((m) => ({
                  ...m,
                  icon: icons[m.name],
                }))}
                onTrade={handleTrade}
                onFavorite={handleFavorite}
              />
            </>
          )}
          {/* Add Tournament, Portfolio, Leaderboards tab content as needed */}
        </main>
        <Footer />
      </div>
    </PageBackground>
  );
} 
