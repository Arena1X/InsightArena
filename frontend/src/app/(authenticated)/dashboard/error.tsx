"use client";

import { RouteErrorState } from "@/component/route-error-state";

type DashboardErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardErrorPage({
  error,
  reset,
}: DashboardErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Dashboard"
      description="The dashboard couldn't finish loading. Retry to restore your latest account overview."
      fullScreen={false}
    />
  );
}
