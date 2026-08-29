import { useEffect, useState, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { apiClient, ApiError } from "@/lib/api";
import { useToast } from "./useToast";

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
}

const REFRESH_INTERVAL = 30000; // 30 seconds
const API_TIMEOUT = 5000;

export function useWalletBalance(): UseWalletBalanceReturn {
    const { address, isAuthenticated } = useWallet();
    const toast = useToast();
    const [balance, setBalance] = useState<WalletBalance | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previousAddressRef = useRef<string | null>(null);

    const fetchBalance = useCallback(async () => {
        if (!address || !isAuthenticated) {
            setBalance(null);
            setError(null);
            return;
        }

        setLoading(true);
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
            if (balance !== null && !(err instanceof Error && err.message.includes("aborted"))) {
                toast.error(errorMessage);
            }
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
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

    // Initial fetch and interval refresh
    useEffect(() => {
        fetchBalance();
        const intervalId = setInterval(fetchBalance, REFRESH_INTERVAL);
        return () => clearInterval(intervalId);
    }, [fetchBalance]);

    return {
        balance,
        loading,
        error,
        refetch: fetchBalance,
    };
}
