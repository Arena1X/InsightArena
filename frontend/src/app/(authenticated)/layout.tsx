import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardShell>
      <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
        {children}
      </Suspense>
    </DashboardShell>
  );
}
