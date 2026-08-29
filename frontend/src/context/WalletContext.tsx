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
import { useRouter } from "next/navigation";

import ConnectWalletModal from "@/component/ConnectWalletModal";

export interface AuthUser {
  username: string;
  avatarUrl?: string;
  bio?: string;
}

export type WalletError =
  | "not_installed"
  | "locked"
  | "user_rejected"
  | "wrong_network"
  | "disconnected"
  | "account_switched"
  | "unknown";

export interface WalletErrorState {
  type: WalletError;
  message: string;
  retryable: boolean;
}

export interface WalletContextValue {
  // Wallet state
  isFreighterInstalled: boolean;
  address: string | null;
  network: string | null;

  // Auth state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isRestoring: boolean;
  user: AuthUser | null;
  token: string | null;
  authError: string | null;
  walletError: WalletErrorState | null;

  // Actions
  openConnectModal: () => void;
  closeConnectModal: () => void;
  isConnectModalOpen: boolean;
  authenticate: (
    address: string,
    signMessage: (msg: string) => Promise<string | null>,
  ) => Promise<boolean>;
  logout: () => void;
  retry: () => Promise<void>;
  clearError: () => void;
}

const DEFAULT_CONTEXT_VALUE: WalletContextValue = {
  isFreighterInstalled: false,
  address: null,
  network: null,
  isAuthenticated: false,
  isAuthenticating: false,
  isRestoring: false,
  user: null,
  token: null,
  authError: null,
  walletError: null,
  openConnectModal: () => { },
  closeConnectModal: () => { },
  isConnectModalOpen: false,
  authenticate: async () => false,
  logout: () => { },
  retry: async () => { },
  clearError: () => { },
};

// Persisted wallet session — id/type + public key only, never secret material.
const WALLET_STORAGE_KEY = "insightarena.wallet.v1";

interface StoredWalletSession {
  walletId: string;
  address: string;
  network: string;
}

// Helper to classify errors
function classifyWalletError(error: unknown): WalletErrorState {
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (errorMsg.includes("not installed") || errorMsg.includes("not available")) {
    return {
      type: "not_installed",
      message: "Wallet extension not installed",
      retryable: false,
    };
  }

  if (errorMsg.includes("locked")) {
    return {
      type: "locked",
      message: "Wallet is locked. Please unlock it and try again.",
      retryable: true,
    };
  }

  if (
    errorMsg.includes("cancel") ||
    errorMsg.includes("reject") ||
    errorMsg.includes("denied") ||
    errorMsg.includes("user closed")
  ) {
    return {
      type: "user_rejected",
      message: "Connection request was rejected",
      retryable: true,
    };
  }

  if (errorMsg.includes("network") || errorMsg.includes("testnet") || errorMsg.includes("public")) {
    return {
      type: "wrong_network",
      message: "Please switch to the correct network in your wallet",
      retryable: true,
    };
  }

  if (errorMsg.includes("disconnect") || errorMsg.includes("connection lost")) {
    return {
      type: "disconnected",
      message: "Wallet connection lost",
      retryable: true,
    };
  }

  if (errorMsg.includes("account") && errorMsg.includes("changed")) {
    return {
      type: "account_switched",
      message: "Wallet account was switched",
      retryable: false,
    };
  }

  return {
    type: "unknown",
    message: error instanceof Error ? error.message : "Connection failed. Please try again.",
    retryable: true,
  };
}

