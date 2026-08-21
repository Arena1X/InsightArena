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
import {
  fetchServerFavorites,
  addServerFavorite as addServer,
  removeServerFavorite as removeServer,
} from "@/lib/api";

export interface FavoritesContextValue {
  favoriteIds: Set<string>;
  isFavorite: (marketId: string) => boolean;
  toggleFavorite: (marketId: string) => void;
  addFavorite: (marketId: string) => void;
  removeFavorite: (marketId: string) => void;
  isLoading: boolean;
  /** Whether the last sync operation failed */
  syncError: boolean;
}

const DEFAULT_CONTEXT_VALUE: FavoritesContextValue = {
  favoriteIds: new Set(),
  isFavorite: () => false,
  toggleFavorite: () => {},
  addFavorite: () => {},
  removeFavorite: () => {},
  isLoading: false,
  syncError: false,
};

const FavoritesContext = createContext<FavoritesContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

const STORAGE_KEY_PREFIX = "insightarena.favorites";

function getStorageKey(address: string | null): string {
  if (!address) return `${STORAGE_KEY_PREFIX}.guest`;
  return `${STORAGE_KEY_PREFIX}.${address}`;
}

function readStoredFavorites(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[] | null;
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeStoredFavorites(key: string, favorites: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(favorites)));
  } catch {
    // Storage unavailable/full — persistence is best-effort.
  }
}

/**
 * Merge two sets of favorite IDs (union, deduplicated).
 * Exported for testing.
 */
export function mergeFavorites(
  local: Set<string>,
  server: Set<string>,
): Set<string> {
  const merged = new Set(local);
  for (const id of server) {
    merged.add(id);
  }
  return merged;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { address, isAuthenticated } = useWallet();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);
  // Track the previous address to detect login/logout transitions
  const prevAddressRef = useRef<string | null>(null);

  const storageKey = getStorageKey(address);

  // Load favorites: on mount, on address change, and on auth state change
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setSyncError(false);

      const local = readStoredFavorites(storageKey);

      if (isAuthenticated && address) {
        try {
          const server = await fetchServerFavorites();
          const merged = mergeFavorites(local, server);
          setFavoriteIds(merged);
          // Persist the merged result back to localStorage
          writeStoredFavorites(storageKey, merged);
        } catch {
          // Server unavailable — fall back to local-only
          setFavoriteIds(local);
          setSyncError(true);
        }
      } else {
        // Guest or unauthenticated — localStorage only
        setFavoriteIds(local);
      }

      setIsLoading(false);
    };

    load();
    prevAddressRef.current = address;
  }, [storageKey, isAuthenticated, address]);

  const isFavorite = useCallback(
    (marketId: string) => favoriteIds.has(marketId),
    [favoriteIds],
  );

  const addFavorite = useCallback(
    (marketId: string) => {
      // Optimistic update
      setFavoriteIds((prev) => {
        const updated = new Set(prev);
        updated.add(marketId);
        writeStoredFavorites(storageKey, updated);
        return updated;
      });

      // Persist to server (fire-and-forget with rollback on failure)
      if (isAuthenticated) {
        addServer(marketId).catch(() => {
          setFavoriteIds((prev) => {
            const rolledBack = new Set(prev);
            rolledBack.delete(marketId);
            writeStoredFavorites(storageKey, rolledBack);
            return rolledBack;
          });
          setSyncError(true);
        });
      }
    },
    [storageKey, isAuthenticated],
  );

  const removeFavorite = useCallback(
    (marketId: string) => {
      // Optimistic update
      setFavoriteIds((prev) => {
        const updated = new Set(prev);
        updated.delete(marketId);
        writeStoredFavorites(storageKey, updated);
        return updated;
      });

      // Persist to server (fire-and-forget with rollback on failure)
      if (isAuthenticated) {
        removeServer(marketId).catch(() => {
          setFavoriteIds((prev) => {
            const rolledBack = new Set(prev);
            rolledBack.add(marketId);
            writeStoredFavorites(storageKey, rolledBack);
            return rolledBack;
          });
          setSyncError(true);
        });
      }
    },
    [storageKey, isAuthenticated],
  );

  const toggleFavorite = useCallback(
    (marketId: string) => {
      if (favoriteIds.has(marketId)) {
        removeFavorite(marketId);
      } else {
        addFavorite(marketId);
      }
    },
    [favoriteIds, addFavorite, removeFavorite],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteIds,
      isFavorite,
      toggleFavorite,
      addFavorite,
      removeFavorite,
      isLoading,
      syncError,
    }),
    [
      favoriteIds,
      isFavorite,
      toggleFavorite,
      addFavorite,
      removeFavorite,
      isLoading,
      syncError,
    ],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
}