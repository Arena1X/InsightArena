"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, openConnectModal } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated) {
      openConnectModal();
      router.replace("/");
    }
  }, [isHydrated, isAuthenticated, openConnectModal, router]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#4FD1C5]/20 border-t-[#4FD1C5]" />
          <p className="text-sm text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
