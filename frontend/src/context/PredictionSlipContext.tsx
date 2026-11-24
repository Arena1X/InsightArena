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

export const DEFAULT_MAX_SLIP_ITEMS = 10;

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
  maxItems: number;
  slipError: string | null;
  clearSlipError: () => void;
  isOpen: boolean;
  openSlip: () => void;
  closeSlip: () => void;
  toggleSlip: () => void;
  addItem: (item: Omit<SlipItem, "amount">) => boolean;
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
  maxItems: DEFAULT_MAX_SLIP_ITEMS,
  slipError: null,
  clearSlipError: () => {},
  isOpen: false,
  openSlip: () => {},
  closeSlip: () => {},
  toggleSlip: () => {},
  addItem: () => false,
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
  }
}

export function PredictionSlipProvider({
  children,
  maxItems = DEFAULT_MAX_SLIP_ITEMS,
}: {
  children: React.ReactNode;
  maxItems?: number;
}) {
  const effectiveMaxItems = Math.max(1, Math.floor(maxItems));
  const [items, setItems] = useState<SlipItem[]>([]);
  const itemsRef = useRef<SlipItem[]>([]);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredSlip().slice(0, effectiveMaxItems);
    if (stored.length > 0) {
      itemsRef.current = stored;
      setItems(stored);
    }
    setHydrated(true);
  }, [effectiveMaxItems]);

  useEffect(() => {
    if (hydrated) {
      writeStoredSlip(items);
    }
  }, [items, hydrated]);

  const clearSlipError = useCallback(() => {
    setSlipError(null);
  }, []);

  const addItem = useCallback(
    (item: Omit<SlipItem, "amount">): boolean => {
      const current = itemsRef.current;
      const existing = current.find((i) => i.marketId === item.marketId);
      if (existing) {
        const next = current.map((i) =>
          i.marketId === item.marketId
            ? { ...i, outcome: item.outcome, odds: item.odds }
            : i,
        );
        itemsRef.current = next;
        setItems(next);
        setSlipError(null);
        setIsOpen(true);
        return true;
      }

      if (current.length >= effectiveMaxItems) {
        setSlipError(
          `Maximum of ${effectiveMaxItems} item${effectiveMaxItems === 1 ? "" : "s"} allowed in the prediction slip. Remove an item to add another.`,
        );
        return false;
      }

      const next = [...current, { ...item, amount: 10 }];
      itemsRef.current = next;
      setItems(next);
      setSlipError(null);
      setIsOpen(true);
      return true;
    },
    [effectiveMaxItems],
  );

  const removeItem = useCallback((marketId: string) => {
    const next = itemsRef.current.filter((i) => i.marketId !== marketId);
    itemsRef.current = next;
    setItems(next);
    setSlipError(null);
  }, []);

  const updateAmount = useCallback((marketId: string, amount: number) => {
    const next = itemsRef.current.map((i) =>
      i.marketId === marketId ? { ...i, amount: Math.max(1, amount) } : i,
    );
    itemsRef.current = next;
    setItems(next);
  }, []);

  const restoreItem = useCallback(
    (item: SlipItem) => {
      const withoutStaleCopy = itemsRef.current.filter(
        (candidate) => candidate.marketId !== item.marketId,
      );
      if (withoutStaleCopy.length >= effectiveMaxItems) {
        setSlipError(
          `Maximum of ${effectiveMaxItems} item${effectiveMaxItems === 1 ? "" : "s"} allowed in the prediction slip. Remove an item to add another.`,
        );
        return;
      }
      const next = [...withoutStaleCopy, { ...item }];
      itemsRef.current = next;
      setItems(next);
      setSlipError(null);
      setIsOpen(true);
    },
    [effectiveMaxItems],
  );

  const clearSlip = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
    setSlipError(null);
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
      maxItems: effectiveMaxItems,
      slipError,
      clearSlipError,
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
      effectiveMaxItems,
      slipError,
      clearSlipError,
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
