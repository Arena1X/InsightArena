"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import PageBackground from "@/component/PageBackground";
import Header from "@/component/Header";
import Footer from "@/component/Footer";

interface ProfileGateWrapperProps {
  children: ReactNode;
}

/**
 * When an unauthenticated user visits /profile, bypass the DashboardShell
 * and render the page directly with the standard public page layout instead.
 * The profile page itself renders the "connect wallet" gate card.
 */
export function ProfileGateWrapper({ children }: ProfileGateWrapperProps) {
  const pathname = usePathname();
  const { isAuthenticated } = useWallet();

  if (pathname === "/profile" && !isAuthenticated) {
    return (
      <PageBackground>
        <Header />
        <main className="min-h-screen pt-20">{children}</main>
        <Footer />
      </PageBackground>
    );
  }

  // Authenticated or not a self-gated route — render normally (DashboardShell wraps)
  return <>{children}</>;
}
