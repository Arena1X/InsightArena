import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { WalletProvider } from "@/context/WalletContext";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WalletProvider>
      <DashboardShell>
        <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
          {children}
        </Suspense>
      </DashboardShell>
    </WalletProvider>
  );
}
