import React from "react";
import MarketRow from "./MarketRow";
import type { ConnectionStatus } from "@/hooks/useLiveOdds";

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
  connectionStatus?: ConnectionStatus;
}

const MarketList: React.FC<MarketListProps> = ({ markets, onTrade, onFavorite, disabled = false, connectionStatus }) => {
  const isOffline = connectionStatus === "disconnected" || connectionStatus === "connecting";

  return (
    <div className="my-4">
      {isOffline && (
        <div
          data-testid="market-list-stale-banner"
          className="mb-3 rounded-lg border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-300"
        >
          Live odds feed disconnected — prices may be stale
        </div>
      )}
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