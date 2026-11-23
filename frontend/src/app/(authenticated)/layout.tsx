import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/component/dashboard-shell";
import { AuthenticatedPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { AuthGuard } from "@/component/AuthGuard";
import { ProfileGateWrapper } from "@/component/ProfileGateWrapper";
import { RouteBreadcrumb } from "@/component/ui/breadcrumb";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <ProfileGateWrapper>
        <DashboardShell>
          <RouteBreadcrumb />
          <Suspense fallback={<AuthenticatedPageLoadingSkeleton />}>
            {children}
          </Suspense>
        </DashboardShell>
      </ProfileGateWrapper>
    </AuthGuard>
  );
}
