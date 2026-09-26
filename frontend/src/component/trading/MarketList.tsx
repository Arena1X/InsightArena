import React from "react";
import MarketRow from "./MarketRow";

interface Market {
  icon: React.ReactNode;
  name: string;
  price: string;
  volume: string;
  change: string;
  isFavorite: boolean;
}

interface MarketListProps {
  markets: Market[];
  onTrade: (name: string) => void;
  onFavorite: (name: string) => void;
  /** Disables trade/favorite actions, e.g. while offline. */
  disabled?: boolean;
}

const MarketList: React.FC<MarketListProps> = ({ markets, onTrade, onFavorite, disabled = false }) => {
  return (
    <div className="my-4">
      {markets.map((market) => (
        <MarketRow
          key={market.name}
          icon={market.icon}
          name={market.name}
          price={market.price}
          volume={market.volume}
          change={market.change}
          isFavorite={market.isFavorite}
          disabled={disabled}
          onTrade={() => onTrade(market.name)}
          onFavorite={() => onFavorite(market.name)}
        />
      ))}
    </div>
  );
};

export default MarketList; 