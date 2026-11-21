"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWallet } from "./WalletContext";
import { useNotifications } from "./NotificationContext";
import { apiClient } from "@/lib/api";

export type PriceAlertOutcome = "YES" | "NO";
export type PriceAlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  marketId: string;
  outcome: PriceAlertOutcome;
  targetOdds: number;
  direction: PriceAlertDirection;
  enabled: boolean;
  createdAt: string;
}

export interface PriceAlertContextValue {
  alerts: PriceAlert[];
  isLoading: boolean;
  getAlertsForMarket: (marketId: string) => PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, "id" | "createdAt">) => Promise<void>;
  updateAlert: (id: string, updates: Partial<PriceAlert>) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  checkAlert: (
    marketId: string,
    yesOdds: number,
    noOdds: number,
    previousYesOdds?: number,
    previousNoOdds?: number,
  ) => void;
}

const DEFAULT_CONTEXT_VALUE: PriceAlertContextValue = {
  alerts: [],
  isLoading: false,
  getAlertsForMarket: () => [],
  addAlert: async () => {},
  updateAlert: async () => {},
  removeAlert: async () => {},
  checkAlert: () => {},
};

const PriceAlertContext = createContext<PriceAlertContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

const STORAGE_KEY_PREFIX = "insightarena.pricealerts";

function getStorageKey(address: string | null): string {
  if (!address) return `${STORAGE_KEY_PREFIX}.guest`;
  return `${STORAGE_KEY_PREFIX}.${address}`;
}

function readStoredAlerts(key: string): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredAlerts(key: string, alerts: PriceAlert[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(alerts));
  } catch {
    // Storage unavailable/full — persistence is best-effort.
  }
}

export function PriceAlertProvider({ children }: { children: React.ReactNode }) {
  const { address, token } = useWallet();
  const { notifications, setNotifications } = useNotifications();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const storageKey = getStorageKey(address);
  const triggeredAlertsRef = useRef<Set<string>>(new Set());

  // Load alerts from server and localStorage
  useEffect(() => {
    const abortController = new AbortController();

    const load = async () => {
      setIsLoading(true);
      const stored = readStoredAlerts(storageKey);
      setAlerts(stored);

      if (token) {
        try {
          const response = await apiClient.get<{
            price_alerts: PriceAlert[] | null;
          }>("/api/users/preferences/notifications", {
            signal: abortController.signal,
            headers: { Authorization: `Bearer ${token}` },
          });

          if (abortController.signal.aborted) return;

          const serverAlerts = response.price_alerts || [];
          setAlerts(serverAlerts);
          writeStoredAlerts(storageKey, serverAlerts);
        } catch (error) {
          // Keep local cache when API is unreachable
          console.error("Failed to load price alerts:", error);
        }
      }

      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      abortController.abort();
    };
  }, [storageKey, token]);

  const syncToServer = useCallback(
    async (updatedAlerts: PriceAlert[]) => {
      if (!token) return;

      try {
        await apiClient.patch(
          "/api/users/preferences/notifications",
          { price_alerts: updatedAlerts },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (error) {
        console.error("Failed to sync price alerts:", error);
        throw error;
      }
    },
    [token],
  );

  const addAlert = useCallback(
    async (alertData: Omit<PriceAlert, "id" | "createdAt">) => {
      const newAlert: PriceAlert = {
        ...alertData,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      const updatedAlerts = [...alerts, newAlert];
      setAlerts(updatedAlerts);
      writeStoredAlerts(storageKey, updatedAlerts);

      try {
        await syncToServer(updatedAlerts);
      } catch (error) {
        // Rollback on error
        setAlerts(alerts);
        writeStoredAlerts(storageKey, alerts);
        throw error;
      }
    },
    [alerts, storageKey, syncToServer],
  );

  const updateAlert = useCallback(
    async (id: string, updates: Partial<PriceAlert>) => {
      const updatedAlerts = alerts.map((alert) =>
        alert.id === id ? { ...alert, ...updates } : alert,
      );

      setAlerts(updatedAlerts);
      writeStoredAlerts(storageKey, updatedAlerts);

      try {
        await syncToServer(updatedAlerts);
      } catch (error) {
        // Rollback on error
        setAlerts(alerts);
        writeStoredAlerts(storageKey, alerts);
        throw error;
      }
    },
    [alerts, storageKey, syncToServer],
  );

  const removeAlert = useCallback(
    async (id: string) => {
      const updatedAlerts = alerts.filter((alert) => alert.id !== id);

      setAlerts(updatedAlerts);
      writeStoredAlerts(storageKey, updatedAlerts);

      // Remove from triggered set
      triggeredAlertsRef.current.delete(id);

      try {
        await syncToServer(updatedAlerts);
      } catch (error) {
        // Rollback on error
        setAlerts(alerts);
        writeStoredAlerts(storageKey, alerts);
        throw error;
      }
    },
    [alerts, storageKey, syncToServer],
  );

  const getAlertsForMarket = useCallback(
    (marketId: string) => {
      return alerts.filter((alert) => alert.marketId === marketId);
    },
    [alerts],
  );

  const checkAlert = useCallback(
    (
      marketId: string,
      yesOdds: number,
      noOdds: number,
      previousYesOdds?: number,
      previousNoOdds?: number,
    ) => {
      const marketAlerts = alerts.filter(
        (alert) => alert.marketId === marketId && alert.enabled,
      );

      for (const alert of marketAlerts) {
        // Skip if already triggered
        if (triggeredAlertsRef.current.has(alert.id)) {
          continue;
        }

        // Skip if we don't have previous odds (initial load)
        if (previousYesOdds === undefined || previousNoOdds === undefined) {
          continue;
        }

        const currentOdds = alert.outcome === "YES" ? yesOdds : noOdds;
        const previousOdds =
          alert.outcome === "YES" ? previousYesOdds : previousNoOdds;

        let triggered = false;

        if (alert.direction === "above") {
          // Trigger if crossed from below to above
          triggered =
            previousOdds < alert.targetOdds && currentOdds >= alert.targetOdds;
        } else {
          // Trigger if crossed from above to below
          triggered =
            previousOdds > alert.targetOdds && currentOdds <= alert.targetOdds;
        }

        if (triggered) {
          // Mark as triggered
          triggeredAlertsRef.current.add(alert.id);

          // Generate notification
          const notification = {
            id: `alert-${alert.id}-${Date.now()}`,
            type: "market" as const,
            icon: "trend" as const,
            message: `Price Alert: ${alert.outcome} odds ${alert.direction === "above" ? "rose above" : "fell below"} ${(alert.targetOdds * 100).toFixed(1)}% (now ${(currentOdds * 100).toFixed(1)}%)`,
            timestamp: "Just now",
            isRead: false,
          };

          setNotifications([notification, ...notifications]);
        }
      }
    },
    [alerts, notifications, setNotifications],
  );

  const value = useMemo<PriceAlertContextValue>(
    () => ({
      alerts,
      isLoading,
      getAlertsForMarket,
      addAlert,
      updateAlert,
      removeAlert,
      checkAlert,
    }),
    [
      alerts,
      isLoading,
      getAlertsForMarket,
      addAlert,
      updateAlert,
      removeAlert,
      checkAlert,
    ],
  );

  return (
    <PriceAlertContext.Provider value={value}>
      {children}
    </PriceAlertContext.Provider>
  );
}

export function usePriceAlerts() {
  const context = useContext(PriceAlertContext);
  if (!context) {
    throw new Error("usePriceAlerts must be used within PriceAlertProvider");
  }
  return context;
}
