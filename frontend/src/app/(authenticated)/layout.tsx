import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { WalletProvider } from "@/context/WalletContext";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { AuthGuard } from "@/component/AuthGuard";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WalletProvider>
      <AuthGuard>
        <DashboardShell>
          <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
            {children}
          </Suspense>
        </DashboardShell>
      </AuthGuard>
    </WalletProvider>
  );
}
