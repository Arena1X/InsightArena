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
}

export interface WalletContextValue {
  // Wallet state
  isFreighterInstalled: boolean;
  address: string | null;

  // Auth state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
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
  user: null,
  token: null,
  authError: null,
  openConnectModal: () => {},
  closeConnectModal: () => {},
  isConnectModalOpen: false,
  authenticate: async () => false,
  logout: () => {},
};

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Detect any Stellar wallet via the kit
    Promise.all([
      import("@creit-tech/stellar-wallets-kit/sdk"),
      import("@creit-tech/stellar-wallets-kit/types"),
      import("@creit-tech/stellar-wallets-kit/modules/freighter"),
      import("@creit-tech/stellar-wallets-kit/modules/xbull"),
      import("@creit-tech/stellar-wallets-kit/modules/albedo"),
    ])
      .then(
        ([
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
          return StellarWalletsKit.refreshSupportedWallets();
        },
      )
      .then((wallets) => {
        setIsFreighterInstalled(wallets.some((w) => w.isAvailable));
      })
      .catch(() => setIsFreighterInstalled(false));
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
    router.push("/");
  }, []);

  const handleModalSuccess = useCallback(
    (walletAddress: string, _jwt: string) => {
      setAddress(walletAddress);
      setToken(`wallet_${walletAddress}`);
      setUser({ username: "Alex" });
      setAuthError(null);
      setIsConnectModalOpen(false);
      router.push("/dashboard");
    },
    [router],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      isFreighterInstalled,
      address,
      isAuthenticated,
      isAuthenticating,
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
