"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

const ADMIN_ALLOWLIST = new Set([
  "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
]);

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { address, isAuthenticated } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const normalizedAddress = address?.toUpperCase() ?? "";
  const isAdmin = isAuthenticated && ADMIN_ALLOWLIST.has(normalizedAddress);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, isHydrated, router]);

  if (!isHydrated || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-orange-400" />
          <p className="text-sm text-gray-300">Verifying admin wallet access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
