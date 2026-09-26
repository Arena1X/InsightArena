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
  addFavoriteBookmark,
  getFavoriteBookmarks,
  removeFavoriteBookmark,
} from "@/lib/api";

export interface FavoritesContextValue {
  favoriteIds: Set<string>;
  isFavorite: (marketId: string) => boolean;
  toggleFavorite: (marketId: string) => void;
  addFavorite: (marketId: string) => void;
  removeFavorite: (marketId: string) => void;
  isLoading: boolean;
}

const DEFAULT_CONTEXT_VALUE: FavoritesContextValue = {
  favoriteIds: new Set(),
  isFavorite: () => false,
  toggleFavorite: () => {},
  addFavorite: () => {},
  removeFavorite: () => {},
  isLoading: false,
};

const FavoritesContext = createContext<FavoritesContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

const STORAGE_KEY_PREFIX = "insightarena.favorites";
const COALESCE_MS = 80;

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

type PendingSync = {
  generation: number;
  desired: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { address, token } = useWallet();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const storageKey = getStorageKey(address);
  const pendingRef = useRef<Map<string, PendingSync>>(new Map());
  const bookmarkIdsRef = useRef<Map<string, string>>(new Map());
  const confirmedRef = useRef<Set<string>>(new Set());
  const storageKeyRef = useRef(storageKey);
  const tokenRef = useRef(token);

  storageKeyRef.current = storageKey;
  tokenRef.current = token;

  useEffect(() => {
    const abortController = new AbortController();

    const load = async () => {
      setIsLoading(true);
      const stored = readStoredFavorites(storageKey);
      setFavoriteIds(stored);
      confirmedRef.current = new Set(stored);

      if (token) {
        try {
          const response = await getFavoriteBookmarks({
            signal: abortController.signal,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (abortController.signal.aborted) return;
          const serverIds = new Set(
            (response.data ?? [])
              .map((item) => item.market?.id)
              .filter(Boolean),
          );
          bookmarkIdsRef.current = new Map(
            (response.data ?? [])
              .filter((item) => item.market?.id)
              .map((item) => [item.market.id, item.id]),
          );

          const merged = new Set([...stored, ...serverIds]);
          confirmedRef.current = new Set(serverIds);
          setFavoriteIds(merged);
          writeStoredFavorites(storageKey, merged);

          const localOnly = [...stored].filter((id) => !serverIds.has(id));
          for (const id of localOnly) {
            if (abortController.signal.aborted) break;
            try {
              const created = await addFavoriteBookmark(id, {
                headers: { Authorization: `Bearer ${token}` },
                signal: abortController.signal,
              });
              bookmarkIdsRef.current.set(id, created.id);
              confirmedRef.current.add(id);
            } catch {
              // Best-effort: stays in UI but not server-confirmed yet
            }
          }
        } catch {
          // Keep the local cache when the API is unreachable.
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

  const applyOptimistic = useCallback((marketId: string, desired: boolean) => {
    setFavoriteIds((prev) => {
      const updated = new Set(prev);
      if (desired) {
        updated.add(marketId);
      } else {
        updated.delete(marketId);
      }
      writeStoredFavorites(storageKeyRef.current, updated);
      return updated;
    });
  }, []);

  const flushSync = useCallback(async (marketId: string) => {
    const pending = pendingRef.current.get(marketId);
    if (!pending) return;

    const { generation, desired } = pending;
    const confirmed = confirmedRef.current.has(marketId);
    const authToken = tokenRef.current;

    if (desired === confirmed) {
      if (pendingRef.current.get(marketId)?.generation === generation) {
        pendingRef.current.delete(marketId);
      }
      return;
    }

    try {
      if (authToken) {
        const headers = { Authorization: `Bearer ${authToken}` };
        if (desired) {
          const created = await addFavoriteBookmark(marketId, { headers });
          bookmarkIdsRef.current.set(marketId, created.id);
        } else {
          const bookmarkId = bookmarkIdsRef.current.get(marketId);
          if (bookmarkId) {
            await removeFavoriteBookmark(bookmarkId, { headers });
            bookmarkIdsRef.current.delete(marketId);
          }
        }
      }

      if (desired) {
        confirmedRef.current.add(marketId);
      } else {
        confirmedRef.current.delete(marketId);
      }
    } catch {
      if (pendingRef.current.get(marketId)?.generation !== generation) return;
      setFavoriteIds(new Set(confirmedRef.current));
      writeStoredFavorites(storageKeyRef.current, confirmedRef.current);
    } finally {
      if (pendingRef.current.get(marketId)?.generation === generation) {
        pendingRef.current.delete(marketId);
      }
    }
  }, []);

  const scheduleSync = useCallback(
    (marketId: string, desired: boolean) => {
      const existing = pendingRef.current.get(marketId);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }

      const generation = (existing?.generation ?? 0) + 1;
      const timer = setTimeout(() => {
        void flushSync(marketId);
      }, COALESCE_MS);

      pendingRef.current.set(marketId, { generation, desired, timer });
    },
    [flushSync],
  );

  const setDesired = useCallback(
    (marketId: string, desired: boolean) => {
      applyOptimistic(marketId, desired);
      scheduleSync(marketId, desired);
    },
    [applyOptimistic, scheduleSync],
  );

  const isFavorite = useCallback(
    (marketId: string) => favoriteIds.has(marketId),
    [favoriteIds],
  );

  const addFavorite = useCallback(
    (marketId: string) => setDesired(marketId, true),
    [setDesired],
  );

  const removeFavorite = useCallback(
    (marketId: string) => setDesired(marketId, false),
    [setDesired],
  );

  const toggleFavorite = useCallback(
    (marketId: string) => {
      setFavoriteIds((prev) => {
        const desired = !prev.has(marketId);
        const updated = new Set(prev);
        if (desired) {
          updated.add(marketId);
        } else {
          updated.delete(marketId);
        }
        writeStoredFavorites(storageKeyRef.current, updated);
        scheduleSync(marketId, desired);
        return updated;
      });
    },
    [scheduleSync],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteIds,
      isFavorite,
      toggleFavorite,
      addFavorite,
      removeFavorite,
      isLoading,
    }),
    [
      favoriteIds,
      isFavorite,
      toggleFavorite,
      addFavorite,
      removeFavorite,
      isLoading,
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
