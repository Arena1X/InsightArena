"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface AuthUser {
  username: string;
}

interface WalletContextType {
  address: string | null;
  user: AuthUser | null;
  logout: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(
    "0x71A42D08022BEe33757145ff8bc6cb38c8950f27"
  );
  const [user, setUser] = useState<AuthUser | null>({ username: "Ayomide" });

  const logout = useCallback(() => {
    setAddress(null);
    setUser(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, user, logout }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}

export function useOptionalWallet() {
  const context = useContext(WalletContext);
  return context ?? null;
}
