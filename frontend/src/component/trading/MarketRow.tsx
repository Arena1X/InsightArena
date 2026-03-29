import React from "react";
import Image from "next/image";

interface MarketRowProps {
  icon: React.ReactNode;
  name: string;
  price: string;
  volume: string;
  change: string;
  isFavorite: boolean;
  onTrade: () => void;
  onFavorite: () => void;
}

const DownTradeIcon = () => (
  <Image
    src="/vector-2.png"
    alt="Trade Down"
    width={23.56}
    height={14.56}
    style={{ display: "inline-block" }}
  />
);
const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFD600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={filled ? "#FFD600" : "none"}/>
  </svg>
);

const TradeUpIcon = () => (
  <Image
    src="/Vector.png"
    alt="Trade Up"
    width={23.56}
    height={14.56}
    style={{ display: "inline-block" }}
  />
);

const MarketRow: React.FC<MarketRowProps> = ({
  icon,
  name,
  price,
  volume,
  change,
  isFavorite,
  onTrade,
  onFavorite,
}) => {
  const isPositive = change.startsWith("+");
  return (
    <div
      className="flex items-center justify-between border border-gray-500 rounded-xl px-3 py-2 mb-3 mx-auto w-full max-w-[900px]"
      style={{ height: '111px', borderRadius: '12px', borderWidth: '1px' }}
    >
      <div className="flex items-center min-w-[120px]">
        <span className="text-2xl mr-3">{icon}</span>
        <div className="flex flex-col items-center justify-center">
          <div className="font-bold text-base text-white text-center">{name}</div>
          <div className="text-xs text-gray-300 text-center">BTC</div>
        </div>
      </div>
      <div className="flex flex-col items-center min-w-[90px]">
        <div className="font-bold text-lg text-white">{price}</div>
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? <TradeUpIcon /> : <DownTradeIcon />}
          <span className={`font-semibold text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}>{change}</span>
        </div>
      </div>
      <div className="flex flex-col items-center min-w-[70px]">
        <span className="text-xs text-gray-300">Volume</span>
        <span className="font-bold text-base text-white">{volume}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="focus:outline-none"
          onClick={onFavorite}
          aria-label={isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
        >
          <StarIcon filled={isFavorite} />
        </button>
        <button
          type="button"
          className="px-4 py-1.5 bg-[#7C3AED] text-white font-bold rounded-lg hover:bg-[#6D28D9] focus:outline-none text-sm"
          onClick={onTrade}
          aria-label={`Trade ${name}`}
        >
          Trade
        </button>
      </div>
    </div>
  );
};

export default MarketRow;
