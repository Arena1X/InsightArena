"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { env } from "@/lib/env";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "polling";

export interface OddsUpdate {
  marketId: string;
  yesOdds: number;
  noOdds: number;
  updatedAt: number;
}

export interface UseLiveOddsResult {
  odds: OddsUpdate | null;
  status: ConnectionStatus;
  lastUpdatedAt: number | null;
  /** True when the feed is disconnected/reconnecting or the last data is older than STALE_AFTER_MS. */
  stale: boolean;
}

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 30_000;

function buildWsUrl(marketId: string): string {
  const base = env.API_URL.replace(/^http/, "ws");
  const url = new URL(`/ws/odds/${encodeURIComponent(marketId)}`, base);
  return url.toString();
}

async function fetchOddsHttp(marketId: string): Promise<OddsUpdate | null> {
  try {
    const res = await fetch(`${env.API_URL}/markets/${encodeURIComponent(marketId)}/odds`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      marketId,
      yesOdds: data.yes_odds ?? data.yesOdds,
      noOdds: data.no_odds ?? data.noOdds,
      updatedAt: data.updated_at ?? Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Subscribes to live odds for a market via WebSocket.
 *
 * Reconnects with exponential backoff on drop. Falls back to HTTP polling when
 * the socket is unavailable. Cleans up on unmount.
 *
 * @param marketId - The market to subscribe to.
 */
export function useLiveOdds(marketId: string | null | undefined): UseLiveOddsResult {
  const [odds, setOdds] = useState<OddsUpdate | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (staleTimerRef.current) { clearTimeout(staleTimerRef.current); staleTimerRef.current = null; }
  }, []);

  const scheduleStaleCheck = useCallback(() => {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setStale(true);
    }, STALE_AFTER_MS);
  }, []);

  const clearStale = useCallback(() => {
    setStale(false);
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startPolling = useCallback((id: string) => {
    if (!mountedRef.current) return;
    setStatus("polling");
    scheduleStaleCheck();

    const poll = async () => {
      if (!mountedRef.current) return;
      const result = await fetchOddsHttp(id);
      if (result && mountedRef.current) {
        setOdds(result);
        setLastUpdatedAt(result.updatedAt);
        clearStale();
        scheduleStaleCheck();
      }
      if (mountedRef.current) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();
  }, [clearStale, scheduleStaleCheck]);

  const connect = useCallback((id: string) => {
    if (!mountedRef.current) return;
    closeSocket();
    clearTimers();

    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl(id));
    } catch {
      startPolling(id);
      return;
    }

    wsRef.current = ws;
    setStatus("connecting");
    scheduleStaleCheck();

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      attemptRef.current = 0;
      setStatus("connected");
      clearStale();
      scheduleStaleCheck();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data: OddsUpdate = JSON.parse(event.data as string);
        setOdds(data);
        setLastUpdatedAt(data.updatedAt ?? Date.now());
        clearStale();
        scheduleStaleCheck();
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror — let it handle reconnect
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      attemptRef.current += 1;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);

      if (attemptRef.current > 5) {
        // Socket persistently unavailable — switch to polling
        startPolling(id);
        return;
      }

      setStatus("disconnected");
      setStale(true);
      reconnectTimerRef.current = setTimeout(() => connect(id), backoff);
    };
  }, [closeSocket, clearTimers, clearStale, scheduleStaleCheck, startPolling]);

  useEffect(() => {
    mountedRef.current = true;
    if (!marketId) {
      setOdds(null);
      setStatus("disconnected");
      setStale(true);
      return;
    }

    attemptRef.current = 0;
    connect(marketId);

    return () => {
      mountedRef.current = false;
      clearTimers();
      closeSocket();
    };
  }, [marketId, connect, clearTimers, closeSocket]);

  return { odds, status, lastUpdatedAt, stale };
}
