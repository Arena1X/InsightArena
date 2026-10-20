import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { AuthGuard } from "@/component/AuthGuard";
import { ProfileGateWrapper } from "@/component/ProfileGateWrapper";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <ProfileGateWrapper>
        <DashboardShell>
          <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
            {children}
          </Suspense>
        </DashboardShell>
      </ProfileGateWrapper>
    </AuthGuard>
  );
}