function readStoredSession(): StoredWalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredWalletSession> | null;
    if (
      !parsed ||
      typeof parsed.walletId !== "string" ||
      typeof parsed.address !== "string" ||
      typeof parsed.network !== "string"
    ) {
      window.localStorage.removeItem(WALLET_STORAGE_KEY);
      return null;
    }

    return { walletId: parsed.walletId, address: parsed.address, network: parsed.network };
  } catch {
    // Corrupted/old-format value — clear rather than throw.
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: StoredWalletSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable/full — persistence is best-effort.
  }
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const WalletContext = createContext<WalletContextValue>(DEFAULT_CONTEXT_VALUE);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<WalletErrorState | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const walletKitRef = useRef<any>(null);
  const accountCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    // Detect any Stellar wallet via the kit, then attempt a silent
    // reconnect if a session was persisted from a previous visit.
    Promise.all([
      import("@creit-tech/stellar-wallets-kit/sdk"),
      import("@creit-tech/stellar-wallets-kit/types"),
      import("@creit-tech/stellar-wallets-kit/modules/freighter"),
      import("@creit-tech/stellar-wallets-kit/modules/xbull"),
      import("@creit-tech/stellar-wallets-kit/modules/albedo"),
    ])
      .then(
        async ([
          { StellarWalletsKit },
          { Networks },
          { FreighterModule, FREIGHTER_ID },
          { xBullModule },
          { AlbedoModule },
        ]) => {
          const networkMode = Networks.PUBLIC;

          StellarWalletsKit.init({
            network: networkMode,
            selectedWalletId: FREIGHTER_ID,
            modules: [
              new FreighterModule(),
              new xBullModule(),
              new AlbedoModule(),
            ],
          });

          walletKitRef.current = StellarWalletsKit;

          const wallets = await StellarWalletsKit.refreshSupportedWallets();
          if (cancelled) return;
          setIsFreighterInstalled(wallets.some((w) => w.isAvailable));
          setNetwork(networkMode);

          const stored = readStoredSession();
          if (!stored) return;

          // Verify network matches
          if (stored.network !== networkMode) {
            clearStoredSession();
            setWalletError({
              type: "wrong_network",
              message: "Network mismatch. Please reconnect your wallet.",
              retryable: true,
            });
            return;
          }

          try {
            StellarWalletsKit.setWallet(stored.walletId);
            const { address: restoredAddress } =
              await StellarWalletsKit.fetchAddress();
            if (cancelled) return;

            if (!restoredAddress) {
              clearStoredSession();
              return;
            }

            // Check if account has changed
            if (restoredAddress !== stored.address) {
              clearStoredSession();
              setWalletError({
                type: "account_switched",
                message: "Wallet account has changed. Please reconnect.",
                retryable: false,
              });
              return;
            }

            setAddress(restoredAddress);
            setToken(`wallet_${restoredAddress}`);
            setUser({ username: "Alex" });
            writeStoredSession({
              walletId: stored.walletId,
              address: restoredAddress,
              network: networkMode,
            });
          } catch (error) {
            // Wallet extension rejected/unavailable — fall back to
            // disconnected state silently, no error toast.
            if (!cancelled) {
              clearStoredSession();
              const walletErr = classifyWalletError(error);
              // Only show error for non-user-rejection errors
              if (walletErr.type !== "user_rejected") {
                setWalletError(walletErr);
              }
            }
          }
        },
      )
      .catch((error) => {
        if (!cancelled) {
          setIsFreighterInstalled(false);
          setWalletError(classifyWalletError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Monitor account changes while connected
  useEffect(() => {
    if (!address || !walletKitRef.current || typeof window === "undefined") {
      // Clear interval if disconnected
      if (accountCheckIntervalRef.current) {
        clearInterval(accountCheckIntervalRef.current);
        accountCheckIntervalRef.current = null;
      }
      return;
    }

    // Poll for account changes every 3 seconds
    accountCheckIntervalRef.current = setInterval(async () => {
      try {
        const { address: currentAddress } = await walletKitRef.current.fetchAddress();

        if (currentAddress !== address) {
          // Account was switched
          if (accountCheckIntervalRef.current) {
            clearInterval(accountCheckIntervalRef.current);
            accountCheckIntervalRef.current = null;
          }

          // Clear everything
          setAddress(null);
          setToken(null);
          setUser(null);
          clearStoredSession();

          setWalletError({
            type: "account_switched",
            message: "Wallet account was switched. Please reconnect.",
            retryable: false,
          });
        }
      } catch (error) {
        // Wallet disconnected or locked
        if (accountCheckIntervalRef.current) {
          clearInterval(accountCheckIntervalRef.current);
          accountCheckIntervalRef.current = null;
        }

        const walletErr = classifyWalletError(error);
        if (walletErr.type === "locked" || walletErr.type === "disconnected") {
          setAddress(null);
          setToken(null);
          setUser(null);
          clearStoredSession();
          setWalletError(walletErr);
        }
      }
    }, 3000);

    return () => {
      if (accountCheckIntervalRef.current) {
        clearInterval(accountCheckIntervalRef.current);
        accountCheckIntervalRef.current = null;
      }
    };
  }, [address]);

  // wallet connected = authenticated (no backend needed)
  const isAuthenticated = useMemo(() => Boolean(address), [address]);

  const openConnectModal = useCallback(() => {
    setAuthError(null);
    setIsConnectModalOpen(true);
  }, []);

  const closeConnectModal = useCallback(() => {
    setIsConnectModalOpen(false);
  }, []);

  const authenticate = useCallback<WalletContextValue["authenticate"]>(
    async (walletAddress, signMessage) => {
      setIsAuthenticating(true);
      setAuthError(null);

      try {
        const challenge = `arena_challenge_${Date.now()}`;
        const signature = await signMessage(challenge);
        if (!signature) {
          setAuthError("Authentication failed: signature was not provided.");
          return false;
        }

        setAddress(walletAddress);
        setToken(`mock_jwt_${btoa(signature).slice(0, 24)}`);
        setUser({ username: "Alex" });
        return true;
      } catch (error) {
        console.error("Wallet authentication failed:", error);
        setAuthError("Authentication failed. Please try again.");
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    // Clear monitoring interval
    if (accountCheckIntervalRef.current) {
      clearInterval(accountCheckIntervalRef.current);
      accountCheckIntervalRef.current = null;
    }

    setAddress(null);
    setUser(null);
    setToken(null);
    setAuthError(null);
    setWalletError(null);
    setIsConnectModalOpen(false);
    clearStoredSession();
    router.push("/");
  }, [router]);

  const handleModalSuccess = useCallback(
    (walletAddress: string, walletId: string) => {
      setAddress(walletAddress);
      setToken(`wallet_${walletAddress}`);
      setUser({ username: "Alex" });
      setAuthError(null);
      setWalletError(null);
      setIsConnectModalOpen(false);

      if (network) {
        writeStoredSession({ walletId, address: walletAddress, network });
      }
    },
    [network],
  );

  const retry = useCallback(async () => {
    setWalletError(null);
    setAuthError(null);
    openConnectModal();
  }, [openConnectModal]);

  const clearError = useCallback(() => {
    setWalletError(null);
    setAuthError(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      isFreighterInstalled,
      address,
      network,
      isAuthenticated,
      isAuthenticating,
      isRestoring,
      user,
      token,
      authError,
      walletError,
      openConnectModal,
      closeConnectModal,
      isConnectModalOpen,
      authenticate,
      logout,
      retry,
      clearError,
    }),
    [
      isFreighterInstalled,
      address,
      network,
      isAuthenticated,
      isAuthenticating,
      isRestoring,
      user,
      token,
      authError,
      walletError,
      openConnectModal,
      closeConnectModal,
      isConnectModalOpen,
      authenticate,
      logout,
      retry,
      clearError,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <ConnectWalletModal
        isOpen={isConnectModalOpen}
        onClose={closeConnectModal}
        onSuccess={handleModalSuccess}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export function useOptionalWallet() {
  const context = useContext(WalletContext);
  return context ?? null;
}
