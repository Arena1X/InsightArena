"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import ConnectWalletModal from "@/component/ConnectWalletModal";

export interface AuthUser {
  username: string;
  avatarUrl?: string;
  bio?: string;
}

export interface WalletContextValue {
  // Wallet state
  isFreighterInstalled: boolean;
  address: string | null;

  // Auth state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isRestoring: boolean;
  user: AuthUser | null;
  token: string | null;
  authError: string | null;

  // Actions
  openConnectModal: () => void;
  closeConnectModal: () => void;
  isConnectModalOpen: boolean;
  authenticate: (
    address: string,
    signMessage: (msg: string) => Promise<string | null>,
  ) => Promise<boolean>;
  logout: () => void;
}

const DEFAULT_CONTEXT_VALUE: WalletContextValue = {
  isFreighterInstalled: false,
  address: null,
  isAuthenticated: false,
  isAuthenticating: false,
  isRestoring: false,
  user: null,
  token: null,
  authError: null,
  openConnectModal: () => {},
  closeConnectModal: () => {},
  isConnectModalOpen: false,
  authenticate: async () => false,
  logout: () => {},
};

// Persisted wallet session — id/type + public key only, never secret material.
const WALLET_STORAGE_KEY = "insightarena.wallet.v1";

interface StoredWalletSession {
  walletId: string;
  address: string;
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
      typeof parsed.address !== "string"
    ) {
      window.localStorage.removeItem(WALLET_STORAGE_KEY);
      return null;
    }

    return { walletId: parsed.walletId, address: parsed.address };
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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

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
          StellarWalletsKit.init({
            network: Networks.PUBLIC,
            selectedWalletId: FREIGHTER_ID,
            modules: [
              new FreighterModule(),
              new xBullModule(),
              new AlbedoModule(),
            ],
          });

          const wallets = await StellarWalletsKit.refreshSupportedWallets();
          if (cancelled) return;
          setIsFreighterInstalled(wallets.some((w) => w.isAvailable));

          const stored = readStoredSession();
          if (!stored) return;

          try {
            StellarWalletsKit.setWallet(stored.walletId);
            const { address: restoredAddress } =
              await StellarWalletsKit.fetchAddress();
            if (cancelled) return;

            if (!restoredAddress) {
              clearStoredSession();
              return;
            }

            setAddress(restoredAddress);
            setToken(`wallet_${restoredAddress}`);
            setUser({ username: "Alex" });
            writeStoredSession({
              walletId: stored.walletId,
              address: restoredAddress,
            });
          } catch {
            // Wallet extension rejected/unavailable — fall back to
            // disconnected state silently, no error toast.
            if (!cancelled) clearStoredSession();
          }
        },
      )
      .catch(() => {
        if (!cancelled) setIsFreighterInstalled(false);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    setAddress(null);
    setUser(null);
    setToken(null);
    setAuthError(null);
    setIsConnectModalOpen(false);
    clearStoredSession();
    router.push("/");
  }, []);

  const handleModalSuccess = useCallback(
    (walletAddress: string, walletId: string) => {
      setAddress(walletAddress);
      setToken(`wallet_${walletAddress}`);
      setUser({ username: "Alex" });
      setAuthError(null);
      setIsConnectModalOpen(false);
      writeStoredSession({ walletId, address: walletAddress });
    },
    [],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      isFreighterInstalled,
      address,
      isAuthenticated,
      isAuthenticating,
      isRestoring,
      user,
      token,
      authError,
      openConnectModal,
      closeConnectModal,
      isConnectModalOpen,
      authenticate,
      logout,
    }),
    [
      isFreighterInstalled,
      address,
      isAuthenticated,
      isAuthenticating,
      isRestoring,
      user,
      token,
      authError,
      openConnectModal,
      closeConnectModal,
      isConnectModalOpen,
      authenticate,
      logout,
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
