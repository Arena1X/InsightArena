import { useEffect, useState, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { apiClient, ApiError } from "@/lib/api";
import { useToast } from "./useToast";
import { useTransactionTracker } from "./useTransactionTracker";

export interface WalletBalance {
    address: string;
    balance: number;
    displayCurrency: string;
}

interface UseWalletBalanceReturn {
    balance: WalletBalance | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    isRefreshing: boolean; // New: indicates background refresh in progress
}

const REFRESH_INTERVAL = 30000; // 30 seconds
const API_TIMEOUT = 5000;

export function useWalletBalance(): UseWalletBalanceReturn {
    const { address, isAuthenticated } = useWallet();
    const toast = useToast();
    const { transactions } = useTransactionTracker();
    const [balance, setBalance] = useState<WalletBalance | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previousAddressRef = useRef<string | null>(null);
    const previousConfirmedCountRef = useRef(0);

    const fetchBalance = useCallback(async (isBackgroundRefresh = false) => {
        if (!address || !isAuthenticated) {
            setBalance(null);
            setError(null);
            return;
        }

        // Use isRefreshing for background updates, loading for initial fetch
        if (isBackgroundRefresh) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
            const data = await apiClient.get<WalletBalance>(
                `/wallet/${address}/balance`,
                { signal: controller.signal }
            );
            setBalance(data);
        } catch (err) {
            const errorMessage = err instanceof ApiError
                ? err.message
                : "Failed to load wallet balance";

            setError(errorMessage);
            // Only show error toast if it's not a network timeout on initial load
            // and not during a background refresh
            if (balance !== null && !isBackgroundRefresh && !(err instanceof Error && err.message.includes("aborted"))) {
                toast.error(errorMessage);
            }
        } finally {
            clearTimeout(timeoutId);
            if (isBackgroundRefresh) {
                setIsRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [address, isAuthenticated, balance, toast]);

    // Reset balance when address changes (account switch detection)
    useEffect(() => {
        if (previousAddressRef.current !== address) {
            if (previousAddressRef.current !== null && address !== null) {
                // Address changed - clear old balance immediately
                setBalance(null);
                setError(null);
            }
            previousAddressRef.current = address;
        }
    }, [address]);

    // Listen for confirmed transactions and refresh balance (#1579)
    useEffect(() => {
        if (!isAuthenticated) return;

        const confirmedCount = transactions.filter(
            (tx) => tx.status === "confirmed"
        ).length;

        // Only refresh if we have a new confirmation (not on initial mount)
        if (confirmedCount > previousConfirmedCountRef.current && previousConfirmedCountRef.current > 0) {
            // Background refresh without showing main loading state
            fetchBalance(true);
        }

        previousConfirmedCountRef.current = confirmedCount;
    }, [transactions, isAuthenticated, fetchBalance]);

    // Initial fetch and interval refresh
    useEffect(() => {
        fetchBalance();
        const intervalId = setInterval(() => fetchBalance(true), REFRESH_INTERVAL);
        return () => clearInterval(intervalId);
    }, [fetchBalance]);

    return {
        balance,
        loading,
        error,
        refetch: () => fetchBalance(false),
        isRefreshing,
    };
}
