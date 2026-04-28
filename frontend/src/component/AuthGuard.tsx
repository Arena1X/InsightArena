"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isConnectModalOpen, openConnectModal } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Don't redirect while the connect modal is open or user is already authenticated
    if (!isAuthenticated && !isConnectModalOpen) {
      openConnectModal();
      router.replace("/");
    }
  }, [
    isHydrated,
    isAuthenticated,
    isConnectModalOpen,
    openConnectModal,
    router,
  ]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141824]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#4FD1C5]/20 border-t-[#4FD1C5]" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
