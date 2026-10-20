"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

const ORACLE_ALLOWLIST = new Set([
  "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
]);

interface OracleGuardProps {
  children: ReactNode;
}

export default function OracleGuard({ children }: OracleGuardProps) {
  const router = useRouter();
  const { address, isAuthenticated } = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const normalizedAddress = address?.toUpperCase() ?? "";
  const isOracle =
    isAuthenticated && ORACLE_ALLOWLIST.has(normalizedAddress);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isOracle) {
      router.replace("/");
    }
  }, [isOracle, isHydrated, router]);

  if (!isHydrated || !isOracle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-amber-400" />
          <p className="text-sm text-gray-300">
            Verifying AI Oracle wallet access…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
