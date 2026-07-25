"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface WalletBalance {
    xlm: string | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

/**
 * Fetches and periodically refreshes the XLM balance for a connected wallet.
 * Falls back to a mock balance when the Horizon API is unreachable (dev mode).
 */
export function useWalletBalance(address: string | null): WalletBalance {
    const [xlm, setXlm] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);

    const fetchBalance = useCallback(() => {
        if (!address) {
            setXlm(null);
            setError(null);
            return;
        }

        const gen = ++fetchGenRef.current;
        setLoading(true);
        setError(null);

        const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon.stellar.org";

        fetch(`${horizonUrl}/accounts/${address}`)
            .then((res) => {
                if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
                return res.json() as Promise<{ balances: Array<{ asset_type: string; balance: string }> }>;
            })
            .then((data) => {
                if (gen !== fetchGenRef.current) return;
                const native = data.balances.find((b) => b.asset_type === "native");
                setXlm(native ? native.balance : "0.0000000");
            })
            .catch(() => {
                if (gen !== fetchGenRef.current) return;
                // Dev/offline fallback — show a mock balance so the UI is usable
                setXlm("1,250.0000000");
                setError("Could not reach Horizon. Showing mock balance.");
            })
            .finally(() => {
                if (gen !== fetchGenRef.current) return;
                setLoading(false);
            });
    }, [address]);

    // Fetch on mount and whenever address changes
    useEffect(() => {
        fetchBalance();
    }, [fetchBalance]);

    // Periodic refresh
    useEffect(() => {
        if (!address) return;
        const id = setInterval(fetchBalance, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [address, fetchBalance]);

    return { xlm, loading, error, refresh: fetchBalance };
}
