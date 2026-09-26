"use client";

import { io, type Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWallet } from "@/context/WalletContext";
import { env } from "@/lib/env";
import { calculatePoolStats, type PoolStats } from "@/lib/utils";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "polling";

export interface OddsUpdate {
  marketId: string;
  yesOdds: number;
  noOdds: number;
  updatedAt: number;
  pool?: PoolStats;
}

export interface UseLiveOddsResult {
  odds: OddsUpdate | null;
  pool: PoolStats | null;
  status: ConnectionStatus;
  lastUpdatedAt: number | null;
  isStale: boolean;
}

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;
const POOL_UPDATE_DEBOUNCE_MS = 150;
export const STALE_THRESHOLD_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 5_000;

type RawOddsUpdate = Partial<OddsUpdate> & {
  market_id?: string;
  yes_odds?: number;
  no_odds?: number;
  updated_at?: number;
  pool?: Record<string, unknown>;
  odds?: Array<Record<string, unknown>>;
  total_pool_xlm?: number;
  totalPoolXlm?: number;
  total_pool_stroops?: string | number;
  participant_count?: number;
  contributor_count?: number;
  contributorCount?: number;
};

function numberValue(...values: unknown[]): number | null {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null);
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeOddsUpdate(marketId: string, raw: RawOddsUpdate): OddsUpdate {
  const rows = Array.isArray(raw.odds) ? raw.odds : [];
  const totalPoolXlm = numberValue(
    raw.total_pool_xlm,
    raw.totalPoolXlm,
    raw.pool?.total_pool_xlm,
    raw.pool?.totalPoolXlm,
    raw.total_pool_stroops != null ? Number(raw.total_pool_stroops) / 10_000_000 : undefined,
    rows.reduce((total, row) => total + (Number(row.total_staked_stroops) || 0), 0) / 10_000_000,
  ) ?? 0;
  const contributorCount = numberValue(
    raw.contributor_count,
    raw.contributorCount,
    raw.participant_count,
    raw.pool?.contributor_count,
    raw.pool?.contributorCount,
    rows.reduce((total, row) => total + (Number(row.count) || 0), 0),
  ) ?? 0;

  return {
    marketId: String(raw.marketId ?? raw.market_id ?? marketId),
    yesOdds: numberValue(raw.yesOdds, raw.yes_odds) ?? 0,
    noOdds: numberValue(raw.noOdds, raw.no_odds) ?? 0,
    updatedAt: numberValue(raw.updatedAt, raw.updated_at) ?? Date.now(),
    pool: calculatePoolStats(totalPoolXlm, contributorCount),
  };
}

function socketUrl(): string {
  return new URL(env.API_URL).origin;
}

async function fetchOddsHttp(marketId: string): Promise<OddsUpdate | null> {
  try {
    const res = await fetch(`${env.API_URL}/markets/${encodeURIComponent(marketId)}/odds`);
    if (!res.ok) return null;
    return normalizeOddsUpdate(marketId, await res.json());
  } catch {
    return null;
  }
}

/** Subscribes to authenticated live odds and pool changes, with polling fallback. */
export function useLiveOdds(marketId: string | null | undefined): UseLiveOddsResult {
  const { token } = useWallet();
  const [odds, setOdds] = useState<OddsUpdate | null>(null);
  const [pool, setPool] = useState<PoolStats | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poolUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<OddsUpdate | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const closingRef = useRef(false);

  const applyUpdate = useCallback((update: OddsUpdate) => {
    pendingUpdateRef.current = update;
    if (poolUpdateTimerRef.current) clearTimeout(poolUpdateTimerRef.current);
    poolUpdateTimerRef.current = setTimeout(() => {
      poolUpdateTimerRef.current = null;
      if (!mountedRef.current || !pendingUpdateRef.current) return;
      const latest = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      setOdds(latest);
      setPool(latest.pool ?? null);
      setLastUpdatedAt(latest.updatedAt);
    }, POOL_UPDATE_DEBOUNCE_MS);
  }, []);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (poolUpdateTimerRef.current) { clearTimeout(poolUpdateTimerRef.current); poolUpdateTimerRef.current = null; }
    pendingUpdateRef.current = null;
  }, []);

  const startPolling = useCallback((id: string) => {
    if (!mountedRef.current) return;
    setStatus("polling");
    const poll = async () => {
      if (!mountedRef.current) return;
      const result = await fetchOddsHttp(id);
      if (result && mountedRef.current) applyUpdate(result);
      if (mountedRef.current) pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  }, [applyUpdate]);

  const connect = useCallback((id: string, authToken: string) => {
    if (!mountedRef.current) return;
    closingRef.current = false;
    const socket = io(`${socketUrl()}/ws`, {
      auth: { token: authToken },
      reconnection: false,
    });
    socketRef.current = socket;
    setStatus("connecting");

    socket.on("connect", () => {
      if (!mountedRef.current) return;
      attemptRef.current = 0;
      socket.emit("subscribe:market", id);
      setStatus("connected");
    });
    socket.on("odds:update", (payload: RawOddsUpdate) => {
      if (mountedRef.current) applyUpdate(normalizeOddsUpdate(id, payload));
    });
    socket.on("connect_error", () => {
      if (!mountedRef.current || closingRef.current) return;
      socket.disconnect();
      attemptRef.current += 1;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);
      if (attemptRef.current > 5) { startPolling(id); return; }
      setStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => connect(id, authToken), backoff);
    });
    socket.on("disconnect", () => {
      if (!mountedRef.current || closingRef.current) return;
      attemptRef.current += 1;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);
      if (attemptRef.current > 5) { startPolling(id); return; }
      setStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => connect(id, authToken), backoff);
    });
  }, [applyUpdate, startPolling]);

  useEffect(() => {
    mountedRef.current = true;
    if (!marketId || !token) {
      setOdds(null);
      setPool(null);
      setStatus("disconnected");
      return;
    }

    attemptRef.current = 0;
    connect(marketId, token);
    return () => {
      mountedRef.current = false;
      closingRef.current = true;
      clearTimers();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [marketId, token, connect, clearTimers]);

  useEffect(() => {
    if (status === "disconnected" || status === "connecting") {
      setIsStale(true);
      return;
    }
    const check = () => {
      if (lastUpdatedAt === null) {
        setIsStale(false);
        return;
      }
      setIsStale(Date.now() - lastUpdatedAt > STALE_THRESHOLD_MS);
    };
    check();
    const id = setInterval(check, STALE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, lastUpdatedAt]);

  return { odds, pool, status, lastUpdatedAt, isStale };
}