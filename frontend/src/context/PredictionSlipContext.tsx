"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface SlipItem {
  marketId: string;
  marketTitle: string;
  category: string;
  outcome: string;
  odds: number;
  amount: number;
}

export interface PredictionSlipContextValue {
  items: SlipItem[];
  totalStake: number;
  totalPayout: number;
  itemCount: number;
  isOpen: boolean;
  openSlip: () => void;
  closeSlip: () => void;
  toggleSlip: () => void;
  addItem: (item: Omit<SlipItem, "amount">) => void;
  removeItem: (marketId: string) => void;
  updateAmount: (marketId: string, amount: number) => void;
  restoreItem: (item: SlipItem) => void;
  clearSlip: () => void;
}

const DEFAULT_CONTEXT_VALUE: PredictionSlipContextValue = {
  items: [],
  totalStake: 0,
  totalPayout: 0,
  itemCount: 0,
  isOpen: false,
  openSlip: () => {},
  closeSlip: () => {},
  toggleSlip: () => {},
  addItem: () => {},
  removeItem: () => {},
  updateAmount: () => {},
  restoreItem: () => {},
  clearSlip: () => {},
};

const PredictionSlipContext = createContext<PredictionSlipContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

const STORAGE_KEY = "insightarena.prediction_slip";

function readStoredSlip(): SlipItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredSlip(items: SlipItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
  }
}

export function PredictionSlipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<SlipItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredSlip();
    if (stored.length > 0) {
      setItems(stored);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      writeStoredSlip(items);
    }
  }, [items, hydrated]);

  const addItem = useCallback((item: Omit<SlipItem, "amount">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.marketId === item.marketId);
      if (existing) {
        return prev.map((i) =>
          i.marketId === item.marketId
            ? { ...i, outcome: item.outcome, odds: item.odds }
            : i,
        );
      }
      return [...prev, { ...item, amount: 10 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((marketId: string) => {
    setItems((prev) => prev.filter((i) => i.marketId !== marketId));
  }, []);

  const updateAmount = useCallback((marketId: string, amount: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.marketId === marketId ? { ...i, amount: Math.max(1, amount) } : i,
      ),
    );
  }, []);

  const restoreItem = useCallback((item: SlipItem) => {
    setItems((prev) => {
      const withoutStaleCopy = prev.filter((candidate) => candidate.marketId !== item.marketId);
      return [...withoutStaleCopy, { ...item }];
    });
    setIsOpen(true);
  }, []);

  const clearSlip = useCallback(() => {
    setItems([]);
  }, []);

  const openSlip = useCallback(() => setIsOpen(true), []);
  const closeSlip = useCallback(() => setIsOpen(false), []);
  const toggleSlip = useCallback(() => setIsOpen((prev) => !prev), []);

  const totalStake = useMemo(
    () => items.reduce((sum, i) => sum + i.amount, 0),
    [items],
  );

  const totalPayout = useMemo(
    () => items.reduce((sum, i) => sum + i.amount * i.odds, 0),
    [items],
  );

  const value = useMemo<PredictionSlipContextValue>(
    () => ({
      items,
      totalStake,
      totalPayout,
      itemCount: items.length,
      isOpen,
      openSlip,
      closeSlip,
      toggleSlip,
      addItem,
      removeItem,
      updateAmount,
      restoreItem,
      clearSlip,
    }),
    [
      items,
      totalStake,
      totalPayout,
      isOpen,
      openSlip,
      closeSlip,
      toggleSlip,
      addItem,
      removeItem,
      updateAmount,
      restoreItem,
      clearSlip,
    ],
  );

  return (
    <PredictionSlipContext.Provider value={value}>
      {children}
    </PredictionSlipContext.Provider>
  );
}

export function usePredictionSlip() {
  const context = useContext(PredictionSlipContext);
  if (!context) {
    throw new Error(
      "usePredictionSlip must be used within PredictionSlipProvider",
    );
  }
  return context;
}
