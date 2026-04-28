import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { AuthGuard } from "@/component/AuthGuard";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardShell>
        <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
          {children}
        </Suspense>
      </DashboardShell>
    </AuthGuard>
  );
}
