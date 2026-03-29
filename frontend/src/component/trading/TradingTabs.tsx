import React from "react";

interface TradingTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  "Live market",
  "Tournament",
  "Portfolio",
  "Leaderboards",
];

const TradeUpIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path
      d="M6 24L14 16L19 21L26 14"
      stroke="#22C55E"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M26 14V20H20"
      stroke="#22C55E"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TradingTabs: React.FC<TradingTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex w-full bg-[#444444] p-2 gap-2 rounded-xl">
      {tabs.map((tab) => (
        <Button
          key={tab}
          className={`flex-1 font-semibold text-center transition-colors duration-150
            ${activeTab === tab
              ? "bg-[#090808] text-white"
              : "bg-[#737373] text-[#D1D5DB]"}
            rounded-lg
            h-[36px]
            text-base
            px-4
          `}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default TradingTabs; 