"use client";

import React from "react";
import MarketCard from "./MarketCard";
import { useLiveOdds } from "@/hooks/useLiveOdds";

type Market = {
  id: string;
  title: string;
  category: string;
  probability: number;
  totalStaked: number;
  closeAt: string;
  status: string;
};

interface MarketCardWithOddsProps {
  market: Market;
  onPredict: () => void;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
}

/**
 * Wraps `MarketCard` with the live-odds WebSocket hook so each market card
 * shows a stale / reconnecting badge when its odds feed drops.
 */
export default function MarketCardWithOdds({
  market,
  onPredict,
  isFavorite,
  onFavoriteToggle,
}: MarketCardWithOddsProps) {
  const { status, stale } = useLiveOdds(market.id);

  return (
    <MarketCard
      market={market}
      onPredict={onPredict}
      isFavorite={isFavorite}
      onFavoriteToggle={onFavoriteToggle}
      connectionStatus={status}
      oddsStale={stale}
    />
  );
}