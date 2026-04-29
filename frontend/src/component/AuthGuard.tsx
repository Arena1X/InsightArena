"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Wait for client hydration
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-orange-400" />
      </div>
    );
  }

  // Profile page is allowed through unauthenticated — it handles its own gate
  if (!isAuthenticated && pathname === "/profile") {
    return <>{children}</>;
  }

  // All other protected routes: redirect to home
  if (!isAuthenticated) {
    router.replace("/");
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-orange-400" />
      </div>
    );
  }

  return <>{children}</>;
}
