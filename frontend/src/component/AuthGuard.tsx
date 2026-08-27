"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

interface AuthGuardProps {
  children: ReactNode;
}

// Routes that render their own unauthenticated gate instead of redirecting
const SELF_GATED_ROUTES = ["/profile"];

export interface ProfileGateConfig {
  /** Critical gates block the page until the profile is complete; others can be dismissed for now. */
  critical: boolean;
}

// Authenticated routes that additionally require a complete profile before
// their content is useful. Routes not listed here are never profile-gated.
export const PROFILE_GATED_ROUTES: Record<string, ProfileGateConfig> = {
  "/my-markets": { critical: true },
  "/creator-events": { critical: true },
  "/competitions": { critical: false },
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const isSelfGated = SELF_GATED_ROUTES.includes(pathname);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated && !isSelfGated) {
      router.replace("/");
    }
  }, [isHydrated, isAuthenticated, isSelfGated, router]);

  // Self-gated pages (e.g. /profile): always render immediately — they show
  // their own "connect wallet" UI when unauthenticated
  if (isSelfGated) {
    return <>{children}</>;
  }

  // All other protected routes: show spinner until hydrated and authenticated
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-orange-400" />
      </div>
    );
  }

  return <>{children}</>;
}
